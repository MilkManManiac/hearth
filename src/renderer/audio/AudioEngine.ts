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

/** Build an asset:/// URL, encoding each path segment. */
function assetUrl(file: string): string {
  return `asset:///${file.split('/').map(encodeURIComponent).join('/')}`
}

interface ActiveMusic {
  trackId: string
  source: AudioBufferSourceNode
  gain: GainNode
}

interface ActiveAmbience {
  file: string
  source: AudioBufferSourceNode
  gain: GainNode
}

export interface EngineStatus {
  activeMusicId: string | null
  ambienceFiles: string[]
  masterVolume: number
  musicVolume: number
  ambienceVolume: number
  sfxVolume: number
  ducked: boolean
}

type Listener = (status: EngineStatus) => void

/**
 * Single Web Audio graph for a session:
 *
 *   music source → trackGain ┐
 *                            musicDuck → musicBus ┐
 *   ambience source → ambGain → ambienceBus ──────┼→ master → destination
 *   sfx source → sfxGain → sfxBus ─────────────────┘
 *
 * musicBus carries the user's music volume; musicDuck is dipped while SFX play.
 */
export class AudioEngine {
  private ctx: AudioContext
  private master: GainNode
  private musicBus: GainNode
  private musicDuck: GainNode
  private ambienceBus: GainNode
  private sfxBus: GainNode

  private buffers = new Map<string, Promise<AudioBuffer>>()
  private activeMusic: ActiveMusic | null = null
  private activeAmbience: ActiveAmbience[] = []
  private duckCount = 0

  private masterVolume = 0.9
  private musicVolume = 1
  private ambienceVolume = 1
  private sfxVolume = 1

  private listeners = new Set<Listener>()

  constructor() {
    this.ctx = new AudioContext()
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

  private getBuffer(file: string): Promise<AudioBuffer> {
    let p = this.buffers.get(file)
    if (!p) {
      p = fetch(assetUrl(file))
        .then((r) => {
          if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`)
          return r.arrayBuffer()
        })
        .then((buf) => this.ctx.decodeAudioData(buf))
      p.catch(() => this.buffers.delete(file)) // allow retry on failure
      this.buffers.set(file, p)
    }
    return p
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
    await this.setAmbience(scene.ambience ?? [], fade)
  }

  async switchMusic(track: MusicTrack, crossfadeMs = DEFAULT_CROSSFADE_MS): Promise<void> {
    await this.resume()
    if (this.activeMusic?.trackId === track.id) return
    const buffer = await this.getBuffer(track.file)
    const fade = Math.max(crossfadeMs, 1) / 1000
    const target = track.volume ?? DEFAULT_MUSIC_VOL
    const t = this.now

    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(target, t + fade)
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.loop = track.loop !== false
    source.connect(gain)
    gain.connect(this.musicDuck)
    source.start()

    this.fadeOutAndStop(this.activeMusic, fade)
    this.activeMusic = { trackId: track.id, source, gain }
    this.emit()
  }

  stopMusic(crossfadeMs = DEFAULT_CROSSFADE_MS): void {
    this.fadeOutAndStop(this.activeMusic, Math.max(crossfadeMs, 1) / 1000)
    this.activeMusic = null
    this.emit()
  }

  private fadeOutAndStop(node: ActiveMusic | ActiveAmbience | null, fadeSec: number): void {
    if (!node) return
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
    const fade = Math.max(crossfadeMs, 1) / 1000

    for (const a of this.activeAmbience) this.fadeOutAndStop(a, fade)
    this.activeAmbience = []

    for (const layer of layers) {
      let buffer: AudioBuffer
      try {
        buffer = await this.getBuffer(layer.file)
      } catch {
        continue
      }
      const target = layer.volume ?? DEFAULT_AMB_VOL
      const t = this.now
      const gain = this.ctx.createGain()
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(target, t + fade)
      const source = this.ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.connect(gain)
      gain.connect(this.ambienceBus)
      source.start()
      this.activeAmbience.push({ file: layer.file, source, gain })
    }
    this.emit()
  }

  async playSfx(sfx: SfxItem): Promise<void> {
    await this.resume()
    let buffer: AudioBuffer
    try {
      buffer = await this.getBuffer(sfx.file)
    } catch {
      return
    }
    const target = sfx.volume ?? DEFAULT_SFX_VOL
    const gain = this.ctx.createGain()
    gain.gain.value = target
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.connect(gain)
    gain.connect(this.sfxBus)

    const duck = sfx.duckMusic !== false
    if (duck) this.duckDown()
    source.start()
    source.onended = () => {
      try {
        source.disconnect()
        gain.disconnect()
      } catch {
        /* ignore */
      }
      if (duck) this.duckUp()
    }
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

  private emit(): void {
    const s = this.status()
    this.listeners.forEach((l) => l(s))
  }
}
