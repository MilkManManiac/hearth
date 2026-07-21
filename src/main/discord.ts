// Discord voice bridge (Phase 2) — streams the app's mixed audio into a voice
// channel. See DISCORD-BRIDGE.md for the architecture. EXPERIMENTAL until the
// first end-to-end test with a real bot token.
import { app, powerSaveBlocker } from 'electron'
import * as os from 'os'
import * as path from 'path'
import * as fsSync from 'fs'
import { promises as fs } from 'fs'
import { PassThrough } from 'stream'
import type { Client, VoiceBasedChannel } from 'discord.js'
import type { AudioPlayer, VoiceConnection } from '@discordjs/voice'

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'hearth-config.json')

export interface DiscordStatus {
  /** Lifecycle: idle (no token/not connected) → connecting → connected (bot
   * logged in) → joined (in a voice channel, streaming). */
  state: 'idle' | 'connecting' | 'connected' | 'joining' | 'joined' | 'error'
  hasToken: boolean
  botTag?: string
  guildName?: string
  channelName?: string
  error?: string
  /** The Chronicler: recording per-speaker audio in the joined channel. */
  chronicling?: boolean
  /** Where the current chronicle session is being written. */
  chronicleDir?: string
  /** Utterances captured so far this session. */
  utterances?: number
}

export interface DiscordGuildInfo {
  id: string
  name: string
}

export interface DiscordChannelInfo {
  id: string
  name: string
}

/** 48kHz stereo s16le — one second of audio. */
const BYTES_PER_SEC = 48000 * 2 * 2
/**
 * Jitter cushion: the feed is primed with this much silence so playback runs
 * behind the renderer by the same amount. Without it the buffer sits at ~zero
 * (chunks arrive exactly as fast as Discord drains them) and ANY renderer
 * stall > one 20ms frame is an audible gap — throttling flags shrink stalls
 * but can't eliminate them. 1.5s of delay is inaudible for music/ambience and
 * acceptable for fired SFX cues.
 */
const CUSHION_BYTES = BYTES_PER_SEC * 1.5
/** Backpressure ceiling: cushion + 1s of drift slack before we drop chunks. */
const MAX_BUFFERED_BYTES = CUSHION_BYTES + BYTES_PER_SEC

function readToken(): string | undefined {
  try {
    return JSON.parse(fsSync.readFileSync(CONFIG_FILE(), 'utf-8')).discordToken
  } catch {
    return undefined
  }
}

/** Text channel that receives Game Log rolls ('' / absent = posting off). */
function readRollChannel(): string | undefined {
  try {
    return JSON.parse(fsSync.readFileSync(CONFIG_FILE(), 'utf-8')).rollChannelId || undefined
  } catch {
    return undefined
  }
}

function writeRollChannel(channelId: string | undefined): void {
  let cfg: Record<string, unknown> = {}
  try {
    cfg = JSON.parse(fsSync.readFileSync(CONFIG_FILE(), 'utf-8'))
  } catch {
    /* fresh config */
  }
  if (channelId) cfg.rollChannelId = channelId
  else delete cfg.rollChannelId
  fsSync.writeFileSync(CONFIG_FILE(), JSON.stringify(cfg, null, 2))
}

function writeToken(token: string | undefined): void {
  let cfg: Record<string, unknown> = {}
  try {
    cfg = JSON.parse(fsSync.readFileSync(CONFIG_FILE(), 'utf-8'))
  } catch {
    /* fresh config */
  }
  if (token) cfg.discordToken = token
  else delete cfg.discordToken
  fsSync.writeFileSync(CONFIG_FILE(), JSON.stringify(cfg, null, 2))
}

/**
 * Streaming WAV writer: 44-byte placeholder header, raw s16le appended, sizes
 * patched on close. Zero dependencies — utterance files open anywhere.
 */
class WavWriter {
  private fd: number
  private dataBytes = 0

  constructor(
    public readonly filePath: string,
    private sampleRate = 48000,
    private channels = 2
  ) {
    this.fd = fsSync.openSync(filePath, 'w')
    fsSync.writeSync(this.fd, this.header(0))
  }

  private header(dataBytes: number): Buffer {
    const h = Buffer.alloc(44)
    const byteRate = this.sampleRate * this.channels * 2
    h.write('RIFF', 0)
    h.writeUInt32LE(36 + dataBytes, 4)
    h.write('WAVE', 8)
    h.write('fmt ', 12)
    h.writeUInt32LE(16, 16) // PCM chunk size
    h.writeUInt16LE(1, 20) // PCM format
    h.writeUInt16LE(this.channels, 22)
    h.writeUInt32LE(this.sampleRate, 24)
    h.writeUInt32LE(byteRate, 28)
    h.writeUInt16LE(this.channels * 2, 32) // block align
    h.writeUInt16LE(16, 34) // bits per sample
    h.write('data', 36)
    h.writeUInt32LE(dataBytes, 40)
    return h
  }

