import { useEffect, useState } from 'react'
import type { DiscordChannelInfo, DiscordGuildInfo } from '../../preload/index'
import { useStore } from '../store'

const inputCls =
  'w-full rounded border border-hearth-border bg-hearth-bg px-3 py-1.5 text-sm text-hearth-text placeholder:text-hearth-muted focus:border-hearth-ember focus:outline-none'

const btnCls =
  'rounded border border-hearth-ember bg-hearth-ember/15 px-3 py-1.5 text-sm text-hearth-ember hover:bg-hearth-ember/30 disabled:opacity-40'

const STATE_LABEL: Record<string, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Bot online — pick a channel',
  joining: 'Joining channel…',
  joined: 'Streaming to channel',
  error: 'Error'
}

/**
 * Discord voice bridge panel (EXPERIMENTAL — see DISCORD-BRIDGE.md). Token →
 * Connect → pick server + voice channel → Join. While joined, the app's whole
 * mix streams into the channel.
 */
export default function DiscordPanel() {
  const open = useStore((s) => s.discordOpen)
  const close = useStore((s) => s.closeDiscord)
  const status = useStore((s) => s.discordStatus)
  const pushToast = useStore((s) => s.pushToast)

  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [guilds, setGuilds] = useState<DiscordGuildInfo[]>([])
  const [channels, setChannels] = useState<DiscordChannelInfo[]>([])
  const [guildId, setGuildId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [textChannels, setTextChannels] = useState<DiscordChannelInfo[]>([])
  const [rollChannelId, setRollChannelId] = useState('')

  const state = status?.state ?? 'idle'
  const connected = state === 'connected' || state === 'joining' || state === 'joined'

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  // Once the bot is online, load its servers.
  useEffect(() => {
    if (!open || !connected) return
    window.hearth
      .discordGuilds()
      .then(setGuilds)
      .catch((err) => pushToast((err as Error).message, 'error'))
  }, [open, connected, pushToast])

  // Server picked → load its voice channels.
  useEffect(() => {
    if (!guildId) {
      setChannels([])
      return
    }
    window.hearth
      .discordChannels(guildId)
      .then(setChannels)
      .catch((err) => pushToast((err as Error).message, 'error'))
  }, [guildId, pushToast])

  // Game Log feed (D1): the saved roll channel + text channels of the picked
  // server (single-server bots don't need a pick).
  useEffect(() => {
    if (!open) return
    void window.hearth.discordRollChannel().then((id) => setRollChannelId(id ?? ''))
  }, [open])
  const feedGuild = guildId || (guilds.length === 1 ? guilds[0].id : '')
  useEffect(() => {
    if (!feedGuild || !connected) {
      setTextChannels([])
      return
    }
    window.hearth
      .discordTextChannels(feedGuild)
      .then(setTextChannels)
      .catch(() => setTextChannels([]))
  }, [feedGuild, connected])

  if (!open) return null

  const run = (fn: () => Promise<unknown>) => async () => {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      pushToast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const connect = run(async () => {
    if (token.trim()) {
      await window.hearth.discordSetToken(token.trim())
      setToken('')
    }
    await window.hearth.discordConnect()
  })

  const join = run(async () => {
    if (guildId && channelId) await window.hearth.discordJoin(guildId, channelId)
  })

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6" onClick={close}>
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-lg border border-hearth-border bg-hearth-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-hearth-border px-4 py-3">
          <h2 className="text-lg font-semibold text-hearth-text">🎧 Discord Bridge</h2>
          <span className="rounded bg-hearth-emberdim/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-hearth-gold">
            experimental
          </span>
          <button onClick={close} className="ml-auto rounded px-2 py-1 text-hearth-muted hover:text-hearth-text" title="Close (Esc)">
            ✕
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          {/* Status line */}
          <div className="flex items-center gap-2 rounded border border-hearth-border/50 bg-hearth-panel2/40 px-3 py-2 text-sm">
            <span
              className={`inline-block h-2 w-2 flex-none rounded-full ${
                state === 'joined'
                  ? 'animate-flicker bg-hearth-ember'
                  : connected
                    ? 'bg-hearth-gold'
                    : state === 'error'
                      ? 'bg-red-500'
                      : 'bg-hearth-muted/40'
              }`}
            />
            <span className="text-hearth-text">{STATE_LABEL[state]}</span>
            {status?.botTag && <span className="text-hearth-muted">· {status.botTag}</span>}
            {state === 'joined' && (
              <span className="truncate text-hearth-muted">
                · {status?.guildName} / 🔊 {status?.channelName}
              </span>
            )}
          </div>
          {status?.error && (
            <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{status.error}</p>
          )}

          {/* Step 1: token + connect */}
          {!connected && (
            <div className="space-y-2">
              <label className="block text-xs text-hearth-muted">
                Bot token {status?.hasToken && <span className="text-hearth-muted/60">(saved — leave blank to reuse)</span>}
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={status?.hasToken ? '••••••••  (saved)' : 'paste your bot token'}
                  className={`${inputCls} mt-1`}
                />
              </label>
              <div className="flex items-center gap-2">
                <button onClick={connect} disabled={busy || (!token.trim() && !status?.hasToken)} className={btnCls}>
                  {busy ? 'Connecting…' : 'Connect'}
                </button>
                <span className="text-[11px] leading-tight text-hearth-muted">
                  Create a bot at discord.com/developers → Bot → token. Invite it with Connect + Speak permissions.
                </span>
              </div>
            </div>
          )}

          {/* Step 2: pick a channel */}
          {connected && state !== 'joined' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <label className="min-w-0 flex-1 text-xs text-hearth-muted">
                  Server
                  <select value={guildId} onChange={(e) => setGuildId(e.target.value)} className={`${inputCls} mt-1`}>
                    <option value="">— pick —</option>
                    {guilds.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0 flex-1 text-xs text-hearth-muted">
                  Voice channel
                  <select
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                    disabled={!guildId}
                    className={`${inputCls} mt-1`}
                  >
                    <option value="">— pick —</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        🔊 {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={join} disabled={busy || !channelId} className={btnCls}>
                  {busy ? 'Joining…' : '▶ Join & stream'}
                </button>
                <button
                  onClick={run(() => window.hearth.discordDisconnect())}
                  disabled={busy}
                  className="rounded border border-hearth-border bg-hearth-panel2 px-3 py-1.5 text-sm text-hearth-muted hover:text-hearth-text"
                >
                  Disconnect bot
                </button>
              </div>
            </div>
          )}

          {/* Game Log → Discord (D1): rolls post to a text channel as embeds. */}
          {connected && (
            <div className="rounded border border-hearth-border/50 bg-hearth-panel2/40 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm text-hearth-text">🎲 Game Log feed</span>
                <span className="text-[10px] text-hearth-muted">public rolls post to a text channel</span>
              </div>
              <select
                value={rollChannelId}
                onChange={(e) => {
                  setRollChannelId(e.target.value)
                  void window.hearth.discordSetRollChannel(e.target.value || undefined)
                }}
                disabled={textChannels.length === 0}
                className={`${inputCls} mt-2`}
                title={textChannels.length === 0 ? 'Pick a server above first' : 'Rolls from sheets, the portal, and public DM rolls land here'}
              >
                <option value="">— off (no Discord posting) —</option>
                {textChannels.map((c) => (
                  <option key={c.id} value={c.id}>
                    # {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Step 3: live */}
          {state === 'joined' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={run(() => window.hearth.discordLeave())}
                  disabled={busy}
                  className="rounded border border-hearth-emberdim bg-hearth-emberdim/20 px-3 py-1.5 text-sm text-hearth-gold hover:bg-hearth-emberdim/40"
                >
                  ⏹ Leave channel
                </button>
                <span className="text-xs text-hearth-muted">
                  Players hear the full mix — the Master fader shapes their level too.
                </span>
              </div>

              {/* The Chronicler — per-speaker session recording */}
              <div className="rounded border border-hearth-border/50 bg-hearth-panel2/40 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-hearth-text">🪶 The Chronicler</span>
                  {status?.chronicling ? (
                    <>
                      <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-red-300">
                        <span className="inline-block h-1.5 w-1.5 animate-flicker rounded-full bg-red-400" />
                        recording
                      </span>
                      <span className="text-xs text-hearth-muted">{status.utterances ?? 0} utterances</span>
                      <button
                        onClick={run(() => window.hearth.chronicleStop())}
                        disabled={busy}
                        className="ml-auto rounded border border-red-400/60 bg-red-500/10 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/20"
                      >
                        ⏹ Stop
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={run(() => window.hearth.chronicleStart())}
                      disabled={busy}
                      className="ml-auto rounded border border-hearth-ember bg-hearth-ember/15 px-2.5 py-1 text-xs text-hearth-ember hover:bg-hearth-ember/30"
                    >
                      ⏺ Record session
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-hearth-muted">
                  Records <b>each speaker separately</b> (WAV per utterance + manifest) into the
                  campaign's <code>recordings/</code> folder — so future transcripts know exactly who
                  said what. No diarization guesswork.
                </p>
                {status?.chronicling && status.chronicleDir && (
                  <p className="mt-1 truncate text-[10px] text-hearth-muted/70" title={status.chronicleDir}>
                    → {status.chronicleDir}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
