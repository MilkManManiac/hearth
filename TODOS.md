# Hearth — TODOs / backlog

Captured for later. Not being worked on yet. We'll likely run a **grill-me**
session (see bottom) to turn the big ones into concrete specs before building.

---

## 1. Design / visual upgrades
- Research and apply a design pass on the whole UI (it's currently functional-but-plain).
  - Consider the `frontend-design` / `impeccable` skills for direction.
  - Wants: a more atmospheric, "at the table" feel; clearer hierarchy between
    *prep* (builder) and *run* (live control board) modes.
- Better empty states, iconography, and spacing.
- Possibly a dedicated **Builder mode vs. Play mode** layout split.

## 2. Drag & drop editor — ✅ REWRITTEN (2026-07-06, verify by hand)
Rebuilt on **TipTap/ProseMirror** (grill spec in `EDITOR-REWRITE.md`). The
read-aloud doc is now a rich-text tree (`ScriptDoc`: headings, callout/DM-note
blocks, bold/italic + named color/highlight, atomic cue chips). Cues are atomic
nodes so the text-mangling bug class is gone structurally. Drops snap to word
boundaries; tray pulls the full categorized library and auto-registers assets;
autosave + undo/redo replace Save/Cancel. Legacy flat `script` arrays (incl. the
corrupted goblin-ambush one) migrate on load. `scriptText` now accepts
structural markdown + `{{cues}}`. Typecheck + build + boot all clean.
- **Still to verify by hand:** ✎ Edit → drag a cue (lands at a word boundary,
  never mid-word) → bold/color a phrase via the bubble menu → add a `❝ Note`
  callout → confirm autosave persists across a scene switch / reload → a
  library asset dropped in shows up in the scene's palette.
- **Follow-up:** update `campaign-sample/AUTHORING.md` + `src/main/authoring.ts`
  to document the new markdown `scriptText` syntax + the `ScriptDoc` schema so
  Claude scene-authoring uses headings/callouts/emphasis (plain prose still
  works — markdown is a superset, so nothing is broken meanwhile).

Original problems (now fixed) in the old contentEditable editor:
- Dropping into the middle of a word splits the word / inserts stray spaces.
- Caret/drop position is imprecise; hard to place a cue exactly.
- Editing text around chips is fiddly (spaces appear/disappear).
Ideas to fix:
- Snap drops to the nearest word boundary (never mid-word).
- Clear drop indicator (caret line) showing exactly where the cue will land.
- Consider a more robust editor foundation (e.g. a small rich-text lib like
  Lexical/TipTap/ProseMirror with atomic inline nodes) instead of raw
  contentEditable — evaluate in the grill session.
- Make chips easier to grab/drag (bigger hit target, drag handle).
- Undo/redo.

## 3. Audio playback reliability (bug) — ✅ DONE (2026-07-05)
- **ACTUAL root cause: the `asset://` protocol handler.** Nothing loaded at all
  (all fetches failed). Two compounding bugs in `src/main/index.ts`:
  1. `asset` is a *standard* scheme, so Chromium parses the first path segment
     as the URL **host** — `new URL(url).pathname` dropped it, so
     `asset://art/x.svg`/`asset:///sfx/x.ogg` resolved to the campaign *root*
     (missing `art/`, `sfx/`, …) → every file 404'd. Fixed by rebuilding the
     relative path from the raw URL (host + path) instead of `pathname`.
  2. The scheme wasn't CORS-enabled, so fetching it from the dev renderer
     (`http://localhost`) failed with `TypeError: Failed to fetch`. Fixed with
     `corsEnabled: true` + an `Access-Control-Allow-Origin: *` header on the
     handler responses.
- Defensive fixes made along the way (good regardless): autoplay gate disabled
  via `app.commandLine.appendSwitch('autoplay-policy',
  'no-user-gesture-required')` (kept `engine.resume()` as fallback); and a
  double-start race in
  `AudioEngine.switchMusic()`/`setAmbience()` (they checked/reset state *before*
  the async decode, so two fast clicks stacked overlapping tracks). Now guarded
  by monotonic `musicIntent`/`ambienceIntent` tokens — a stale in-flight load
  bails instead of starting.
- ~~Files with spaces/parens.~~ `Falloutv2 (1).mp3` is in the sample library and
  loads; `assetUrl()` per-segment encoding + main-process `decodeURIComponent`
  round-trip verified. Use the **Probe** button (TopBar) to check every
  referenced asset loads before a session.
- ~~Now-playing indicator + failure toast.~~ TopBar shows the active track with
  a pulse; failed decodes/loads now emit an `onError` → toast (bottom-right)
  instead of failing silently. See `Toasts.tsx`, `engine.onError`, store
  `pushToast`/`probeAssets`.
- Remaining to verify **by ear** (needs speakers): first-click SFX plays;
  spam-click a music palette button → exactly one track audible; break a file →
  toast appears.

## 4. Stock sound library — expand + categorize
- ✅ **Schema + browser + audition DONE (2026-07-05).** `LibraryAsset.category`
  added (`src/shared/types.ts`) with a recommended taxonomy + icons
  (`LIBRARY_CATEGORIES`/`categoryMeta`). New **Library** browser modal
  (`LibraryPanel.tsx`, opened from TopBar 📚): search by name/tag/category,
  filter by kind + category, grouped list, per-asset ▶ **audition** (one at a
  time, via `engine.preview` → sfx bus, no ducking). Sample `library.json`
  backfilled with categories; taxonomy documented in AUTHORING.md (+ seed in
  `authoring.ts`).
- ✅ **Content batch added (2026-07-05):** library grew 19 → **45** CC0 assets.
  +8 music (RandomMind "Medieval" series: battle/market/tavern/feast/victory/
  exploration/dance + a horror atmosphere), +3 ambience (rain-storm, campfire,
  dungeon-cave), +15 SFX (Kenney RPG Audio: doors, chest, coins, books, blades,
  chop, footsteps, cloth). All CC0, categorized + tagged, documented in
  CREDITS.md. Sources: OpenGameArt + kenney.nl. More can always be added.
- ⏳ Drag-tray grouping by category: deferred into the #2 editor rewrite (the
  tray shows scene cues, not library assets, and the editor is being rebuilt;
  grouping it now means library lookups on a fragile contentEditable).