  write(chunk: Buffer): void {
    fsSync.writeSync(this.fd, chunk)
    this.dataBytes += chunk.length
  }

  /** Patch the header sizes and close. Returns seconds of audio written. */
  close(): number {
    const h = this.header(this.dataBytes)
    fsSync.writeSync(this.fd, h, 0, 44, 0)
    fsSync.closeSync(this.fd)
    return this.dataBytes / (this.sampleRate * this.channels * 2)
  }
}

/** Windows-safe filename fragment from a Discord username. */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 32) || 'unknown'
}

/** Humanize the errors a DM will actually hit. */
function friendly(err: Error): string {
  const m = err.message
  if (/ERR_DLOPEN_FAILED|vcruntime/i.test(m)) {
    return 'A native module failed to load — install the Microsoft Visual C++ Redistributable (vc_redist.x64) and restart.'
  }
  if (/TOKEN_INVALID|An invalid token/i.test(m)) return 'Discord rejected the bot token — re-copy it from the developer portal.'
  if (/disallowed intents/i.test(m)) return 'Enable the bot\'s intents in the developer portal (no privileged intents are needed — recreate the invite).'
  return m
}

/**
 * Diagnostic logger for the stutter hunt: appends timestamped lines to
 * userData/discord-audio.log while in a voice channel. Cheap (a few lines a
 * minute) — records chunk-arrival gaps, buffer depth, and player breakdowns so
 * a stutter repro shows WHERE the pipeline starved instead of forcing guesses.
 */
class AudioDiagLog {
  private file = path.join(app.getPath('userData'), 'discord-audio.log')

  start(): void {
    try {
      fsSync.writeFileSync(this.file, '')
    } catch {
      /* diag only */
    }
    this.line('=== voice session start ===')
  }

  line(msg: string): void {
    try {
      fsSync.appendFileSync(this.file, `${new Date().toISOString()} ${msg}\n`)
    } catch {
      /* diag only */
    }
  }
}

export class DiscordBridge {
  private client: Client | null = null
  private connection: VoiceConnection | null = null
  private player: AudioPlayer | null = null
  private pcm: PassThrough | null = null
  private status: DiscordStatus = { state: 'idle', hasToken: !!readToken() }
  private diag = new AudioDiagLog()
  private lastPushAt = 0
  private diagTimer: ReturnType<typeof setInterval> | null = null
  /** powerSaveBlocker id while in a voice channel — keeps Windows from
   *  suspending timers when Hearth is minimized (audible stutter otherwise). */
  private psbId: number | null = null

  // --- The Chronicler (per-speaker session recorder) ---
  private chronicleDir: string | null = null
  private chronicleStart = 0
  private chronicleCount = 0
  private chronicleSpeakingHandler: ((userId: string) => void) | null = null
  /** Users with an active utterance capture (one stream per speaker at a time). */
  private capturing = new Set<string>()
  private usernames = new Map<string, string>()

  constructor(private onStatus: (s: DiscordStatus) => void) {}

  private blockPowerSave(): void {
    if (this.psbId === null) this.psbId = powerSaveBlocker.start('prevent-app-suspension')
    // Above-normal process priority while streaming: the 20ms opus encode +
    // packet dispatch loop lives on this process's event loop, and Windows
    // deprioritizes background apps (efficiency mode) when the window is
    // minimized — exactly when the DM needs the stream steady.
    try {
      os.setPriority(process.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL)
    } catch (err) {
      console.warn('[discord] could not raise process priority:', (err as Error).message)
    }
  }

  private unblockPowerSave(): void {
    if (this.psbId !== null) {
      powerSaveBlocker.stop(this.psbId)
      this.psbId = null
    }
    try {
      os.setPriority(process.pid, os.constants.priority.PRIORITY_NORMAL)
    } catch {
      /* best effort */
    }
  }

  getStatus(): DiscordStatus {
    return this.status
  }

  private setStatus(patch: Partial<DiscordStatus>): void {
    this.status = { ...this.status, ...patch, hasToken: !!readToken() }
    this.onStatus(this.status)
  }

  setToken(token: string): void {
    writeToken(token.trim() || undefined)
    this.setStatus({})
  }

