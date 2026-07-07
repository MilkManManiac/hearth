import {
  DEFAULT_CROSSFADE_MS,
  DUCK_LINEAR,
  type AmbienceLayer,
  type MusicTrack,
  type Scene,
  type SfxItem
} from '../../shared/types'

const DEFAULT_MUSIC_VOL = 0.7
const DEFAULT_AMB_VOL = 0.4
const DEFAULT_SFX_VOL = 0.9

// Loudness normalization target: -18 dBFS RMS. Every decoded asset gets a
// gain nudging its whole-file RMS toward this, so imports mastered at wildly
// different levels play at a consistent perceived volume.
const NORM_TARGET_RMS = Math.pow(10, -18 / 20) // ≈ 0.126
const NORM_GAIN_MIN = 0.25
const NORM_GAIN_MAX = 4

/** A decoded asset plus its precomputed loudness-normalization gain. */
interface DecodedAudio {
  buffer: AudioBuffer
  /** Multiplier applied to every source playing this buffer (see computeNormGain). */
  norm: number
}

/**
 * Compute a loudness-normalization gain for a buffer: one linear pass
 * accumulating mean-square (averaged across channels) and absolute peak.
 *
 * ponytail: whole-file RMS stands in for true perceived loudness. Upgrade
 * path is K-weighted LUFS / EBU R128 (e.g. a small loudness lib) if RMS ever
 * feels wrong on real material — the cache shape here wouldn't change.
 *
 * The gain is target/rms, clamped to [NORM_GAIN_MIN, NORM_GAIN_MAX] so
 * quiet-but-intentional material isn't boosted absurdly, and additionally
 * capped so peak * gain <= 1 (never boost into clipping).
 */
function computeNormGain(buffer: AudioBuffer): number {
  let sumSquares = 0
  let peak = 0
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < data.length; i++) {
      const s = data[i]
      sumSquares += s * s
      const a = Math.abs(s)
      if (a > peak) peak = a
    }
  }
  const totalSamples = buffer.length * buffer.numberOfChannels
  const rms = totalSamples > 0 ? Math.sqrt(sumSquares / totalSamples) : 0
  if (rms <= 0 || peak <= 0) return 1 // silent buffer — nothing to normalize
  let gain = NORM_TARGET_RMS / rms
  gain = Math.min(Math.max(gain, NORM_GAIN_MIN), NORM_GAIN_MAX)
  gain = Math.min(gain, 1 / peak)
  return gain
}