- Add many more useful D&D sounds (all CC0 / royalty-free, documented in CREDITS).
- **Categories** so they're easy to find. Proposed taxonomy:
  - Creatures: growls, howls, screams, roars, snarls, hisses, wings, footsteps
  - Combat: sword/blade, blunt, arrows, shields, armor, gore/impacts
  - Magic: cast, fire, ice, lightning, arcane, holy, dark/necrotic, teleport
  - Weather: wind, rain, thunder, storm, blizzard
  - Water: dripping, river, waves, ocean, waterfall, underwater
  - Fire: campfire, torch, bonfire, roaring flames
  - Places: tavern crowd, market, dungeon, cave, forest, town, temple, ship
  - Objects: doors, chests, locks, gold/coins, gems, books/pages, levers, bells
  - Horror / scary: drones, stingers, whispers, heartbeat, dissonance
  - UI / table: dice, page turn, chime, alert
- Library UI: filter by category + tag, search box, and an **audition/preview**
  play button per asset.
- Category should be a first-class field on library assets (extend `library.json`
  + `LibraryAsset.category`), and the drag tray should group by category.

## 5. More music — ✅ gaps filled (2026-07-06)
- **2026-07-06 batch:** +15 CC0 music (OpenGameArt) filling the documented gaps —
  tension (Determined Pursuit loop), mystery (Mystery, Forgotten Tomb), somber
  (What Is Left, medieval vocal hymn), travel (From Here to Where), seafaring
  (Pirate Tune), plus boss (Epic Boss Battle), combat (Battle RPG, Battle Theme A),
  victory ×2, town, exploration (Cave Theme), horror. Also +4 sfx (deep roar,
  heavy stomp, magic cast, teleport) +1 ambience (wind whoosh). Library 45→65,
  all CC0, in CREDITS.md. Note: 3 tracks are large WAVs (no ffmpeg to transcode);
  `evil-approach.wav` (19MB tension) was left out to save space — grab from
  OpenGameArt if wanted. SFX from Freesound/Kenney/Pixabay in the research list
  need manual download (auth-gated) — see scratchpad sound-candidates.md.

