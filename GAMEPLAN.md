# DM Companion — Gameplan

**Goal:** A tool for a DM running a homebrew D&D (2024 rules) campaign over Discord, with character sheets on D&D Beyond. Pre-build "scenes" before a session (music + layered ambient loops + one-shot SFX + images/handouts + read-aloud scripts), then trigger them live during play from a single control board — audio lands in the Discord voice channel, images land in front of the players.

**Three workflow requirements that shape the design:**
1. **The DM's own audio files are first-class.** Everything plays from local files; importing your own music/SFX into the library is a core flow, not an afterthought.
2. **Scenes are palettes, not playlists.** A scene holds *multiple* candidate tracks and sounds; during play the DM taps whichever fits the moment. Nothing auto-advances unless asked to.
3. **Claude is the scene author.** The DM describes a scene in plain language ("rowdy dockside tavern, a brawl might break out, the party meets a nervous informant"); Claude suggests tracks/sounds from the tagged library (and free sources), the DM contributes files, and Claude writes the scene JSON — including a read-aloud script with sound-cue buttons embedded mid-text. The whole data layer is designed to make this trivial (plain JSON + conventions, see §2b).

This plan is the synthesis of four research passes: existing-tools landscape, Discord audio transport, player-facing visuals + D&D Beyond access, and app stack + audio assets. Decisions below are made; open questions for the user are flagged at the bottom.

---

## 1. What the research found (context for every decision)

### The gap we're filling
No existing tool combines scene prebuilding + one-click live triggering + Discord audio + image display:
- **Kenku FM** (open source, GPL-3, Electron, by Owlbear Rodeo — github.com/owlbear-rodeo/kenku-fm) is the gold standard for getting mixed audio into a Discord voice channel, and is actively maintained (v1.5.5, 2026). But it has **no scene concept, no crossfade automation, no images**. It also exposes **Kenku Remote**, a local HTTP API for controlling its playlists/soundboard.
- **Syrinscape / Tabletop Audio / Pocket Bard / Fantasy+** — good audio content, but no native Discord integration (VoiceMeeter workarounds) and no images.
- **Foundry VTT** has scenes+playlists but no Discord audio bridge and is a much heavier commitment.
- Typical DM workaround today = 5+ apps and 30–90 min of audio-routing setup. That's what we're killing.

### How audio gets into Discord (the load-bearing technical fact)
- A Discord bot voice connection plays **one Opus stream at a time** (48kHz stereo, 20ms packets). You cannot layer music + rain + SFX as separate bot streams — you must **pre-mix into one stream**.
- **Web Audio API is the mixer.** Kenku FM's proven architecture: Electron app → all sources play through a Web Audio graph (per-layer GainNodes → master bus) → `MediaStreamDestination` capture → encode to Opus → stream to Discord via a bot library (Kenku uses Eris; `@discordjs/voice` v0.18+ with discord.js v14 is the better-documented modern choice).
- Web Audio gives us sample-accurate crossfades, gapless loops (`AudioBufferSourceNode.loop`), and ducking (gain ramp on the music bus when SFX fires) — all things a plain bot can't do.
- Playing **local/licensed files** via a private single-server bot is ToS-clean (the music-bot crackdowns were about YouTube ripping).
- Reliability note: multi-hour voice sessions can accumulate WebSocket errors — build reconnect-with-backoff from day one.
- Fallback that always works: VB-Cable/VoiceMeeter routing the app's local output into Discord's mic input (Windows-only, manual, but a fine emergency backup).

