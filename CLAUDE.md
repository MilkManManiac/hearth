# DM Companion

Desktop app to help a DM run D&D over Discord: pre-build scenes (music + ambient loops + SFX + images + read-aloud scripts with inline sound-cue buttons), trigger them live; audio streams to the Discord voice channel, images push to players.

Core workflow: the DM describes a scene in plain language and a Claude session authors the scene JSON — suggesting tracks/sounds from the tagged asset library (`campaign/library.json`), placing `{{sfx:...}}`/`{{music:...}}`/`{{image:...}}` cues inside the read-aloud script. Scenes hold *palettes* (multiple music tracks / sounds the DM taps when it feels right), not auto-playlists. The app hot-reloads scene files from disk. Schema and authoring conventions live in `campaign/AUTHORING.md` (written in Phase 1).

**Read `GAMEPLAN.md` first** — it is the source of truth for architecture, stack, data model, and build phases. Follow the phases in order; each must end in a state the DM can actually use.

Key decisions already made (don't relitigate without new evidence):
- Electron + **electron-vite** + React + TypeScript + Tailwind + Zustand
- Web Audio API for all mixing (crossfade, gapless loops, ducking); single mixed stream to Discord
- discord.js v14 + @discordjs/voice for the voice bridge (Kenku FM is the reference implementation)
- JSON files in a campaign folder for storage — no database
- Scope guard: audio + images + party dashboard only. No maps, tokens, or dice — this is not a VTT.

## Working title
The app is currently named **Hearth** (package `hearth`). This is a placeholder — see open question #1 in GAMEPLAN.md. To rename, change `name`/`productName` in package.json and the `Hearth` strings in `src/main/index.ts`, `index.html`, and `src/renderer/components/TopBar.tsx`.

## Running it
- `npm run dev` — hot-reloading dev app (electron-vite)
- `npm run build` — production bundle into `out/`
- `npm run typecheck` — type-check main + renderer
- `node scripts/gen-sample-assets.mjs` — regenerate placeholder audio/art in `campaign-sample/`

The Electron binary downloads on first install; if `node_modules/electron/dist/electron.exe` is missing, run `node node_modules/electron/install.js`.

## Layout
- `src/main/` — Electron main. `index.ts` (windows, `asset://` protocol serving campaign files, IPC), `campaign.ts` (load/watch scenes + library, imports), `authoring.ts` (AUTHORING.md seeded into campaigns).
- `src/preload/` — contextBridge API exposed as `window.hearth`.
- `src/renderer/` — React UI. `audio/AudioEngine.ts` is the Web Audio graph (the heart). `store.ts` (Zustand) wires UI → engine. `components/` is the control board + presenter window.
- `src/shared/` — types + the `scriptText` → script-node compiler, used by both processes.
- `campaign-sample/` — a working campaign (2 scenes, generated placeholder assets) used as the default in dev.

## Campaign folder = data
Scenes are `scenes/*.json`; assets live in `music/ambience/sfx/art/`; `library.json` indexes/tags assets. All `file` paths are campaign-relative. Scenes hot-reload on save (chokidar watch). The full schema + Claude authoring workflow is in each campaign's `AUTHORING.md`. When the DM asks you to build a scene, follow that file.

## Editing & tracking (built on top of Phase 1)
- **Script editor** (`components/ScriptEditor.tsx`): the read-aloud panel has an ✎ Edit mode. It's an uncontrolled `contentEditable` managed via DOM refs (React must not re-render its children). A tray of draggable chips (music/sfx/images) drops cue chips into the prose; chips drag to reposition, have an × to delete, or drag back to the tray to remove. Save serializes DOM → `ScriptNode[]`.
- **Ideas** (`IdeasPanel.tsx`) and **Cast & Loot** (`CastPanel.tsx`): per-scene checklists (`scene.ideas`, `scene.entities`) in the tabbed right panel. Edits persist via `store.updateScene()` → `window.hearth.saveScene()` → `campaign.saveScene()`, which writes the scene JSON (as structured `script`, dropping `scriptText`) and the folder watcher reloads.

## Phase status
Phase 1 (local scene player) is built, plus in-app scene editing (drag-drop sound cues, editable read-aloud) and per-scene Ideas + Cast/Loot tracking. Sample campaign uses real CC0 audio from OpenGameArt (see `campaign-sample/CREDITS.md`). Phases 2–5 (Discord audio bridge, images to players, D&D Beyond dashboard, remaining QoL) are not started — see GAMEPLAN.md §3.

## Canonical location
This project lives at `C:\Users\weshu\CodeProjects\Hearth`. An earlier copy at `C:\Users\weshu\CodeProjects\dnd` is superseded and can be deleted.