/** Build an asset:/// URL, encoding each path segment. */
function assetUrl(file: string): string {
  return `asset:///${file.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * AudioWorklet processor for the Discord tap: interleaves the master mix into
 * 960-frame (20ms @ 48kHz) Int16 stereo chunks and posts them (transferred).
 * Kept as an inline Blob so the bundler needs no worklet-specific handling.
 */
const TAP_WORKLET_SRC = `
class HearthTap extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Int16Array(960 * 2)
    this.pos = 0
  }
  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const L = input[0]
    const R = input[1] || input[0]
    for (let i = 0; i < L.length; i++) {
      let l = L[i]; if (l > 1) l = 1; else if (l < -1) l = -1
      let r = R[i]; if (r > 1) r = 1; else if (r < -1) r = -1
      this.buf[this.pos * 2] = (l * 32767) | 0
      this.buf[this.pos * 2 + 1] = (r * 32767) | 0
      if (++this.pos === 960) {
        this.port.postMessage(this.buf.buffer, [this.buf.buffer])
        this.buf = new Int16Array(960 * 2)
        this.pos = 0
      }
    }
    return true
  }
}
registerProcessor('hearth-tap', HearthTap)
`

interface ActiveMusic {
  trackId: string
  source: AudioBufferSourceNode
  gain: GainNode
  /** Loudness-normalization multiplier baked into gain; live volume edits re-apply it. */
  norm: number
  /** ctx.currentTime when the source started (for progress). */
  startedAt: number
  duration: number
  loop: boolean
  /** Per-track fade-out (sec) to honor when transitioning away, if authored. */
  fadeOutSec: number | null
  /** Auto-advance timer (playlist mode), cleared when the track is superseded. */
  endTimer: number | null
}

export interface MusicProgress {
  trackId: string
  /** Seconds into the track (wraps when looping). */
  elapsed: number
  duration: number
}

export interface SwitchMusicOptions {
  /** Override the track's loop flag (playlist mode plays tracks once). */
  loop?: boolean
  /**
   * Called shortly before a non-looping track's natural end (its fade-out
   * point) so the caller can crossfade into the next one. Not called on manual
   * stop/switch.
   */
  onEnding?: () => void
}

interface ActiveAmbience {
  file: string
  source: AudioBufferSourceNode
  gain: GainNode
  /** Loudness-normalization multiplier baked into gain; live volume edits re-apply it. */
  norm: number
}

export interface EngineStatus {
  activeMusicId: string | null
  ambienceFiles: string[]
  /** Ids of SFX currently sustained as a loop. */
  loopingSfxIds: string[]
  masterVolume: number
  musicVolume: number
  ambienceVolume: number
  sfxVolume: number
  ducked: boolean
}

type Listener = (status: EngineStatus) => void
type ErrorListener = (message: string) => void

/**
 * Single Web Audio graph for a session:
 *
 *   music source → trackGain ┐
 *                            musicDuck → musicBus ┐
 *   ambience source → ambGain → ambienceBus ──────┼→ master → destination
 *   sfx source → sfxGain → sfxBus ─────────────────┘
 *
 * musicBus carries the user's music volume; musicDuck is dipped while SFX play.
 * Every per-source gain is (authored volume × the buffer's loudness-
 * normalization multiplier, see computeNormGain) so imports play at a
 * consistent perceived level.
 */
export class AudioEngine {
  private ctx: AudioContext
  private master: GainNode
  private musicBus: GainNode
  private musicDuck: GainNode
  private ambienceBus: GainNode
  private sfxBus: GainNode

  private buffers = new Map<string, Promise<DecodedAudio>>()
  // Decode-cache LRU bookkeeping. Eviction only drops the *cache* entry — any
  // playing source keeps its own reference to the AudioBuffer, so evicting
  // never interrupts audio; the file just re-decodes on its next play.
  private cacheUse = new Map<string, number>()
  private cacheBytes = new Map<string, number>()
  private cacheTotal = 0
  private cacheSeq = 0
  /** In-flight one-shot SFX (non-looping), so stopAll can silence them too. */
  private activeOneShots = new Set<{ source: AudioBufferSourceNode; gain: GainNode }>
  private activeMusic: ActiveMusic | null = null
  private activeAmbience: ActiveAmbience[] = []
  /** Sustained looping SFX, keyed by sfx id (tap to start, tap to stop). */
  private activeSfxLoops = new Map<
    string,
    { source: AudioBufferSourceNode; gain: GainNode; norm: number }
  >()
  private duckCount = 0

  // Monotonic "intent" counters. Any operation that changes what music /
  // ambience *should* be playing bumps its counter; an in-flight async load
  // that discovers it has been superseded (a newer click, a scene switch, or a
  // stop) bails instead of starting a now-stale source. This is what stops
  // rapid clicks from stacking overlapping tracks.
  private musicIntent = 0
  private ambienceIntent = 0

  private masterVolume = 0.9
  private musicVolume = 1
  private ambienceVolume = 1
  private sfxVolume = 1

  private listeners = new Set<Listener>()
  private errorListeners = new Set<ErrorListener>()

  constructor() {
    // Pinned to 48 kHz: Discord voice is 48 kHz, so the bridge tap needs no
    // resampling; decodeAudioData resamples assets to the context rate anyway.
    this.ctx = new AudioContext({ sampleRate: 48000 })
    this.master = this.ctx.createGain()
    this.musicBus = this.ctx.createGain()
    this.musicDuck = this.ctx.createGain()
    this.ambienceBus = this.ctx.createGain()
    this.sfxBus = this.ctx.createGain()

    this.master.gain.value = this.masterVolume
    this.musicBus.gain.value = this.musicVolume
    this.musicDuck.gain.value = 1
    this.ambienceBus.gain.value = this.ambienceVolume
    this.sfxBus.gain.value = this.sfxVolume

    this.musicDuck.connect(this.musicBus)
    this.musicBus.connect(this.master)
    this.ambienceBus.connect(this.master)
    this.sfxBus.connect(this.master)
    this.master.connect(this.ctx.destination)
  }

  private get now(): number {
    return this.ctx.currentTime
  }

  /** Browsers start the context suspended; call this from a user gesture. */
  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume()
      } catch {
        /* ignore */
      }
    }
  }

  /** Decoded-audio budget: ~48kHz stereo float ≈ 23 MB/min, so this holds a
   *  couple hours of material. Past it, least-recently-used entries drop. */
  private static readonly CACHE_BUDGET = 384 * 1024 * 1024

  private getBuffer(file: string): Promise<DecodedAudio> {
    this.cacheUse.set(file, ++this.cacheSeq)
    let p = this.buffers.get(file)
    if (!p) {
      p = fetch(assetUrl(file))
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status} for ${assetUrl(file)}`)
          const bytes = await r.arrayBuffer()
          try {
            const buffer = await this.ctx.decodeAudioData(bytes)
            // Loudness measured once at decode and cached with the buffer, so
            // every play path (music, ambience, SFX, preview) gets it free.
            const size = buffer.length * buffer.numberOfChannels * 4
            this.cacheBytes.set(file, size)
            this.cacheTotal += size
            this.evictIfOverBudget(file)
            return { buffer, norm: computeNormGain(buffer) }
          } catch (e) {
            throw new Error(`decode failed (${(e as Error)?.message || 'unknown'})`)
          }
        })
        .catch((e) => {
          console.error('[audio] load failed:', file, e)
          throw e
        })
      p.catch(() => this.dropCacheEntry(file)) // allow retry on failure
      this.buffers.set(file, p)
    }
    return p
  }

  private dropCacheEntry(file: string): void {
    this.buffers.delete(file)
    this.cacheUse.delete(file)
    const size = this.cacheBytes.get(file)
    if (size !== undefined) {
      this.cacheTotal -= size
      this.cacheBytes.delete(file)
    }
  }

  /** LRU-evict decoded audio past the budget (never the file just loaded). */
  private evictIfOverBudget(justLoaded: string): void {
    if (this.cacheTotal <= AudioEngine.CACHE_BUDGET) return
    const byAge = [...this.cacheUse.entries()]
      .filter(([f]) => f !== justLoaded && this.cacheBytes.has(f))
      .sort((a, b) => a[1] - b[1])
    for (const [file] of byAge) {
      if (this.cacheTotal <= AudioEngine.CACHE_BUDGET) break
      this.dropCacheEntry(file)
    }
  }

  /** Warm the decode cache for a scene's assets so live triggering is snappy. */
  prewarm(scene: Scene): void {
    const files = [
      ...(scene.music ?? []).map((m) => m.file),
      ...(scene.ambience ?? []).map((a) => a.file),
      ...(scene.sfx ?? []).map((s) => s.file)
    ]
    for (const f of files) this.getBuffer(f).catch(() => undefined)
  }

  async loadScene(scene: Scene): Promise<void> {
    await this.resume()
    const fade = scene.transition?.crossfadeMs ?? DEFAULT_CROSSFADE_MS
    const def = scene.music?.find((m) => m.default) ?? null
    if (def) {
      await this.switchMusic(def, fade)
    } else {
      this.stopMusic(fade)
    }
    // Only autoplay beds start with the scene; script-driven beds (autoplay:
    // false) wait for their {{amb:...}} cue or a tap in the mixer.
    await this.setAmbience((scene.ambience ?? []).filter((a) => a.autoplay !== false), fade)
  }

  async switchMusic(
    track: MusicTrack,
    crossfadeMs = DEFAULT_CROSSFADE_MS,
    opts?: SwitchMusicOptions
  ): Promise<void> {
    await this.resume()
    if (this.activeMusic?.trackId === track.id) return
    const seq = ++this.musicIntent
    let buffer: AudioBuffer
    let norm: number
    try {
      ;({ buffer, norm } = await this.getBuffer(track.file))
    } catch (err) {
      this.emitError(`Music "${track.label ?? track.file}": ${(err as Error).message}`)
      return
    }
    // A newer switch/stop happened while we were decoding — abandon this one
    // rather than starting a track the DM has already clicked away from.
    if (seq !== this.musicIntent) return
    const fadeIn = Math.max(track.fadeInMs ?? crossfadeMs, 1) / 1000
    const fadeOutOld = Math.max(crossfadeMs, 1) / 1000
    const target = (track.volume ?? DEFAULT_MUSIC_VOL) * norm
    const t = this.now

    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(target, t + fadeIn)
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    const loop = opts?.loop ?? track.loop !== false
    source.loop = loop
    source.connect(gain)
    gain.connect(this.musicDuck)
    source.start()

    // The outgoing track's authored fadeOutMs wins over the incoming crossfade.
    this.fadeOutAndStop(this.activeMusic, this.activeMusic?.fadeOutSec ?? fadeOutOld)

    // Playlist mode: fire onEnding at the track's fade-out point so the next
    // track crossfades in as this one ends. Timer-based (not source.onended)
    // so a manual switch/stop — which clears the timer — never double-fires.
    let endTimer: number | null = null
    if (!loop && opts?.onEnding) {
      const fadeOutSelf = Math.max(track.fadeOutMs ?? crossfadeMs, 1) / 1000
      const delayMs = Math.max((buffer.duration - fadeOutSelf) * 1000, 0)
      const cb = opts.onEnding
      endTimer = window.setTimeout(() => {
        // Only advance if this track is still the active one.
        if (this.activeMusic?.trackId === track.id && seq === this.musicIntent) cb()
      }, delayMs)
    }

    this.activeMusic = {
      trackId: track.id,
      source,
      gain,
      norm,
      startedAt: t,
      duration: buffer.duration,
      loop,
      fadeOutSec: track.fadeOutMs !== undefined ? Math.max(track.fadeOutMs, 1) / 1000 : null,
      endTimer
    }
    this.emit()
  }

  stopMusic(crossfadeMs = DEFAULT_CROSSFADE_MS): void {
    this.musicIntent++ // cancel any in-flight switch
    this.fadeOutAndStop(this.activeMusic, Math.max(crossfadeMs, 1) / 1000)
    this.activeMusic = null
    this.emit()
  }

  /** Live progress of the current music track, for the now-playing strip. */
  musicProgress(): MusicProgress | null {
    const m = this.activeMusic
    if (!m || m.duration <= 0) return null
    const raw = this.now - m.startedAt
    return {
      trackId: m.trackId,
      elapsed: m.loop ? raw % m.duration : Math.min(raw, m.duration),
      duration: m.duration
    }
  }

  private fadeOutAndStop(node: ActiveMusic | ActiveAmbience | null, fadeSec: number): void {
    if (!node) return
    // A superseded playlist track must not auto-advance.
    if ('endTimer' in node && node.endTimer !== null) {
      window.clearTimeout(node.endTimer)
      node.endTimer = null
    }
    const t = this.now
    const g = node.gain.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(0, t + fadeSec)
    const { source, gain } = node
    window.setTimeout(() => {
      try {
        source.stop()
        source.disconnect()
        gain.disconnect()
      } catch {
        /* already stopped */
      }
    }, fadeSec * 1000 + 60)
  }

  async setAmbience(layers: AmbienceLayer[], crossfadeMs = DEFAULT_CROSSFADE_MS): Promise<void> {
    await this.resume()
    const seq = ++this.ambienceIntent
    const fade = Math.max(crossfadeMs, 1) / 1000

    for (const a of this.activeAmbience) this.fadeOutAndStop(a, fade)
    this.activeAmbience = []

    for (const layer of layers) {
      let buffer: AudioBuffer
      let norm: number
      try {
        ;({ buffer, norm } = await this.getBuffer(layer.file))
      } catch (err) {
        this.emitError(`Ambience "${layer.file}": ${(err as Error).message}`)
        continue
      }
      // Another scene loaded while we were decoding — stop building this set.
      if (seq !== this.ambienceIntent) return
      const target = (layer.volume ?? DEFAULT_AMB_VOL) * norm
      const t = this.now
      const gain = this.ctx.createGain()
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(target, t + fade)
      const source = this.ctx.createBufferSource()
      source.buffer = buffer
      source.loop = layer.loop !== false
      source.connect(gain)
      gain.connect(this.ambienceBus)
      source.start()
      this.trackAmbienceEnd(layer.file, source)
      this.activeAmbience.push({ file: layer.file, source, gain, norm })
    }
    this.emit()
  }

  /**
   * Keep status truthful for non-looping beds: when the source ends naturally,
   * drop it from activeAmbience (a manual stop replaces the entry first, so the
   * identity check makes stale onended calls harmless).
   */
  private trackAmbienceEnd(file: string, source: AudioBufferSourceNode): void {
    source.onended = () => {
      const cur = this.activeAmbience.find((a) => a.file === file)
      if (cur?.source === source) {
        this.activeAmbience = this.activeAmbience.filter((a) => a !== cur)
        this.emit()
      }
    }
  }

  /** Start a single ambience layer (tap-to-play), leaving others untouched. */
  async startAmbienceLayer(layer: AmbienceLayer, crossfadeMs = 800): Promise<void> {
    await this.resume()
    if (this.activeAmbience.some((a) => a.file === layer.file)) return
    let buffer: AudioBuffer
    let norm: number
    try {
      ;({ buffer, norm } = await this.getBuffer(layer.file))
    } catch (err) {
      this.emitError(`Ambience "${layer.file}": ${(err as Error).message}`)
      return
    }
    if (this.activeAmbience.some((a) => a.file === layer.file)) return // decoded twice; bail
    const fade = Math.max(crossfadeMs, 1) / 1000
    const target = (layer.volume ?? DEFAULT_AMB_VOL) * norm
    const t = this.now
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(target, t + fade)
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.loop = layer.loop !== false
    source.connect(gain)
    gain.connect(this.ambienceBus)
    source.start()
    this.trackAmbienceEnd(layer.file, source)
    this.activeAmbience.push({ file: layer.file, source, gain, norm })
    this.emit()
  }

  /** Stop a single ambience layer (tap-to-stop), leaving others playing. */
  stopAmbienceLayer(file: string, crossfadeMs = 800): void {
    const layer = this.activeAmbience.find((a) => a.file === file)
    if (!layer) return
    this.fadeOutAndStop(layer, Math.max(crossfadeMs, 1) / 1000)
    this.activeAmbience = this.activeAmbience.filter((a) => a.file !== file)
    this.emit()
  }

  async playSfx(sfx: SfxItem): Promise<void> {
    await this.resume()
    // Looping SFX toggle: a second tap on a playing loop stops it.
    if (sfx.loop && this.activeSfxLoops.has(sfx.id)) {
      this.stopSfxLoop(sfx.id)
      return
    }
    let buffer: AudioBuffer
    let norm: number
    try {
      ;({ buffer, norm } = await this.getBuffer(sfx.file))
    } catch (err) {
      this.emitError(`SFX "${sfx.label ?? sfx.file}": ${(err as Error).message}`)
      return
    }
    const target = (sfx.volume ?? DEFAULT_SFX_VOL) * norm
    const gain = this.ctx.createGain()
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.connect(gain)
    gain.connect(this.sfxBus)

    if (sfx.loop) {
      // Sustained loop: fade in a touch, never duck (it would hold the music
      // down indefinitely), track it so it can be stopped / re-mixed live.
      const t = this.now
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(target, t + 0.08)
      source.loop = true
      source.start()
      this.activeSfxLoops.set(sfx.id, { source, gain, norm })
      this.emit()
      return
    }

    gain.gain.value = target
    const duck = sfx.duckMusic !== false
    if (duck) this.duckDown()
    source.start()
    const entry = { source, gain }
    this.activeOneShots.add(entry)
    source.onended = () => {
      this.activeOneShots.delete(entry)
      try {
        source.disconnect()
        gain.disconnect()
      } catch {
        /* ignore */
      }
      if (duck) this.duckUp()
    }
  }

  /** Stop a sustained looping SFX with a short fade. */
  stopSfxLoop(id: string, fadeSec = 0.15): void {
    const node = this.activeSfxLoops.get(id)
    if (!node) return
    this.activeSfxLoops.delete(id)
    const t = this.now
    const g = node.gain.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(0, t + fadeSec)
    window.setTimeout(() => {
      try {
        node.source.stop()
        node.source.disconnect()
        node.gain.disconnect()
      } catch {
        /* already stopped */
      }
    }, fadeSec * 1000 + 60)
    this.emit()
  }

  /** Live-adjust the volume of a sustained looping SFX. */
  setSfxLoopVolume(id: string, v: number): void {
    const node = this.activeSfxLoops.get(id)
    if (node) node.gain.gain.setTargetAtTime(v * node.norm, this.now, 0.02)
  }

  private duckDown(): void {
    this.duckCount++
    const t = this.now
    const g = this.musicDuck.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(DUCK_LINEAR, t + 0.1)
    this.emit()
  }

  private duckUp(): void {
    this.duckCount = Math.max(0, this.duckCount - 1)
    if (this.duckCount > 0) return
    const t = this.now
    const g = this.musicDuck.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(1, t + 0.8)
    this.emit()
  }

  stopAll(crossfadeMs = 600): void {
    this.stopMusic(crossfadeMs)
    this.setAmbience([], crossfadeMs)
    this.stopAllSfxLoops(crossfadeMs / 1000)
    // In-flight one-shots too — "stop all" must mean silence, not "except the
    // 8-second dragon roar that already fired". stop() fires onended, which
    // handles duck-release and cleanup.
    for (const o of [...this.activeOneShots]) {
      const t = this.now
      const g = o.gain.gain
      g.cancelScheduledValues(t)
      g.setValueAtTime(g.value, t)
      g.linearRampToValueAtTime(0, t + 0.15)
      window.setTimeout(() => {
        try {
          o.source.stop()
        } catch {
          /* already ended */
        }
      }, 200)
    }
  }

  /** Stop every sustained looping SFX (used on stop-all and scene go-live). */
  stopAllSfxLoops(fadeSec = 0.3): void {
    for (const id of [...this.activeSfxLoops.keys()]) this.stopSfxLoop(id, fadeSec)
  }

  // --- Live per-item mixing (the "mini mixer") -----------------------------

  /** Live-adjust the currently-playing music track's own volume. */
  setActiveMusicVolume(v: number): void {
    const m = this.activeMusic
    if (m) m.gain.gain.setTargetAtTime(v * m.norm, this.now, 0.02)
  }

  /** Live-toggle whether the current track loops. */
  setActiveMusicLoop(loop: boolean): void {
    if (this.activeMusic) {
      this.activeMusic.source.loop = loop
      this.activeMusic.loop = loop
    }
  }

  /** Live-adjust one ambience layer's volume (matched by file). */
  setAmbienceLayerVolume(file: string, v: number): void {
    for (const a of this.activeAmbience) {
      if (a.file === file) a.gain.gain.setTargetAtTime(v * a.norm, this.now, 0.02)
    }
  }

  /** Live-toggle whether an ambience layer loops (matched by file). */
  setAmbienceLayerLoop(file: string, loop: boolean): void {
    for (const a of this.activeAmbience) if (a.file === file) a.source.loop = loop
  }

  setMasterVolume(v: number): void {
    this.masterVolume = v
    this.master.gain.setTargetAtTime(v, this.now, 0.02)
    this.emit()
  }
  setMusicVolume(v: number): void {
    this.musicVolume = v
    this.musicBus.gain.setTargetAtTime(v, this.now, 0.02)
    this.emit()
  }
  setAmbienceVolume(v: number): void {
    this.ambienceVolume = v
    this.ambienceBus.gain.setTargetAtTime(v, this.now, 0.02)
    this.emit()
  }
  setSfxVolume(v: number): void {
    this.sfxVolume = v
    this.sfxBus.gain.setTargetAtTime(v, this.now, 0.02)
    this.emit()
  }

  status(): EngineStatus {
    return {
      activeMusicId: this.activeMusic?.trackId ?? null,
      ambienceFiles: this.activeAmbience.map((a) => a.file),
      loopingSfxIds: [...this.activeSfxLoops.keys()],
      masterVolume: this.masterVolume,
      musicVolume: this.musicVolume,
      ambienceVolume: this.ambienceVolume,
      sfxVolume: this.sfxVolume,
      ducked: this.duckCount > 0
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.status())
    return () => this.listeners.delete(listener)
  }

  /** Notified whenever an asset fails to load/decode, so the UI can toast it. */
  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  /**
   * Preview an arbitrary asset (library audition button). One-shot, never loops,
   * never ducks the music bus. Returns a stop() handle. On failure, emits an
   * error and returns a no-op stopper.
   */
  async preview(file: string, onEnded?: () => void, volume = DEFAULT_MUSIC_VOL): Promise<() => void> {
    await this.resume()
    let buffer: AudioBuffer
    let norm: number
    try {
      ;({ buffer, norm } = await this.getBuffer(file))
    } catch (err) {
      this.emitError(`Preview "${file}": ${(err as Error).message}`)
      onEnded?.()
      return () => undefined
    }
    const gain = this.ctx.createGain()
    gain.gain.value = volume * norm
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.connect(gain)
    gain.connect(this.sfxBus)
    let stopped = false
    const disconnect = (): void => {
      try {
        source.disconnect()
        gain.disconnect()
      } catch {
        /* already gone */
      }
    }
    // Natural end → notify (so the UI resets); manual stop() suppresses it.
    source.onended = () => {
      disconnect()
      if (!stopped) onEnded?.()
    }
    source.start()
    return () => {
      stopped = true
      try {
        source.stop()
      } catch {
        /* already stopped */
      }
      disconnect()
    }
  }

  /**
   * Fetch every given asset without decoding and return the files that fail to
   * load — a fast integrity check the DM can run before a session so broken
   * paths surface up front instead of as silent no-ops mid-game.
   */
  async probe(files: string[]): Promise<string[]> {
    const failures: string[] = []
    await Promise.all(
      files.map(async (file) => {
        try {
          const r = await fetch(assetUrl(file))
          if (!r.ok) {
            console.error('[audio] probe fail:', file, `HTTP ${r.status}`)
            failures.push(file)
          }
        } catch (e) {
          console.error('[audio] probe fail:', file, (e as Error).message)
          failures.push(file)
        }
      })
    )
    return failures
  }

  // --- Discord bridge tap (see DISCORD-BRIDGE.md) ------------------------

  private tapNode: AudioWorkletNode | null = null
  private tapSink: GainNode | null = null
  private tapModuleLoaded = false

  /**
   * Start streaming the post-master mix as ~20ms chunks of s16le 48kHz stereo
   * PCM. Runs continuously (silence streams as zeros) so the consumer's audio
   * pipeline never underruns. The Master fader shapes this feed too.
   */
  async startTap(onChunk: (chunk: ArrayBuffer) => void): Promise<void> {
    await this.resume()
    if (this.tapNode) return
    if (!this.tapModuleLoaded) {
      const url = URL.createObjectURL(new Blob([TAP_WORKLET_SRC], { type: 'application/javascript' }))
      await this.ctx.audioWorklet.addModule(url)
      URL.revokeObjectURL(url)
      this.tapModuleLoaded = true
    }
    const node = new AudioWorkletNode(this.ctx, 'hearth-tap', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'explicit'
    })
    node.port.onmessage = (e) => onChunk(e.data as ArrayBuffer)
    // A muted sink keeps the worklet pulled by the graph without doubling audio.
    const sink = this.ctx.createGain()
    sink.gain.value = 0
    this.master.connect(node)
    node.connect(sink)
    sink.connect(this.ctx.destination)
    this.tapNode = node
    this.tapSink = sink
  }

  stopTap(): void {
    if (!this.tapNode) return
    this.tapNode.port.onmessage = null
    try {
      this.master.disconnect(this.tapNode)
      this.tapNode.disconnect()
      this.tapSink?.disconnect()
    } catch {
      /* graph already torn down */
    }
    this.tapNode = null
    this.tapSink = null
  }

  private emit(): void {
    const s = this.status()
    this.listeners.forEach((l) => l(s))
  }

  private emitError(message: string): void {
    this.errorListeners.forEach((l) => l(message))
  }
}