### How images get to players
- **MVP: a Discord bot posts the image as an embed to a #scenes text channel.** Zero friction, players are already in Discord, ~20 lines of code.
- **V2: player-facing web page** ("player screen") — players open a URL once; the app pushes images/reveals over WebSocket. Full-screen art, timed reveals, no chat clutter. No off-the-shelf open-source example exists, but the pattern is trivial (local server + tunnel or bot-DM'd link).
- Discord screen-share is documented as poor for art (compression, 720p without Nitro). Discord Activities (Embedded App SDK) could host the player screen *inside* Discord eventually, but require team registration/approval — a v3 idea, not a dependency.

### D&D Beyond sheet data (party dashboard)
- The unofficial endpoint `https://character-service.dndbeyond.com/character/v5/character/{id}` **still works, no auth, for PUBLIC characters** (private ones need a Cobalt session cookie). This is how Avrae/ddb-importer/Beyond20 ecosystems operate; WotC tolerates them but there is **no official API and no guarantee** — treat as medium-risk, cache aggressively, degrade gracefully (manual entry fallback).
- Useful fields: name, classes/levels, ability scores, max HP, AC (needs computing from equipment/modifiers — nontrivial), skills → passive Perception/Insight/Investigation, spells, conditions.

### Legal audio sources for a private Discord game
- **Sonniss GDC packs** — huge free SFX libraries, royalty-free, no attribution, explicitly safe. Primary SFX source.
- **Pixabay** — free music+SFX, streaming explicitly OK.
- **Kevin MacLeod / Incompetech** — CC-BY music (credit in a pinned message covers it).
- **Freesound** — filter to CC0/CC-BY.
- **Tabletop Audio** — CC-BY-NC; fine for a private game, but treat streaming conservatively.
- The DM's own purchased/owned files always work — the app plays local files, so any library the user owns is usable.

---

## 2. Architecture (decided)

**One Electron desktop app** (the Kenku FM model — it's the proven shape for this exact problem), containing:

```
┌─ Electron app (DM's machine) ───────────────────────────────┐
│  React + TypeScript UI                                       │
│  ├─ Scene Builder (prep mode)                                 │
│  ├─ Control Board (session mode)                              │
│  │                                                            │
│  Audio Engine (Web Audio API, renderer process)               │
│  ├─ music bus ──┐                                             │
│  ├─ ambient bus ┼─→ master gain → ① local monitor (DM hears)  │
│  ├─ sfx bus ────┘        └──────→ ② MediaStreamDestination    │
│  │                                    ↓                        │
│  Discord bridge (main process)   Opus encode                  │
│  ├─ bot joins voice channel ←────────┘  (@discordjs/voice)    │
│  └─ bot posts scene images to #scenes text channel            │
│                                                               │
│  Local HTTP/WS server (v2): serves the Player Screen page     │
│  Storage: JSON files in a user-chosen campaign folder         │
└──────────────────────────────────────────────────────────────┘
```

**Stack:**
| Layer | Choice | Why |
|---|---|---|
| Shell | Electron (Forge + Vite template) | Kenku-proven; pure TS (no Rust tax); stable over 4-hr sessions; best hot-reload iteration with Claude Code |
| UI | React 18/19 + TypeScript + Tailwind | fast iteration |
| State | Zustand | lightweight, fits audio-engine singletons |
| Audio | Web Audio API directly (no wrapper lib) | crossfade/loop/duck need raw graph control |
| Discord | discord.js v14 + @discordjs/voice v0.18+ (Node ≥22.12) | maintained + documented (Eris is the Kenku precedent but worse docs) |
| Storage | JSON files (`campaign/scenes/*.json`, `campaign/library.json`) + assets as plain files on disk | human-readable, git-able, zero migrations; SQLite only if it ever outgrows this |

**Setup burden on the DM (one-time):** create a Discord application/bot in the dev portal, invite it to the server with voice + message permissions, paste the token into the app's settings. Same flow Kenku FM uses.

**De-risk shortcut (keep in back pocket):** if the Discord voice bridge fights us, ship v0 driving **Kenku FM via its Kenku Remote HTTP API** for audio transport while we build our own bridge. Don't start here — our own bridge unlocks crossfade/ducking, which is the point — but it's the escape hatch.

### Data model (v1 sketch)

A scene's `music` and `sfx` are **palettes**: sets of cued options the DM picks from live. One music track can be flagged `default` (starts on scene switch); the rest sit as buttons. Tapping another music track crossfades to it; ambience layers loop underneath throughout.

```jsonc
// campaign/scenes/goblin-ambush.json
{
  "id": "goblin-ambush",
  "name": "Goblin Ambush — Old Forest Road",
  "dmNotes": "Krag flees at half HP. Stealth DC 13 to notice the snare line.",
  "music": [                                                           // palette — DM picks live
    { "id": "travel",  "label": "Uneasy travel", "file": "music/forest-tension.mp3", "volume": 0.6, "default": true },
    { "id": "combat",  "label": "Ambush!",       "file": "music/combat-drums.mp3",   "volume": 0.7 },
    { "id": "aftermath","label": "Aftermath",    "file": "music/somber-strings.mp3", "volume": 0.5 }
  ],
  "ambience": [                                                        // all loop simultaneously
    { "file": "ambience/forest-birds.ogg", "volume": 0.4 },
    { "file": "ambience/wind-light.ogg",  "volume": 0.3 }
  ],
  "sfx": [                                                             // one-shot palette w/ hotkeys
    { "id": "shriek",   "label": "Goblin shriek", "file": "sfx/goblin1.wav",    "hotkey": "1", "duckMusic": true },
    { "id": "snare",    "label": "Snare springs", "file": "sfx/rope-snap.wav",  "hotkey": "2", "duckMusic": true }
  ],
  "images": [
    { "file": "art/forest-road.jpg", "caption": "The Old Forest Road", "playerFacing": true },
    { "file": "art/goblin-boss.png", "caption": "Krag the Vile", "playerFacing": true }
  ],
  "script": [                                                          // read-aloud with inline cues
    { "type": "text", "text": "The road narrows beneath ancient oaks. Birdsong thins, then stops entirely." },
    { "type": "cue",  "kind": "music", "ref": "combat", "label": "▶ Ambush!" },
    { "type": "text", "text": "Shapes drop from the branches — " },
    { "type": "cue",  "kind": "sfx", "ref": "shriek", "label": "🔊 shriek" },
    { "type": "text", "text": " — and a snarling voice cries out: \"Take the fat one alive!\"" },
    { "type": "cue",  "kind": "image", "ref": "art/goblin-boss.png", "label": "🖼 show Krag" }
  ],
  "transition": { "crossfadeMs": 2500 }
}
```

The **script** renders on the control board as flowing read-aloud text with small tappable buttons embedded exactly where the cue lands — the DM reads, hits the button mid-sentence, keeps reading. Cues can trigger sfx, switch music, or push an image. In authored markdown (see §2b) cues are written inline as `{{sfx:shriek}}` / `{{music:combat}}` / `{{image:art/goblin-boss.png}}` and compiled to this structure.

```jsonc
// campaign/library.json — the asset library index (Claude-maintained)
{
  "assets": [
    { "file": "music/combat-drums.mp3", "kind": "music",
      "tags": ["combat", "drums", "urgent", "goblin", "forest"],
      "source": "user-upload", "license": "owned" },
    { "file": "sfx/goblin1.wav", "kind": "sfx",
      "tags": ["goblin", "shriek", "creature"],
      "source": "sonniss", "license": "royalty-free" }
  ]
}
```

Campaign folder = portable, backupable, and Claude-editable.

### 2b. Claude-assisted scene authoring (the "busywork" workflow)

This is a *workflow convention*, not app code — it works from day one because storage is plain files:

1. **Import & tag:** DM drops files into `campaign/music|ambience|sfx/` (or uses the app's import button, which copies files there). DM tells Claude Code "I added 12 files, tag them" → Claude listens to filenames/metadata, asks about ambiguous ones, updates `library.json` with descriptive tags.
2. **Describe → draft:** DM writes/says a scene description. Claude picks matching assets from `library.json` by tag, flags gaps ("no dockside ambience in the library — want me to find CC0 options on Pixabay/Freesound and give you download links?"), drafts the read-aloud script with `{{cue}}` markers placed for dramatic effect, and writes the scene JSON.
3. **Review in app:** DM opens the scene in the Scene Builder, tweaks volumes/order, done. The app watches the campaign folder and hot-reloads changed scene files, so the Claude-edit → app-preview loop is instant.
4. Scene files may also be authored as markdown (`scenes/goblin-ambush.md` with frontmatter + `{{cue}}` syntax) which the app compiles on load — whichever proves more pleasant to review; support JSON first, markdown as sugar.

A `campaign/AUTHORING.md` file (written in Phase 1) documents the schema + conventions so any Claude session can author scenes correctly without rediscovering the format. Later (v3): an in-app "describe a scene" box calling the Claude API directly — but the file-based workflow is the MVP and stays the ground truth.

---

## 3. Build phases (for Opus to execute in order)

Each phase ends with something the DM can actually use at the table. Verify each phase by running it, not just compiling.

### Phase 1 — Local scene player (usable immediately, no Discord yet)
Scaffold Electron Forge + Vite + React + TS. Build:
- Audio engine: load files, gapless ambient loops, crossfade between any two music tracks, per-bus + master volume, SFX one-shots with optional music ducking (gain ramp ~-8dB, 100ms attack / 800ms release).
- Scene model + JSON persistence with **folder watching/hot-reload** (so Claude-edited scene files appear live in the app).
- Asset library: import button (copies files into the campaign folder), `library.json` index, simple list/filter view.
- Control Board: scene list → click to crossfade-switch (default track starts); **music palette buttons** (tap to crossfade to that track mid-scene); SFX grid with hotkeys; **script panel** rendering read-aloud text with inline cue buttons; image strip with full-screen preview on a second window (screen-shareable stopgap).
- Minimal Scene Builder (pick files from library, set volumes, order images) — but Claude-authored JSON is the primary authoring path, so this can stay thin.
- Write `campaign/AUTHORING.md` (schema + cue syntax + tagging conventions for Claude sessions).
- **Exit criteria:** DM describes a scene to Claude Code, Claude writes the JSON, the app hot-loads it; DM switches scenes with a 2.5s crossfade, taps between the scene's music options, and fires a cue button embedded in the read-aloud script — all on local speakers.

### Phase 2 — Discord audio bridge
- Bot settings screen (token, guild, voice channel picker). Bot joins voice channel.
- Route the Web Audio master mix → MediaStreamDestination → PCM → Opus → `@discordjs/voice` AudioResource. (Reference Kenku FM's capture code; their approach of streaming the renderer's mixed audio to the main process is the pattern to follow.)
- DM monitor stays on local speakers, independent volume from what Discord hears.
- Reconnect-with-exponential-backoff; status indicator on the control board.
- **Exit criteria:** players in the voice channel hear the scene switch and SFX; a 4-hour soak test (leave it playing) survives or auto-recovers.

### Phase 3 — Images to players
- 3a (MVP): bot posts the selected image as an embed (title = caption) to a configured #scenes channel on a button press. "Push all scene images" and per-image push.
- 3b (V2): embedded HTTP+WebSocket server serving a Player Screen page — black background, current image, caption, fade transitions. Players get the link once (bot can DM it). Expose beyond LAN via a tunnel (cloudflared) or accept LAN/screen-share for remote-only groups — decide when we get there.
- **Exit criteria:** during play, DM clicks an image and every player sees it within ~2s without touching anything.

### Phase 4 — Party dashboard (D&D Beyond)
- Settings: paste each player's D&D Beyond character URL (characters set to public).
- Fetch `character-service.dndbeyond.com/character/v5/character/{id}`, compute AC/passives/max HP; cache to disk; manual refresh button (no polling); manual-override fields for when the endpoint breaks or a character is private.
- Show a compact always-visible strip on the control board: name, AC, max HP, passive Perception/Insight/Investigation, speed, key notes.
- **Exit criteria:** dashboard shows the real party; app still fully works with D&D Beyond unreachable.

### Phase 5 — Quality of life (pick by pain, not by list order)
- Global hotkeys (works while Discord is focused) via `uiohook-napi`.
- Richer asset library browser: tag editing in-app, search, waveform preview, drag-drop into scenes.
- "Session plan": ordered scene queue for tonight with next/prev.
- Read-aloud text on the Player Screen; NPC portrait quick-flash; combat "intensity" layers (add drums on top of exploration music).
- Stream-Deck-style remote: reuse the Player Screen server to serve a DM phone remote.
- In-app scene assistant: a "describe a scene" box that calls the Claude API and runs the §2b workflow inside the app (until then, Claude Code in the campaign folder does this).

---

## 4. Risks & mitigations
| Risk | Level | Mitigation |
|---|---|---|
| Opus encoding pipeline from renderer MediaStream is fiddly | Med | Kenku FM source is the working reference; fallback = Kenku Remote transport (§2) or VB-Cable stopgap |
| Long-session voice disconnects | Med | reconnect/backoff + on-screen status from day one |
| D&D Beyond endpoint breaks/blocks | Med | cache + manual override fields; feature is additive, never load-bearing |
| Licensing of streamed audio | Low | private non-commercial game; prefer Sonniss/Pixabay/CC-BY; user's own purchased libraries |
| Scope creep toward "build a VTT" | High | We are not building maps/tokens/rolling. Owlbear Rodeo exists. Audio + images + dashboard only. |

## 5. Open questions for the user (don't block Phase 1 on these)
1. App/project name? (working title needed for the repo + window title)
2. Are all players remote, or is it hybrid (some in-room)? — affects Player Screen tunnel decision in Phase 3b only.
3. Does the group already use Avrae or Beyond20? (If Avrae: possible SFX-on-crit tie-in later.)
4. Nitro/server boost level? (Only affects voice bitrate ceiling; 64kbps default is fine for ambience.)

## 6. Kickoff checklist for Opus
1. `git init`, scaffold Electron Forge + Vite + TypeScript + React + Tailwind + Zustand.
2. Add `CLAUDE.md` (project conventions, this file as the source of truth).
3. Build Phase 1 audio engine first (it's the heart); UI second.
4. Grab 3–4 test assets (Pixabay music track, 2 Sonniss/Freesound CC0 loops, 1 SFX) into `campaign-sample/`.
5. Study `owlbear-rodeo/kenku-fm` before Phase 2 — especially how it captures renderer audio and streams to Discord.