### Prior (2026-07-05)
- Added a CC0 music set covering combat/boss, town/market, tavern (×3),
  victory, exploration, and horror (see #4 content batch). Tagged by mood +
  setting. **Gaps still worth filling:** tension, mystery, somber/sad, travel,
  seafaring — no strong CC0 match grabbed this pass.
- Original ask: broader CC0/royalty-free set covering exploration, town, tavern,
  tension, combat, boss, victory, sad/somber, mystery, travel, seafaring, horror.

## 6. Per-scene playlist with fade in/out — ✅ DONE (2026-07-05)
- ~~Ordered playlist with auto-advance, shuffle, loop, crossfade.~~ Built:
  `Scene.playlist` config (`enabled`/`shuffle`/`loop`/`crossfadeMs`) +
  per-track `fadeInMs`/`fadeOutMs` on `MusicTrack` (honored in both modes;
  outgoing track's authored fade-out wins over the incoming crossfade). Schema
  documented in AUTHORING.md.
- Palette stays the default; the ▤/▦ toggle in the Music header flips modes
  live and persists to the scene JSON. Palette taps in playlist mode jump the
  queue. Auto-advance is timer-based at the track's fade-out point
  (`engine.switchMusic` opts `{loop:false, onEnding}`), cleared on any manual
  switch/stop so it can't double-fire; superseded tracks can't advance.
- ~~Now-playing strip.~~ `NowPlayingStrip` in `MusicPalette.tsx`: prev/next,
  track label, elapsed/duration + queue position, progress bar (polls
  `engine.musicProgress()` at 500ms), shuffle + loop toggles (shuffle re-orders
  the *remaining* queue without restarting the current track).
- Note: the "Silence" panic button keeps its fast fade — per-track fadeOutMs
  deliberately does not apply to it.

## 7. Other ideas (mine)
- ✅ **Live mini-mixer + loop toggles (2026-07-06):** every music track, SFX, and
  ambience layer now has a live volume fader + a loop on/off toggle in the control
  board; changes apply live (if playing) and persist to the scene JSON (debounced).
  SFX can be held as a sustained loop (tap to start/stop). Engine gained
  setActiveMusicVolume/Loop, setAmbienceLayerVolume/Loop, looping-SFX support.
  Overlap confirmed: SFX + ambience layer freely; music stays single-track (by design).
- **Loudness normalization** on import so tracks aren't wildly different volumes.
- **Per-cue options**: a script cue could set volume, or fire+duck depth, or
  choose one-shot vs. start-loop.
- **Crossfade curve** options (equal-power vs. linear).
- **Keyboard "teleprompter" mode**: while reading, press Space to fire the next
  inline cue in order — no mouse needed.
- **Favorites / recently used** sounds for fast access during play.
- **Scene templates / duplicate scene** to speed prep.
- **Global hotkeys** that work while Discord is focused (already Phase 5 in GAMEPLAN).
- **Panic button**: instant fade-all with one key.
- **Tag-based auto-suggest** when building a scene from a description (ties into
  the Claude authoring workflow).
- Import for **images/handouts** (button + copy into `art/`), not just audio.

---

## Process: grilling + docs skill
- We'll likely do a **grill-me** session to pin down specs (esp. the editor
  rewrite and the playlist model) before building.
- The **better** variant to install is **`grill-with-docs`** by Matt Pocock
  (same author as `grill-me`) — it produces ADRs + a glossary as you're grilled,
  so decisions get written down.
  - Repo: `mattpocock/skills` → `skills/engineering/grill-with-docs/SKILL.md`
  - https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md
  - Plain grill-me (for reference): `skills/productivity/grill-me/SKILL.md`
  - Usage per its docs: run a `/grilling` session, optionally alongside a
    `/domain-modeling` skill.
- A `grill-me` skill is already available in this environment; `grill-with-docs`
  would need to be added to the user's skills.

## Priority hint (rough)
1. ~~Fix audio-click reliability (#3)~~ — ✅ done 2026-07-05.
2. ~~Library categories/search/audition + CC0 content (#4/#5)~~ — ✅ done
   2026-07-05 (45 assets). Optional: fill mood gaps (tension/mystery/somber/
   travel/seafaring).
3. ~~Playlist + fades (#6)~~ — ✅ done 2026-07-05 (verify by ear).
4. Drag/drop editor rewrite (#2) — do the grill session first. ← next
5. Design pass (#1) — ongoing.
