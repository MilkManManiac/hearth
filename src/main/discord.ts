// Discord voice bridge (Phase 2) — streams the app's mixed audio into a voice
// channel. See DISCORD-BRIDGE.md for the architecture. EXPERIMENTAL until the
// first end-to-end test with a real bot token.
import { app } from 'electron'
import * as path from 'path'
import * as fsSync from 'fs'
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
}

export interface DiscordGuildInfo {
  id: string
  name: string
}

export interface DiscordChannelInfo {
  id: string
  name: string
}

/** 48kHz stereo s16le — 1 second of audio, the backpressure ceiling. */
const MAX_BUFFERED_BYTES = 48000 * 2 * 2

function readToken(): string | undefined {
  try {
    return JSON.parse(fsSync.readFileSync(CONFIG_FILE(), 'utf-8')).discordToken
  } catch {
    return undefined
  }
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

export class DiscordBridge {
  private client: Client | null = null
  private connection: VoiceConnection | null = null
  private player: AudioPlayer | null = null
  private pcm: PassThrough | null = null
  private status: DiscordStatus = { state: 'idle', hasToken: !!readToken() }

  constructor(private onStatus: (s: DiscordStatus) => void) {}

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
        VoiceConnectionStatus
      } = await import('@discordjs/voice')
      const guild = await this.client.guilds.fetch(guildId)
      const channel = (await guild.channels.fetch(channelId)) as VoiceBasedChannel | null
      if (!channel?.isVoiceBased()) throw new Error('Not a voice channel')

      this.leave() // one channel at a time

      const connection = joinVoiceChannel({
        channelId,
        guildId,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true
      })
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000)

      const pcm = new PassThrough({ highWaterMark: MAX_BUFFERED_BYTES })
      const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Play }
      })
      // Raw = s16le 48kHz stereo; prism-media opus-encodes via opusscript.
      player.play(createAudioResource(pcm, { inputType: StreamType.Raw }))
      connection.subscribe(player)

      connection.on('stateChange', (_old, s) => {
        if (s.status === VoiceConnectionStatus.Disconnected || s.status === VoiceConnectionStatus.Destroyed) {
          if (this.connection === connection) {
            this.setStatus({ state: 'connected', guildName: undefined, channelName: undefined })
          }
        }
      })

      this.connection = connection
      this.player = player
      this.pcm = pcm
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
    // Live audio: if Discord can't drain fast enough, drop instead of lagging.
    if (pcm.writableLength > MAX_BUFFERED_BYTES) return
    pcm.write(Buffer.from(chunk))
  }

  leave(): void {
    this.pcm?.end()
    this.player?.stop()
    try {
      this.connection?.destroy()
    } catch {
      /* already destroyed */
    }
    this.connection = null
    this.player = null
    this.pcm = null
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