  /** Log the bot in (idempotent). */
  async connect(): Promise<void> {
    if (this.client) return
    const token = readToken()
    if (!token) throw new Error('No bot token set')
    this.setStatus({ state: 'connecting', error: undefined })
    try {
      // Lazy-load so the app never pays discord.js startup cost (or a broken
      // native dep) unless the DM actually uses the bridge.
      const { Client, GatewayIntentBits } = await import('discord.js')
      const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
      })
      await client.login(token)
      this.client = client
      this.setStatus({ state: 'connected', botTag: client.user?.tag })
    } catch (err) {
      this.client = null
      const msg = friendly(err as Error)
      this.setStatus({ state: 'error', error: msg })
      throw new Error(msg)
    }
  }

  async listGuilds(): Promise<DiscordGuildInfo[]> {
    if (!this.client) throw new Error('Not connected')
    const guilds = await this.client.guilds.fetch()
    return [...guilds.values()].map((g) => ({ id: g.id, name: g.name }))
  }

  async listChannels(guildId: string): Promise<DiscordChannelInfo[]> {
    if (!this.client) throw new Error('Not connected')
    const guild = await this.client.guilds.fetch(guildId)
    const channels = await guild.channels.fetch()
    return [...channels.values()]
      .filter((c): c is NonNullable<typeof c> => !!c && c.isVoiceBased())
      .map((c) => ({ id: c.id, name: c.name }))
  }

  /** Text channels, for the Game Log → Discord feed picker. */
  async listTextChannels(guildId: string): Promise<DiscordChannelInfo[]> {
    if (!this.client) throw new Error('Not connected')
    const guild = await this.client.guilds.fetch(guildId)
    const channels = await guild.channels.fetch()
    return [...channels.values()]
      .filter((c): c is NonNullable<typeof c> => !!c && c.isTextBased() && !c.isVoiceBased())
      .map((c) => ({ id: c.id, name: c.name }))
  }

  getRollChannel(): string | undefined {
    return readRollChannel()
  }

  setRollChannel(channelId: string | undefined): void {
    writeRollChannel(channelId)
  }

  /**
   * Post a Game Log roll to the configured text channel. Fire-and-forget —
   * silently skipped when the bot isn't connected, no channel is set, or the
   * roll is DM-only.
   */
  postRoll(roll: {
    who: string
    what: string
    expr: string
    total: number
    groups: { die: number; results: number[]; kept: number[] }[]
    crit?: 'crit' | 'fumble'
    dmOnly?: boolean
  }): void {
    const channelId = readRollChannel()
    if (!this.client || !channelId || roll.dmOnly) return
    const dice = roll.groups
      .map((g) => `d${g.die}[${g.results.map((r, i) => (g.kept.includes(i) ? r : `~~${r}~~`)).join(', ')}]`)
      .join(' ')
    const flair = roll.crit === 'crit' ? ' 💥 **NAT 20!**' : roll.crit === 'fumble' ? ' 💀 nat 1' : ''
    const line = `🎲 **${roll.who}** — ${roll.what}: **${roll.total}**${flair}\n-# ${roll.expr} · ${dice}`
    void (async () => {
      try {
        const channel = await this.client!.channels.fetch(channelId)
        if (channel?.isTextBased() && 'send' in channel) await channel.send(line)
      } catch (err) {
        console.error('[discord] roll post failed:', (err as Error).message)
      }
    })()
  }

  /** Join a voice channel and start playing the raw PCM stream. */
  async join(guildId: string, channelId: string): Promise<void> {
    if (!this.client) throw new Error('Not connected')
    this.setStatus({ state: 'joining', error: undefined })
    try {
      const {
        joinVoiceChannel,
        createAudioPlayer,
        createAudioResource,
        StreamType,
        NoSubscriberBehavior,
        entersState,
        VoiceConnectionStatus,
        AudioPlayerStatus,
        generateDependencyReport
      } = await import('@discordjs/voice')
      // Which opus/encryption impls actually loaded — "@discordjs/opus" must
      // appear or we're on the slow opusscript fallback (stutter risk).
      this.diag.start()
      this.diag.line('deps:\n' + generateDependencyReport())
      const guild = await this.client.guilds.fetch(guildId)
      const channel = (await guild.channels.fetch(channelId)) as VoiceBasedChannel | null
      if (!channel?.isVoiceBased()) throw new Error('Not a voice channel')

      this.leave() // one channel at a time

      const connection = joinVoiceChannel({
        channelId,
        guildId,
        adapterCreator: guild.voiceAdapterCreator,
        // NOT deafened: The Chronicler needs to hear the channel to record it.
        selfDeaf: false
      })
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000)

      const player = createAudioPlayer({
        // maxMissedFrames default is 5 (100ms): any renderer hiccup — GC pause,
        // window drag, CPU spike — killed the player mid-session. 250 = 5s of
        // tolerance (Kenku FM uses the same figure).
        behaviors: { noSubscriber: NoSubscriberBehavior.Play, maxMissedFrames: 250 }
      })
      // Fresh PassThrough per resource: a stopped resource destroys its input
      // stream, so the restart path below must never reuse one.
      const startFeed = (): void => {
        const pcm = new PassThrough({ highWaterMark: MAX_BUFFERED_BYTES })
        this.pcm = pcm
        // Prime the jitter cushion (see CUSHION_BYTES). Re-primed on every
        // watchdog restart too, so a starved-out feed comes back cushioned.
        pcm.write(Buffer.alloc(CUSHION_BYTES))
        // Raw = s16le 48kHz stereo; prism-media opus-encodes via opusscript.
        player.play(createAudioResource(pcm, { inputType: StreamType.Raw }))
      }
      startFeed()
      connection.subscribe(player)

      // Watchdog: if the player ever stops (starved past maxMissedFrames, or
      // any internal error), restart the feed instead of going silent forever.
      // leave() nulls this.player before stopping it, so a manual leave never
      // trips this.
      player.on('stateChange', (old, s) => {
        this.diag.line(`player ${old.status} -> ${s.status}`)
        if (
          s.status === AudioPlayerStatus.Idle &&
          this.player === player &&
          this.connection === connection
        ) {
          console.warn('[discord] audio player went idle — restarting the PCM feed')
          startFeed()
        }
      })

      connection.on('stateChange', (_old, s) => {
        if (this.connection !== connection) return
        if (s.status === VoiceConnectionStatus.Disconnected) {
          // Distinguish a self-healing blip (region move, channel drag — the
          // connection re-signals on its own) from a real drop. Only a real
          // drop tears down; the UI then shows "connected" so the DM rejoins.
          void (async () => {
            try {
              await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
              ])
            } catch {
              try {
                connection.destroy()
              } catch {
                /* already destroyed */
              }
            }
          })()
        } else if (s.status === VoiceConnectionStatus.Destroyed) {
          this.connection = null
          this.player = null
          this.pcm = null
          if (this.diagTimer) {
            clearInterval(this.diagTimer)
            this.diagTimer = null
            this.diag.line('=== voice session end (connection destroyed) ===')
          }
          this.unblockPowerSave()
          this.setStatus({ state: 'connected', guildName: undefined, channelName: undefined })
        }
      })

      this.connection = connection
      this.player = player
      // Buffer-depth sampler: healthy = hovering near the 1.5s cushion
      // (288000 bytes). Draining toward 0 = the renderer isn't producing;
      // steady-but-stuttering = the fault is downstream (encode/dispatch/net).
      this.lastPushAt = 0
      if (this.diagTimer) clearInterval(this.diagTimer)
      this.diagTimer = setInterval(() => {
        const st = this.player?.state.status ?? 'none'
        // Timer-precision probe: a 20ms setTimeout should land within ~2ms.
        // Win11 background timer coalescing shows up here as 10ms+ drift —
        // the packet-pacing failure mode measured on 2026-07-21.
        const t0 = Date.now()
        setTimeout(() => {
          const drift = Date.now() - t0 - 20
          this.diag.line(
            `buffer=${this.pcm?.writableLength ?? -1} player=${st} timerDrift=${drift}ms`
          )
        }, 20)
      }, 5000)
      this.blockPowerSave()
      this.setStatus({ state: 'joined', guildName: guild.name, channelName: channel.name })
    } catch (err) {
      const msg = friendly(err as Error)
      this.setStatus({ state: this.client ? 'connected' : 'idle', error: msg })
      throw new Error(msg)
    }
  }

  /** Ingest a chunk of s16le 48kHz stereo PCM from the renderer's tap. */
  pushPcm(chunk: ArrayBuffer): void {
    const pcm = this.pcm
    if (!pcm) return
    // Chunks should arrive every 20ms; a big inter-arrival gap means the
    // renderer→IPC side stalled (throttling), not the Discord side.
    const now = Date.now()
    if (this.lastPushAt && now - this.lastPushAt > 150) {
      this.diag.line(`push gap ${now - this.lastPushAt}ms (buffer=${pcm.writableLength})`)
    }
    this.lastPushAt = now
    // Live audio: if Discord can't drain fast enough, drop instead of lagging.
    if (pcm.writableLength > MAX_BUFFERED_BYTES) return
    pcm.write(Buffer.from(chunk))
  }

  // --- The Chronicler ------------------------------------------------------

  /**
   * Start recording the joined channel, one file per utterance per speaker:
   * `<offsetMs>-<username>.wav` (48kHz stereo s16le) plus `manifest.jsonl`
   * (one line per utterance: user, start/end offsets, duration, file). The
   * per-speaker split is the whole point — future transcripts get perfect
   * speaker attribution instead of diarization guesswork.
   */
  async startChronicle(dir: string): Promise<void> {
    if (!this.connection) throw new Error('Join a voice channel first')
    if (this.chronicleDir) return // already rolling
    await fs.mkdir(dir, { recursive: true })
    this.chronicleDir = dir
    this.chronicleStart = Date.now()
    this.chronicleCount = 0
    const receiver = this.connection.receiver
    const handler = (userId: string) => void this.captureUtterance(userId)
    this.chronicleSpeakingHandler = handler
    receiver.speaking.on('start', handler)
    await fs.writeFile(
      path.join(dir, 'session.json'),
      JSON.stringify(
        {
          startedAt: new Date(this.chronicleStart).toISOString(),
          guild: this.status.guildName,
          channel: this.status.channelName,
          format: 'wav s16le 48kHz stereo; offsets in ms from startedAt'
        },
        null,
        2
      )
    )
    this.setStatus({ chronicling: true, chronicleDir: dir, utterances: 0 })
  }

  /** Capture one speaking burst from one user into its own WAV. */
  private async captureUtterance(userId: string): Promise<void> {
    const dir = this.chronicleDir
    const receiver = this.connection?.receiver
    if (!dir || !receiver || this.capturing.has(userId)) return
    this.capturing.add(userId)
    try {
      let name = this.usernames.get(userId)
      if (!name) {
        try {
          name = (await this.client?.users.fetch(userId))?.username ?? userId
        } catch {
          name = userId
        }
        this.usernames.set(userId, name)
      }
      const { EndBehaviorType } = await import('@discordjs/voice')
      const prism = await import('prism-media')
      const startMs = Date.now() - this.chronicleStart
      const file = `${String(startMs).padStart(9, '0')}-${safeName(name)}.wav`
      const wav = new WavWriter(path.join(dir, file))

      const opusStream = receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: 800 }
      })
      // opusscript-backed decode — no native deps (same policy as playback).
      const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 })
      opusStream.pipe(decoder)
      decoder.on('data', (chunk: Buffer) => wav.write(chunk))

      await new Promise<void>((resolve) => {
        const done = () => resolve()
        decoder.once('end', done)
        decoder.once('close', done)
        opusStream.once('error', done)
        decoder.once('error', done)
      })

      const seconds = wav.close()
      // Sub-quarter-second blips are keyboard noise, not speech — drop them.
      if (seconds < 0.25) {
        await fs.unlink(wav.filePath).catch(() => {})
        return
      }
      this.chronicleCount++
      const line = JSON.stringify({
        user: name,
        userId,
        startMs,
        endMs: startMs + Math.round(seconds * 1000),
        seconds: Math.round(seconds * 100) / 100,
        file
      })
      await fs.appendFile(path.join(dir, 'manifest.jsonl'), line + '\n')
      this.setStatus({ utterances: this.chronicleCount })
    } catch {
      /* a dropped utterance must never take down the bridge */
    } finally {
      this.capturing.delete(userId)
    }
  }

  stopChronicle(): void {
    if (!this.chronicleDir) return
    if (this.connection && this.chronicleSpeakingHandler) {
      this.connection.receiver.speaking.off('start', this.chronicleSpeakingHandler)
    }
    this.chronicleSpeakingHandler = null
    this.chronicleDir = null
    this.setStatus({ chronicling: false, chronicleDir: undefined })
  }

  leave(): void {
    if (this.diagTimer) {
      clearInterval(this.diagTimer)
      this.diagTimer = null
      this.diag.line('=== voice session end (leave) ===')
    }
    this.stopChronicle()
    // Null the fields BEFORE stopping: the player's idle watchdog and the
    // connection's stateChange handler check identity against them, so this
    // makes an intentional teardown a no-op there.
    const { connection, player, pcm } = this
    this.connection = null
    this.player = null
    this.pcm = null
    this.unblockPowerSave()
    pcm?.end()
    player?.stop()
    try {
      connection?.destroy()
    } catch {
      /* already destroyed */
    }
    if (this.status.state === 'joined') {
      this.setStatus({ state: 'connected', guildName: undefined, channelName: undefined })
    }
  }

  async disconnect(): Promise<void> {
    this.leave()
    await this.client?.destroy()
    this.client = null
    this.setStatus({ state: 'idle', botTag: undefined })
  }
}
