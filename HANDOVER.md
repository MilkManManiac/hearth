# Handover plan — working the TODOS.md backlog

For the next (Opus) session. Read `CLAUDE.md` first, then `TODOS.md` for the raw
backlog. This file turns that backlog into an ordered, concrete work plan with
code-level findings from a review pass (2026-07-05). Work top to bottom; each
item should end verified in the running app (`npm run dev`), not just typechecked.

---

## 1. Audio reliability bug (TODOS #3) — do first, it's a live bug

Symptom: "audio doesn't always play when I click the button." Findings from
reading `src/renderer/audio/AudioEngine.ts`:

**1a. Kill the autoplay policy at the Electron level (likely root cause).**
Every trigger path does `await this.resume()`, but by the time the async chain
runs, Chromium may no longer consider it inside a user gesture — first-click
audio can stay suspended. In Electron we control the browser, so make the
policy moot in `src/main/index.ts` (before `app.whenReady()`):
```ts
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
```
Keep `resume()` as belt-and-braces, but this removes the gesture dependency
entirely.

**1b. Fix the double-start race in `switchMusic()` / `loadScene()`.**
`AudioEngine.switchMusic()` checks `activeMusic?.trackId === track.id` *before*
`await this.getBuffer(...)`. Two rapid clicks (or click during a slow first
decode) both pass the guard → two overlapping sources, and the older one is
never stopped. Fix with a monotonically increasing "switch token" (or track a
`pendingTrackId`): after the await, bail if a newer request superseded this
one. Same pattern applies to `setAmbience()` racing `loadScene()`.

**1c. Surface silent failures.** `playSfx()` and `setAmbience()` swallow
decode/fetch errors (`catch { return }` / `continue`). Add an `onError`
listener channel on the engine (alongside `subscribe`), pipe it to a small
toast in the UI, and add a "now playing" indicator (track label + subtle level
or pulse) to the TopBar so the DM can tell audio is actually running. TODOS #3
asks for exactly this.

**1d. Verify weird filenames end-to-end.** `assetUrl()` encodes per-segment and
`registerAssetProtocol()` decodes `decodeURIComponent(pathname)` — spaces
should round-trip, but the sample campaign contains `music/Falloutv2 (1).mp3`;
use it as the regression test. Also test `#` and `%` in a filename (both are
known `encodeURIComponent`/URL-parsing edge cases). Add a tiny dev-only
"probe all library assets, report failures" action so broken files show up in
the errors list instead of failing silently at the table.

**Verify:** fresh app start → very first click on an SFX plays; spam-click a
music palette button → exactly one track audible; rename a file to break a
scene → toast appears.

## 2. Library categories, search, preview + more sounds (TODOS #4, #5)

Data model first, then UI, then content:

**2a. Schema.** Add `category?: string` to `LibraryAsset`
(`src/shared/types.ts`), document the taxonomy from TODOS #4 (creatures,
combat, magic, weather, water, fire, places, objects, horror, ui) in
`campaign-sample/AUTHORING.md` + the seeded authoring template in
`src/main/authoring.ts`. Backfill `campaign-sample/library.json`.

**2b. Library UI.** A proper library browser panel: group by category, filter
by category/tag, search box, and an audition ▶ button per asset (route through
a dedicated preview method on the engine — one-shot, no ducking, stoppable).
The ScriptEditor drag tray should group its chips by category too.

**2c. Content.** Expand the stock library with CC0 sounds/music covering the
TODOS #4 taxonomy and TODOS #5 moods (exploration, town, tavern, tension,
combat, boss, victory, somber, mystery, travel, seafaring, horror).
`scripts/gen-sample-assets.mjs` and `campaign-sample/CREDITS.md` show the
existing pattern — OpenGameArt/Pixabay/Freesound CC0, every file documented in
CREDITS. Tag by mood + setting so Claude scene-authoring suggestions improve.
This step needs web downloads — batch it, and keep licenses strictly
CC0/royalty-free.

## 3. Per-scene playlist with fades (TODOS #6)

Grill-worthy but smaller than the editor rewrite. Sketch before building:
- Schema: `scene.playlistMode?: boolean` (or `music.mode: 'palette' | 'playlist'`)
  plus per-track `fadeInMs`/`fadeOutMs`; palette behavior stays the default.
- Engine: tracks currently loop forever (`source.loop`); playlist mode needs
  `loop = false` + end detection (`onended` fires on `stop()` too — distinguish
  natural end from manual stop), auto-advance with crossfade, shuffle,
  loop-the-playlist.
- UI: "now playing" strip with prev/next + progress bar (progress needs
  start-time bookkeeping in the engine; there is none today).

## 4. Drag & drop editor rewrite (TODOS #2) — grill session REQUIRED first

Do **not** start this without running `/grilling` with the user. The current
`ScriptEditor.tsx` is raw uncontrolled contentEditable and has corrupted real
scene text (mid-word drops, stray spaces). The grill session should decide:
- Editor foundation: Lexical vs TipTap vs ProseMirror vs improved
  contentEditable (atomic inline cue nodes are the key requirement).
- Word-boundary snapping + visible drop caret; chip hit targets; undo/redo.
- Serialization must stay `ScriptNode[]` (see `src/shared/types.ts`) so scene
  JSON and `scriptCompile.ts` are untouched.

## 5. Design pass (TODOS #1) — last / ongoing

Atmospheric "at the table" feel, prep-vs-run mode split, empty states,
iconography. Use the `frontend-design`-style skills if available. Cheap wins
(empty states, spacing) can ride along with items 2–3; the full pass waits
until the above are stable.

---

## Process notes
- Verify each item live (`npm run dev`), not just `npm run typecheck`.
- Update `TODOS.md` (check items off / delete) and `CLAUDE.md` phase notes as
  things land; keep `CREDITS.md` current with every asset added.
- The user wants grill sessions before the editor rewrite (#4) and ideally the
  playlist model (#3) — TODOS.md bottom section has the skill links
  (`grill-with-docs` by Matt Pocock would need installing; plain `grilling`
  is already available).
- Phases 2–5 of GAMEPLAN.md (Discord bridge, player images, DDB dashboard) are
  intentionally NOT in this plan — this is the polish/reliability pass on
  Phase 1. Don't drift into them.
