# DM Companion — Hearth

Desktop app to help a DM run D&D over Discord: pre-build scenes (music + ambient loops + SFX + images + read-aloud scripts with inline sound-cue buttons), trigger them live; audio streams to the Discord voice channel, images push to players. **It is also the DM's campaign notebook** — a wiki-linked notes system lives beside the scenes (see below).

Core workflow: the DM describes a scene in plain language and a Claude session authors the scene JSON — suggesting tracks/sounds from the tagged asset library (`campaign/library.json`), placing `{{sfx:...}}`/`{{music:...}}`/`{{image:...}}`/`{{amb:...}}` cues inside the read-aloud script. Scenes hold *palettes* (multiple music tracks / sounds the DM taps when it feels right), not auto-playlists. The app hot-reloads scene AND note files from disk. Schema + authoring conventions live in each campaign's `AUTHORING.md` — **when the DM asks you to build a scene or notes, follow that file.**

**Read `GAMEPLAN.md`** for architecture/stack/data-model rationale, and **`AUDIT-2026-07-10.md`** for the current punch list (known bugs, priorities, decisions pending).

Key decisions already made (don't relitigate without new evidence):
- Electron + **electron-vite** + React + TypeScript + Tailwind + Zustand
- Web Audio API for all mixing (crossfade, gapless loops, ducking); single mixed stream to Discord
- discord.js v14 + @discordjs/voice for the voice bridge (Kenku FM is the reference implementation)
- JSON files in a campaign folder for storage — no database
- Scope (UPDATED 2026-07-10, Wes's directive): the one-stop DM shop — audio, images, notes, **rules compendium (SRD 5.2.1/2024), characters, encounters, maps-with-fog**. See ONESTOP-PLAN.md. Still not chasing Foundry-grade VTT depth (no dynamic lighting/vision).
- Interaction rule: **read-first surfaces; authoring is gated behind build mode + ✎ Edit toggles; plain-click on a [[link]] navigates.** (The note page historically violated this — fix tracked in AUDIT P0.)

## Working title
**Hearth** (package `hearth`) — placeholder; see open question #1 in GAMEPLAN.md. To rename: `name`/`productName` in package.json + the `Hearth` strings in `src/main/index.ts`, `index.html`, `src/renderer/components/TopBar.tsx`.

## Running it
- `npm run dev` — hot-reloading dev app (electron-vite)
- `npm run build` — production bundle into `out/`
- `npm run typecheck` — type-check main + renderer
- `npm run pack` — package a runnable Windows build into `%LOCALAPPDATA%\hearth-release\win-unpacked\` (output lands OUTSIDE the repo on purpose — Defender file-locks break the rename inside it; see DEPLOY.md). The DM has a desktop shortcut pointing there — **re-run pack after app changes or the shortcut launches a stale build** (fails with EBUSY while Hearth is running — close it first).
- `npm run dist` — same but also builds the portable single .exe
- `node scripts/gen-sample-art.mjs` — regenerate placeholder art (art only; there is no audio-gen script)
- `node scripts/build-compendium.mjs <srd-2024 fixture dir>` — rebuild `public/compendium/*.json` from Open5e fixtures (see ONESTOP-PLAN.md; output is committed, rerun only on data updates)

Which campaign opens: `%APPDATA%\Hearth\hearth-config.json` → `campaignPath` (also holds the Discord bot token — the same file, merge-write it, never overwrite wholesale). The TopBar folder picker switches campaigns in-app.

The Electron binary downloads on first install; if `node_modules/electron/dist/electron.exe` is missing, run `node node_modules/electron/install.js`.

**Known env gotcha (this machine):** Electron 43's installer unzips via a Rust native module that needs the **MS Visual C++ Redistributable** — `vcruntime140.dll` was missing here, so `install.js` fails with `ERR_DLOPEN_FAILED`. Durable fix: install `vc_redist.x64`. Workaround already applied once: download the zip with `@electron/get`, `Expand-Archive` into `node_modules/electron/dist`, write `path.txt` = `electron.exe`.

## Layout
- `src/main/` — Electron main. `index.ts` (windows, `asset://` protocol serving campaign files, IPC), `campaign.ts` (load/watch scenes + notes + library, saves, imports, triage), `discord.ts` (voice bridge + The Chronicler recorder), `authoring.ts` (AUTHORING.md seeded into campaigns).
- `src/preload/` — contextBridge API exposed as `window.hearth`.
- `src/renderer/` — React UI. `audio/AudioEngine.ts` is the Web Audio graph (the heart). `store.ts` (Zustand, large — split planned) wires UI → engine. `components/` is the control board + presenter window + notes UI. `editor/` is the TipTap stack. `lib/` small helpers (keys, fuzzy, noteNav, prefs).
- `src/shared/` — types + the `scriptText`/`bodyText` → `ScriptDoc` compiler (`scriptCompile.ts`), used by both processes.
- `campaign-sample/` — a working campaign (4 scenes; 2,311-asset library index — **bulk audio is gitignored**, a fresh clone has ~305 of the files; use 🔎 Probe to see gaps) — the default in dev.
- `campaigns/elor-rebirth/` — the real campaign's **notes-only git snapshot** (90+ notes, no audio/art). The DM's live campaign folder may be elsewhere per machine; sync = pull repo, copy notes over (see its README.md). `grill-queue.json` inside is the running brainstorm ledger — start campaign work there.
- `downloader/` — separate Python tool (spotDL/yt-dlp GUI) that drops tagged audio into `Downloads\Hearth YT Downloads` for the 📥 Triage inbox. Personal-use audio only (stamp `license: private`).

## The two data kinds in a campaign folder
- **Scenes** (`scenes/*.json`): music/ambience/sfx palettes + images + read-aloud script. `scriptText` = markdown + `{{cues}}`, compiled to a `ScriptDoc` rich-text tree on load; once edited in-app it persists as structured `script`.
- **Notes** (`notes/*.json`): the campaign knowledge base — kinds: session/npc/pc/location/faction/item/thread/note. `bodyText` markdown compiles the same way. Features: **[[wiki-links]]** (`[[note-id]]` / `[[note-id|label]]`, hover-peek cards, back/forward history Alt+←/→, backlinks + unlinked-mentions on every note page, create-on-click for unresolved refs, `[[` autocomplete in editors), **checklists** (`- [ ]` lines; unchecked secrets carry forward into the next session note), sessions group scenes, **Ctrl+K** fuzzy switcher, **Ctrl+J** quick capture to the session log.

## Editing & tracking
- **Script editor** (`components/ScriptEditor.tsx`): ✎ Edit mode on the read-aloud panel, built on TipTap. Custom nodes in `src/renderer/editor/`: cue chips (`CueChip.tsx` — every cue has a ⚙ popover to retarget it), `[[link]]` chips (`NoteLinkChip.tsx`), checklist items (`CheckItem.tsx`), callouts; `mapping.ts` is the only ScriptDoc↔TipTap translator. Drops snap to word boundaries; autosave (debounced) + undo/redo. `ScriptPanel.tsx` renders read-only with cues as live fire-buttons + the Space-driven teleprompter.
- **Notes UI**: `NotesRail` (left tab), `NoteView` (note page: title/kind/status + editor + backlinks/mentions), `NoteBody` (compact read-only renderer used by the run-mode right panel + peek cards), `NotePeek` (hover cards + nav buttons), `QuickSwitcher`/`QuickCapture`.
- **Ideas** (`IdeasPanel.tsx`) and **Cast & Loot** (`CastPanel.tsx`): per-scene lists in the right panel; Cast rows promote to campaign notes via ⤴ (keeps a 📓 link).

## Status (2026-07-10)
- **Phase 1 (local scene player): done and heavily extended** — arm-vs-Go-live, Now Sounding strip, mini-mixers, teleprompter, playlists, loudness normalization, library browser + triage inbox, favorites/recents, 🔎 Probe.
- **Notes system ("Phase 6", spec was NOTES-PLAN.md): N1–N4 all shipped** — see "two data kinds" above.
- **Phase 2 (Discord bridge): built**; status docs contradict each other on how tested it is (DISCORD-BRIDGE.md header says first live voice test passed; its checklist and DEPLOY.md say untested) — **ask the DM before relying on it**. The Chronicler (per-speaker session recorder) rides on it.
- **Phase 3 (images to players beyond the presenter window) + Phase 4 (D&D Beyond dashboard): not started** — keep-or-kill decision pending (AUDIT).
- **Packaging: Windows portable + unpacked builds work** (DEPLOY.md); mac not set up.
- Known bugs & priorities: **AUDIT-2026-07-10.md** is the punch list.

## Sound library rules
Tier A (CC0/CC-BY) sources only for anything committed/bundled — see SOUND-SOURCES.md; per-file credits in campaign-sample/CREDITS.md (CC-BY requires the attribution line). YouTube/Spotify rips = `license: private`, never committed. Bulk audio stays gitignored.

## Canonical location
`C:\Users\weshu\CodeProjects\Hearth`, GitHub `MilkManManiac/hearth`. The repo is the sync point across the DM's computers: **always `git pull` at session start and commit+push at session end** — notes edits especially, since the DM hops machines.
