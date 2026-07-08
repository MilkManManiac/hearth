# Discord audio bridge (Phase 2) — design

Status 2026-07-07: **WORKING — first end-to-end test passed** (bot connected,
joined a voice channel, streamed the mix, audio confirmed by ear on the
Discord side; davey loaded fine, no vc_redist needed). A local monitor-mute
(🔊 Local in the TopBar) silences the DM's speakers while streaming so the
bot's playback isn't heard twice — the tap branches off `master` before the
monitor stage. Remaining open items below are now optimizations, not
unknowns.

## Goal

The app's single mixed output (music + ambience + SFX, post-master-fader)
streams into a Discord voice channel, so remote players hear exactly what the
DM hears. One bot, one guild, one voice channel at a time. No per-player
mixing, no voice receive.

## Constraints discovered in research (2026-07)

- **DAVE is mandatory.** Discord's E2EE protocol (DAVE) is enforced for bots
  connecting to voice since **March 2, 2026**. `@discordjs/voice` ≥0.19
  supports it via `@snazzah/davey` (bundled dependency).
- **No sodium needed.** Transport encryption uses `aead_aes256_gcm_rtpsize`,
  available in Electron's Node via built-in crypto.
- **No native opus needed.** `opusscript` (pure JS/WASM) encodes our single
  48 kHz stereo stream fine; we deliberately avoid `@discordjs/opus`
  (node-gyp) on this machine.
- **Known machine gotcha:** `vcruntime140.dll` is missing here (see
  CLAUDE.md). If `@snazzah/davey`'s prebuilt binary fails to load
  (`ERR_DLOPEN_FAILED`), the fix is installing **vc_redist.x64** — the bridge
  surfaces this as an actionable error instead of crashing.

## Architecture

```
renderer (Web Audio)                    main (Node)                 Discord
┌───────────────────────────┐   IPC    ┌──────────────────────┐
│ master GainNode           │  20–27ms │ DiscordBridge        │
│   ├─→ ctx.destination     │  Int16   │  PassThrough (s16le  │  Opus/DAVE
│   └─→ AudioWorklet "tap"  │  chunks  │  48k stereo, raw)    │──────────→
│        Float32 → Int16    │ ───────→ │  → createAudioResource│  voice ch.
│        (inline Blob code) │          │  → AudioPlayer        │
└───────────────────────────┘          └──────────────────────┘
```

- **The tap** is an `AudioWorkletNode` fed from `master` (post-fader, so the
  Master slider controls what players hear too). It converts Float32 planar →
  Int16 interleaved and posts ~21 ms batches. It runs continuously —
  silence streams as zeros, which keeps the voice connection's audio player
  in Playing state with no underruns.
- **AudioContext is pinned to 48 kHz** (`new AudioContext({ sampleRate:
  48000 })`) so no resampling is needed anywhere; Discord voice is 48 kHz.
- **IPC volume** is ~37 messages/s × ~4 KB — trivial for Electron IPC.
- **Main process** wraps the chunks in a `PassThrough` consumed by
  `createAudioResource(stream, { inputType: StreamType.Raw })`. Backpressure:
  if the internal buffer exceeds ~1 s of audio the oldest data is dropped
  (live audio must never lag; drops beat drift).
- **Bot client** uses minimal intents (`Guilds`, `GuildVoiceStates`).

## UX flow

1. TopBar **🎧 Discord** button → panel.
2. Paste bot token once (stored in `userData/hearth-config.json`, never in the
   repo) → Connect.
3. Pick server → pick voice channel → **Join**. Status chip shows
   connected/streaming state; Leave/Disconnect buttons.
4. Everything the DM plays is heard live by the channel.

Bot setup (one-time, in the Discord developer portal):
- Create application → Bot → copy token.
- Invite URL scopes: `bot` with permissions `Connect` + `Speak` (+ View
  Channels), e.g. permissions integer 3145728.

## Files

- `src/main/discord.ts` — `DiscordBridge`: token store, login, guild/channel
  listing, join/leave, PCM ingest, status events, error surfacing (incl. the
  vc_redist case).
- `src/main/index.ts` — IPC: `discord:set-token`, `discord:connect`,
  `discord:disconnect`, `discord:guilds`, `discord:channels`, `discord:join`,
  `discord:leave`, `discord:status`, plus the high-rate `discord:pcm` sink and
  `discord:status-changed` broadcast.
- `src/preload/index.ts` — mirrors the above.
- `src/renderer/audio/AudioEngine.ts` — 48 kHz context + `startTap(cb)` /
  `stopTap()` (inline-Blob AudioWorklet).
- `src/renderer/components/DiscordPanel.tsx` — the modal UI; store slice in
  `store.ts` (status, connect/join actions, tap lifecycle tied to join state).

## The Chronicler (added 2026-07-08)

Craig-style **per-speaker session recorder** built into the bridge. While
joined, 🪶 "Record session" in the Discord panel subscribes to each speaking
user (`connection.receiver`, `EndBehaviorType.AfterSilence` 800ms), decodes
opus→PCM via opusscript (same no-native-deps policy), and writes:

- `<campaign>/recordings/session-<stamp>/<offsetMs>-<user>.wav` per utterance
  (48kHz stereo s16le; <0.25s blips dropped)
- `manifest.jsonl` — one line per utterance: user, userId, startMs/endMs,
  seconds, file
- `session.json` — start time, guild/channel, format notes

Purpose: future transcripts get **perfect speaker attribution** (no
diarization). Whisper each WAV, order by startMs, done.

Notes/limits:
- Join is now `selfDeaf: false` (a deafened bot receives nothing).
- WAV is uncompressed (~690MB/hr per *continuously* talking speaker; real
  sessions are far less). Follow-up: ffmpeg pass to ogg/flac after stop.
- DAVE E2EE receive path untested until the next live session.
- TopBar shows a red **rec** chip while recording; recordings are gitignored.

## Open items before "done"

- [ ] First live test with a real bot token (join, audio audible, latency ok).
- [ ] Verify davey loads on this machine (vc_redist may be required — see
  above).
- [ ] Latency measurement; consider `highWaterMark` tuning on the PassThrough.
- [ ] Reconnect/resume behavior on network blips (@discordjs/voice has
  built-in reconnect; verify the tap survives).
- [ ] Presenter "images to players" (Phase 3) is separate — unchanged.
