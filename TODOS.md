# Hearth — TODOs / backlog

> **See `AUDIT-2026-07-10.md` for the current prioritized punch list** (full-project
> audit: UX, code health, docs, content). This file is the older running backlog;
> the audit supersedes it where they overlap.

Captured for later. Not being worked on yet. We'll likely run a **grill-me**
session (see bottom) to turn the big ones into concrete specs before building.

## 🔔 WES — review queue (updated 2026-07-10; everything Claude needs from you)

**One-stop shop (2026-07-10, ONESTOP-PLAN.md — C1–C5 all shipped):**
- [ ] Try: 📖 Rules (search "goblin"), 🛡 Party (your 3 PCs are drafted —
  fix their levels/scores, marked DRAFT), ⚔ tab on a scene (stock a fight),
  🗺 on a scene image (fog editor → 📤 Send with the Presenter open).
- [ ] 🌐 PLAYER PORTAL (C5): in 🛡 Party hit '🌐 Player portal' → copy the URL → open it on
  your phone (same wifi). REVIEW: is no-auth-on-LAN acceptable, and pick the remote-player
  route (cloudflared tunnel vs Tailscale vs port-forward) — Claude can wire whichever.
- [ ] ⚔↔🛡 sync: add a party PC to an encounter via its gold chip, damage it in the tracker,
  watch the sheet + dashboard + player browser all update.
- [ ] Tell Claude: are the SRD subclass stand-ins OK (Varen shows Evoker not
  Diviner, Felson shows Open Hand not Shadow — SRD 5.2 ships one subclass per
  class; homebrew JSON can add the real ones anytime).

**Decisions / answers:**
- [ ] **Discord bridge truth:** did a live voice test ever actually pass? DISCORD-BRIDGE.md's
  header says yes, its own checklist says no. Answer decides whether we trust it next session
  or schedule a test.
- [ ] **Session 24 actuals:** 2–3 lines on what actually fired (Squeeze? Rothe grotto?
  Whispering Pool reflections?) — [[session-24]] is flagged "played but unrecorded."
- [ ] **GAMEPLAN Phases 3/4** — images-to-players (bot embed / player web page) and the
  D&D Beyond party dashboard: keep, defer, or kill?
- [ ] **Campaign brainstorm queue** — `campaigns/elor-rebirth/notes/grill-queue.json` has the
  open story questions (Eilistraee's release mechanism is the big one — it's your Ch-1 climax).

**Hand-verification (open the app and poke — ~10 min):**
- [ ] Desktop icon launches the NEW build (auto-repack fires when you close Hearth; if the
  icon still feels old, run `npm run pack` with Hearth closed).
- [ ] Notes: open Brolin/Cumb from a link — read-first page, plain-click links work, hover
  ~½s shows the peek card, Alt+← comes back, ✎ Edit toggles the editor.
- [ ] Press `?` — the shortcut cheat-sheet; 🔍 Find button opens Ctrl+K.
- [ ] Run mode: left rail is scenes-only; a Ctrl+K note lands in the right panel; Ideas/Cast
  add-boxes are gone; cue chips read MUS/SFX/AMB/IMG.
- [ ] Drag a side panel's inner edge (resize / drag small to hide); ▾ minimizes the sound
  console to a "N sounding" strip.
- [ ] Delete something → button arms red "Sure?" instead of an OS popup.
- [ ] Skim 2–3 restructured session notes (S13, S20) + Shipton/Trunks/Soni — is the TL;DR
  format right everywhere?
- [ ] New session note → tick some Secrets boxes → create another session → "Carried
  forward" appears with only the unticked ones.
- [ ] Audition a few wave-8 sounds (nox-/oga-/blacis-/km- prefixes) — cull duds via 🚮.

## 🔔 Standing reminders (surface these regularly)

**DM's own todo (not Claude's):**
- [x] ~~Categorize + mood-tag the sound library~~ — **mostly done** (audit
  2026-07-10: 96% categorized; only 96 of 2,311 assets uncategorized, 2
  untagged). Remaining: cull duds by ear (waves 4–8 were filed by name, not
  audition) and the 96 stragglers via the Library `?` badge.
- [ ] **Grill session on the Elor campaign** (next Claude session, Opus or
  Sonnet, `/grill-me`): get grilled on the very basic concepts of the campaign
  to triage the notebook — what's useful, what gets merked, what stays.
  Targets: the 12 threads, the Ideas Parking Lot, the flagged contradictions
  (Sellie/Eira truth, S22/S23 blur, where Brolin/Eira/Michael stayed), and the
  unfired hooks (Kena has Tad, the guild leader who knows topside is safe,
  Mr. Spells' want). **Then**: a thorough review with Claude + brainstorm
  campaign ideas where the DM wants help.
- [ ] **Campaign vibe/direction review — POSTPONED to next session (2026-07-09).**
  Claude has 4 questions queued: Pool-arc tone (horror vs levity), the Pool's
  endgame role, how much Root's assassination should cost the party, and where
  "Rebirth" actually ends. Act summary already delivered 2026-07-08.
- ℹ️ **Downloader is actively adding files** to `Downloads\Hearth YT Downloads`
  (separate Claude session). Check the folder next session — may be ready for
  a triage/import pass into Elor Rebirth.

**Claude's queue (rough priority):** ~~N3 wiki-links + backlinks (#11)~~ ✅
built 2026-07-09 → user fills Session 14's actual events in the Elor campaign
→ hand-verify pass (#10, N1/N2, N3, Chronicler live test next session) →
#12 mac/packaging (Windows portable ✅ 2026-07-09; mac still open).

**Built 2026-07-08:** the **Elor: Rebirth campaign folder**
(`C:\Users\weshu\Campaigns\Elor Rebirth` — 61 notes: 13 sessions, 5 PCs,
17 NPCs/gods, locations/factions/threads/items, ideas quarantine, 34 art
files) and **🪶 The Chronicler** (per-speaker session recorder in the Discord
panel — see DISCORD-BRIDGE.md).

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
- ~~**Follow-up:** update `campaign-sample/AUTHORING.md` + `src/main/authoring.ts`
  to document the new markdown `scriptText` syntax + the `ScriptDoc` schema.~~
  ✅ done 2026-07-06 — both docs synced (they had drifted), syntax derived from
  the actual compiler (`####`+ is not a heading, `_underscores_` work, any
  `[!tag]` is stripped, emphasis can't cross a cue).

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
- ✅ **Loudness normalization (2026-07-06):** decode-time RMS normalization in
  the engine (−18 dBFS target, gain clamped [0.25, 4] + peak-capped so boosts
  can't clip), cached with the buffer, composed into every play path (music/
  ambience/SFX/preview) under the authored volumes. `ponytail:` upgrade path
  noted (true LUFS / EBU R128).
- **Per-cue options**: a script cue could set volume, or fire+duck depth, or
  choose one-shot vs. start-loop.
- **Crossfade curve** options (equal-power vs. linear) — skipped for now
  (YAGNI; current fade feels fine — revisit only if it audibly bothers).
- ✅ **Teleprompter mode (2026-07-06):** in read mode, **Space** fires the next
  cue in document order (ember ring marks it), Shift+Space/→ skips, pointer
  resets on scene change; ignores typing contexts (inputs/TipTap).
- ✅ **Favorites / recents (2026-07-06):** ☆/★ in the Library (Favorites group
  on top) + last-10 recents captured from SFX/music/ambience/script-cue fires
  (Recent group in Library; quick re-fire chip row in the SFX grid).
  localStorage only (`hearth:favorites`/`hearth:recents`), no schema changes.
- ✅ **Scene templates / duplicate (2026-07-06):** hover ⧉ duplicates a scene
  (re-reads on-disk JSON, `Copy of X`, slug uniquified); "+ New Scene" with
  Blank/Tavern/Combat/Dungeon Crawl asset-free skeletons; new scene auto-selected
  (`scene:duplicate`/`scene:create` IPC). Follow-ups: delete/rename affordances;
  template ids duplicated as literals in main + SceneList (shared const needs types.ts).
- **Global hotkeys** that work while Discord is focused (already Phase 5 in GAMEPLAN).
- ✅ **Panic button (2026-07-06):** **Esc** = the Silence fade-all (suppressed
  while the Library modal is open, where Esc closes the modal).
- **Tag-based auto-suggest** when building a scene from a description (ties into
  the Claude authoring workflow).
- ✅ **Image/handout import (2026-07-06):** "+ Add image" in the image strip →
  OS multi-select picker → copies into `art/` (collision `-2/-3`, never moves) →
  appends `SceneImage`s via the normal `saveScene` path (`scene:import-images`
  IPC). Follow-ups: caption editing, remove-image affordance.

---

## 8. Grow the sound + ambience library — a LOT (sourcing → triage → bulk add)
Notes captured 2026-07-06. **Priority order matters — do 1 before 2 before 3.**

Status: steps 1 + 2 ✅ done 2026-07-06 — see below. Step 3 (bulk expansion)
**started 2026-07-06 (wave 4): library 65 → 94** — +29 CC0 assets pulled headless
from OpenGameArt's advanced-search CC0 filter (SFX + music), curated for D&D fit
(dropped 8-bit/chiptune/modern), categorized + tagged, credited in CREDITS.md.
Filled the empty **Water** category + added **Horror SFX/ambience** and mood
music (tension/chase/somber/travel/horror). These are **un-auditioned** (added
by license+source+name, not by ear) — cull any duds from the Library browser.

**Waves 5+6 done 2026-07-06 (library 94 → 165):** the user downloaded the itch
packs; curated + integrated headless with a scratchpad **ffmpeg 8.1.2** static
build (WAV→OGG libvorbis q4 — note: scratchpad copy is session-temp; install
ffmpeg properly via `winget install ffmpeg` for future waves).
- **Wave 5 — kmontesdev Fantasy Ambient Pack (CC0):** 46 assets (`fap-*`).
  Named monster vocals (goblin/orc/troll/ghost/giant/minotaur/dragon/
  elementals), real weapon foley (bow/crossbow/dagger/staff/sword-on-shield/
  armour/flesh), location beds (town/village/potion shop/library/caves/forests/
  rain/lake/river/waves/desert/crowd), screams.
- **Wave 6 — Nox_Sound Essentials (CC0, pro 24-bit field recordings):** 25
  assets (`nox-*`). The fidelity ceiling: loop-authored nature beds (3 caves,
  3 fire sizes, rain ×2, wind ×2, waterfall ×2, river/stream/sea/night/
  cicadas), Iceland storm sea, Azores hot spring + old-mill waterwheel, and 4
  NPC combat vocals (attack/pain, m/f).
- The `duskhollow-demo` scene now runs on the pro beds (nox rain/wind/drips +
  fap crowd) — 19 Space-driven cues.
- **Rejected: "music pack 1 (non copyrighed songs)"** (Oliver Siimon, 231
  tracks) — **no license file in the archive**; "non-copyrighted" is a YouTube
  marketing phrase, not a grant. Also mostly not D&D-shaped (chiptune/
  Christmas/jazz). Do not import unless the user produces actual license terms
  from the source.
- Un-auditioned caveat still applies to waves 4–6 (curated by name/folder/
  license, not by ear) — cull duds via the Library browser or 📥 Triage.
- Remaining big-pack candidates: ~~Blacis~~ (✅ wave 8); TomMusic/Leohpaz/
  JDSherbert **license-checked 2026-07-09 and rejected** (no-redistribution /
  non-CC terms); Sonniss GDC (Tier B, personal-only). Freesound/Kenney/Pixabay
  finds parked in scratchpad sound-candidates.md.

**Wave 8 done 2026-07-09 (library 2,172 → 2,311, all Tier A, headless):**
139 curated atmosphere assets — Nox_Sound CC0 seamless field-recorded beds
(caves/drips/fires/rain/wind/rivers/sea/spring + an underwater-murk edit),
OpenGameArt CC0 (dungeon/swamp/eldritch drones, ghostly atmospheres, **cult +
ethereal chant beds**, 21 magic spells, horror SFX, foley), Blacis CC0 (30
dark-fantasy music keepers incl. **celestial/dawn** for the sun-returns
climax), Kevin MacLeod CC BY (25 mood tracks — attribution in CREDITS.md).
Filled: magic 6→28, horror +27, water +14. Un-auditioned caveat applies (by
name/license, not by ear). Repo: ambience+sfx tracked; blacis-*/km-* music
gitignored (256 MB — travels via campaign zip). **Still worth grabbing:**
kmontesdev CC0 pack (manual Google-Drive download, 2 GB, genre-perfect) and
Nakarada CC-BY for any remaining mood gaps.

1. ✅ **Research better sources** — done, see `SOUND-SOURCES.md` (ranked +
   license-verified: 3 big CC0 itch.io packs first, Nakarada CC-BY for mood
   gaps, Sonniss GDC as personal-tier ceiling; BBC/Tabletop Audio/Ghelfi are
   license-excluded).
2. ✅ **Quick sound-triage tool** — done: 📥 Triage (TopBar) → pick drop folder
   → auto-audition each candidate → K keep / J reject / ←→ browse → keepers
   copied into the campaign + appended to `library.json` with kind/category/
   tags prefilled from the filename and per-session source/license stamped.
   Sources never modified. Follow-ups: `redistributable`/`attribution` fields
   need a types.ts extension (ride in the `license` string meanwhile); engine
   decode cache grows over a multi-GB triage session (add cache-evict later).
3. (original notes below)

1. **Research better sources FIRST (before mass-adding).** The current mix
   (OpenGameArt / Kenney / Freesound) is fine but limited in fidelity, length,
   and variety. Spend real time finding *better* stock-sound libraries —
   higher-quality, larger catalogs, loop-ready ambiences — that are CC0 or
   clearly royalty-free with usable terms. Sources to vet (verify license each):
   Sonniss GDC bundles (huge, royalty-free), BBC Sound Effects archive,
   99Sounds, SoundBible, Mixkit / Uppbeat / ZapSplat (check license tiers),
   itch.io CC0 SFX/music packs, archive.org public-domain audio, Pixabay,
   Freesound CC0 packs. **Deliverable:** a short *ranked* list of the best
   sources + why + license notes, so bulk-adding pulls from good wells.
2. **Quick sound-triage tool (build after step 1).** A fast keep-or-cull
   reviewer so vetting a big batch of candidates is quick — e.g. point it at a
   drop folder, Space to audition, keep / reject with one key, auto-file the
   keepers into the campaign + `library.json` with kind/category/tags. Could be
   an in-app "review inbox" or a standalone script. Scope it after step 1.
3. **THEN bulk-expand the library.** Significantly increase the *quantity* of
   sounds + ambience across the whole taxonomy (creatures, combat, magic,
   weather, water, fire, places, objects, horror, UI) and every mood. This is
   the goal; steps 1–2 make it high-quality and efficient instead of a dump of
   mediocre files.

Parked: auth-gated finds from the 2026-07-06 research (Kenney / Freesound /
Pixabay packs that need manual download) are listed in the scratchpad
`sound-candidates.md`.

**New source (2026-07-08): the `downloader/` tool** (built in a separate Claude
session — see `downloader/README.md`). `python downloader/hearth.py` = GUI that
takes Spotify/YouTube links (spotDL + yt-dlp) and drops tagged m4a/mp3 into
**`C:\Users\weshu\Downloads\Hearth YT Downloads`**. Sync into the game either
way:
- **DM-driven:** 📥 Triage (TopBar) → pick that folder → K/J audition → keepers
  auto-filed into the campaign + library.json.
- **Claude-driven:** ask Claude to bulk-import headless (like waves 4–7),
  optionally transcoding m4a→ogg — **ffmpeg is now properly installed**
  (`winget install Gyan.FFmpeg`, on PATH), so the old "no ffmpeg" caveat is gone.
- **License note:** YouTube/Spotify rips are *personal-table use only* — same
  bucket as the mp1 pack. Stamp `source: youtube`/`spotify` and
  `license: private` at import; never redistribute; keep them out of git (bulk
  audio is already gitignored).

**Wave 7 (2026-07-06): FULL DUMP — library 165 → 2,171.** Everything left in
the user's downloaded packs imported at their direction (`fapx-`/`noxx-`/
`mp1-` prefixes), auto-categorized (incl. free-form `footsteps` ×750,
`voices` ×653, `electronic`, `festive`), WAV→OGG, display names cleaned.
Files are **local-only/gitignored** (~750 MB; mp1 also has no license file —
private demo use only). The 📚 Library's edit/trash/delete tools + the
scene-first cue tray are how this stays navigable — expect heavy culling of
footsteps/voices variants via 🚮. ~~Note: engine decode cache still never
evicts~~ — stale: the engine has a 384 MB LRU decode-cache budget
(`AudioEngine.CACHE_BUDGET`, evict-on-load, playing sources unaffected).

---

## 9. Project review → live-trust overhaul — ✅ Tiers 1–3 done (2026-07-06)
Full review (2 scout agents + engine/store deep-read) found the app's gap was
"works in a demo" vs "trustworthy at the table": audio you didn't ask for,
sounds you can't see, things you can't undo. All three fix tiers shipped:

**Tier 1 — live trust:**
- **Arm vs. go-live:** clicking a scene is now SILENT (arms + prewarms; old
  atmosphere keeps playing). New **▶ Go live** button (or double-click the
  scene row) crossfades to the default track + starts autoplay beds + kills
  held loops from the previous scene. Live scene shows an ember dot + badge.
- **`{{amb:...}}` cue kind:** ambience beds are now script-cueable (toggle
  on/off; ref = layer file or stem). Cue tray offers ambience (auto-registers
  as `autoplay: false`); teleprompter Space walks them like any cue. New
  `AmbienceLayer.autoplay` (default true) replaces the volume-0 hack.
- **Now Sounding strip** (`NowSounding.tsx`): always-visible bottom strip
  listing every audible thing (music/beds/loops — even orphans from other
  scenes) with per-item kill switches + ⏹ All. Palette "Silence" removed
  (redundant/differently-scoped).
- **Keyboard scoping:** Triage/Library modals now suppress the teleprompter,
  SFX hotkeys, and Esc-stopAll (Esc in a text field just blurs). Teleprompter
  gained **← rewind**.
- **Remove/rename affordances:** scene ✎ rename (inline) + 🗑 delete (to
  recycle bin, `scene:delete` IPC) in the rail; ✕ remove on every track/SFX/
  bed card; image ✕ remove + inline caption editing; per-bed `auto` toggle.
- Volume-0 bed tap now bumps to 0.4 (audible) instead of playing silence.

**Tier 2 — integrity:** watcher self-write suppression (no more echo reload
~500ms after every save); `importSceneImages` edits raw JSON (no longer
destroys `scriptText`); `importAssets` collision-renames instead of silently
overwriting (shared `copyUnique` helper, races guarded by COPYFILE_EXCL);
non-loop ambience `onended` cleanup (status stays truthful); playlist-order
rebuild when tapping a track added after the playlist started; dead
`campaign:reload` IPC removed; `campaign:reveal` failure surfaced.

**Tier 3 — polish:** goblin-ambush's corrupted sample text rebuilt; demo scene
converted from the looping-SFX hack to real `{{amb}}` cues; faders got
numeric readout + double-click reset; bus volumes persist (`hearth:mixer`);
AUTHORING.md + authoring.ts seed document amb cues/autoplay/go-live.

**Review items deliberately left for later:** ~~editable cue chips~~ (✅
2026-07-09 — every cue chip now has a ⚙ popover with a "Plays" select that
retargets the cue to any same-kind asset in the scene; amb chips keep their
lifecycle fields below it; an orphaned ref shows as "(not in scene)"),
shared basename/prettyLabel helper cleanup +
unified empty-state component, cue color-map dedupe (ScriptPanel vs CueChip),
template ids shared const (main + SceneList), symlink-hardening the asset://
path checks (realpath), ~~engine decode-cache eviction~~ (done — 384 MB LRU),
~~one-shot SFX not stopped by Stop all~~ (done — stopAll fades in-flight
one-shots).

---

## 10. Run-mode live-control ideas — ✅ ALL FOUR BUILT (2026-07-07, verify by hand)
Raised after the first real Discord-bridge session; built same day. Typecheck +
build + boot + compiler smoke test clean. **Verify by hand:** ①click 🔊 Local /
a console fader, then Space still advances the timeline; ②an
`{{amb:...|vol=35%|in=4s|until=section}}` cue fades in to 35% and dies when
Space crosses the next heading; ③console chips read MUS/AMB/SFX + mood words,
untagged assets show `?`; ④comma-separated categories in the Library ✎ editor
filter/group correctly.

### How each landed (2026-07-07)
- **10.1** `lib/keys.ts` (`isTypingTarget`/`blurNonTypingFocus`); teleprompter
  keys now capture-phase + only true text entry swallows them; global
  click→blur on buttons/faders in App.tsx; SfxGrid/SoundConsole hotkeys same.
- **10.2** `CueInline` gained `volume/fadeInMs/fadeOutMs/until:'section'`;
  scriptText syntax `{{amb:ref|vol=35%|in=4s|out=8s|until=section}}` (compiler
  ignores bad opts); teleprompter tracks section-scoped beds and fades them out
  when the pointer crosses the next heading (§ marker on the chip); ⚙ popover
  on amb chips in the editor sets all four; AUTHORING.md + seed doc'd.
  Deliberate limits: options are amb-only; beds past the last cue of the doc
  never auto-stop (no boundary left to cross); ArrowLeft never restarts a bed.
- **10.3** SoundConsole: MUS/AMB/SFX text badges (title explains each kind's
  behavior), mood = category labels as words (max 2, utility cats skipped),
  dim `?` badge = untagged (the "needs a sorting pass" flag).
- **10.4** `LibraryAsset.categories?: string[]` (primary first; legacy
  `category` mirrors `[0]`); Library ✎ category field takes commas; filter
  matches any, grouping by primary; `assetCategories()/assetPrimaryCategory()`
  helpers. Triage still stamps a single category (fine — it's the primary).

### Original notes (kept for reference)

### 10.1 Keyboard scope in run mode — Space / arrows must only drive the timeline (bug)
- Symptom: while DMing, clicking a UI control **steals keyboard focus** from the
  teleprompter, so Space / arrows stop advancing the script.
  - Clicked **🔊 Local** (monitor mute) → Space no longer advanced the timeline.
  - Clicked a sound in the bottom section (Now Sounding / SFX) → Space after that
    didn't progress the timeline either.
- Want: in run mode, **Space + arrow keys are owned by the teleprompter/timeline**
  regardless of what was last clicked. Clicking a button/sound should fire that
  control but **not** capture the transport keys (or should immediately hand focus
  back). Text inputs / TipTap editing stay exempt (existing carve-out).
- Likely a `.blur()` after click, or route transport keys at the document level
  and let buttons be `tabindex=-1` / not focus-holding. Confirm against the
  existing teleprompter key handling + modal-suppression logic (see #9 Tier-1
  "Keyboard scoping").

### 10.2 Ambience/atmosphere lifecycle in the timeline — explicit on/off + fade + target volume
Right now it's unclear **how and when a bed turns off**. Design a clear model:
- **When does a bed stop?** Options floated: at the next paragraph/section
  boundary, or only when the next song/bed starts. User leans toward
  **paragraph/section-scoped** as the default mental model.
- **Fade timing:** let the author set fade-in / fade-out duration per bed
  (some infra already exists — `fadeInMs`/`fadeOutMs` on tracks from #6; extend
  the idea to ambience cues / sections).
- **Target volume:** pre-set the volume a bed fades **up to**, so the DM doesn't
  mix live while talking. Example: campfire slightly louder than rain, both
  pre-balanced.
- **Delivery idea:** a **per-section / per-paragraph editor** you can toggle open
  to set these (which beds are active in this section, their fade + target
  volume). Explicitly **optional, not required** — for tightly-directed scenes.
  Casual scenes still work with plain cues.

### 10.3 Bottom sound section (scene + favorites) — better identification at a glance
The bottom strip's sounds are hard to read live. The emojis don't carry meaning.
- **Show kind clearly:** obvious visual distinction between **music / SFX /
  ambience** (not a cryptic emoji).
- **Show mood:** surface the mood tag(s) on the chip somehow.
- Goal: while planning *or* improvising, instantly see what a sound is and its
  vibe. This also makes it easy to spot which assets still **need** categ/mood
  info — a clean way to flag the un-tagged ones for a sorting pass. (Ties into
  the huge un-auditioned wave-4–7 backlog in #8 — most of those 2k assets were
  filed by filename, not by ear.)

### 10.4 Multiple categories / tags per sound
- A sound can belong to several buckets at once — e.g. one cue is **combat** *and*
  **anticipation** *and* **nature**. Support **multiple categories** (or lean on
  multi-tag) per asset so a search surfaces it from any angle.
- Payoff: good labels → fast retrieval both when **planning** and for **on-the-spot
  improv** ("give me anything tense + nature").
- Schema note: `LibraryAsset.category` is currently singular
  (`src/shared/types.ts`); this likely means category → `string[]` (or formalize
  tags as the multi-axis and keep category as a coarse primary). Decide in the
  grill pass; touches `library.json`, the Library browser filters (#4), and the
  cue tray grouping.

---

## 11.5 Notes readability pass (captured 2026-07-08) — rendering half started 2026-07-09
Done: `> [!dm]` callouts are now visually distinct EVERYWHERE — a "🕯 DM"
small-caps label + gold spine/tint, including inside the TipTap editors
(`.script-callout` previously had zero CSS in the editor, so DM notes read as
plain prose while editing); NoteBody got calmer paragraph rhythm (leading-6,
my-1.5). Still open (content half — pair with the DM): shorter paragraphs,
front-loaded one-liners, fewer mid-sentence links, consistent per-kind
skeletons, plainer wording.

### Original notes
The DM finds the generated Elor notes **hard to read / decipher** — formatting
and wording, not content. Cleanup ideas for a future pass (pair with the grill
session so we only polish what survives):
- Shorter paragraphs, more bullets; front-load the one-line "who/what is this."
- Fewer mid-sentence [[links]] and session references; move citations to a
  compact "History" line at the bottom.
- Consistent section skeleton per kind (NPC: Who / Wants / Knows / Secrets;
  Session: What happened / Loose ends).
- Possibly render `> [!dm]` callouts more distinctly in NoteBody/NoteView, and
  bigger line-height/measure in the notes reader.
- Wording: plainer, punchier — write for 2am-mid-session skimming, not prose.

## 11. Note-taking one-stop shop (THE next big direction — captured 2026-07-07)
**Goal:** Hearth + D&D Beyond are the only two things a DM needs open (Discord
on the side for players). Maps/pics/rules live in D&D Beyond; **all sound and
ALL notes live in Hearth.** No more tab-hopping and folder-hunting mid-session.

The user's sketch: campaign root = "Elor: Rebirth" → inside it Sessions
(Session 1 holding multiple scenes), plus Locations, NPCs, Enemies… "Maybe
it's not folders — I'm sure there is a better way — but easy to note, find,
search." Requirements distilled:
- **Fast capture** — adding a note mid-session must be near-zero friction.
- **Fast retrieval** — global search across everything; browse structure too.
- **Organization** — sessions group scenes; entity-ish notes (locations/NPCs/
  enemies) exist campaign-wide, not per-scene.
- Research + gameplan done (2 subagents: tool survey + code map), design
  grounded in the DM's real Elor session doc. Plan: `NOTES-PLAN.md`.

**Status: N1 (foundation) ✅ BUILT 2026-07-07 — verify by hand.** `notes/*.json`
(CampaignNote: kind session/npc/pc/location/faction/item/thread/note, ScriptDoc
body, bodyText authoring path), loader/watcher/save/create/delete cloned from
the scenes pipeline, `note:*` IPC, 📓 Notes tab in the left rail (grouped by
kind, + New note kind picker), NoteView (rename, retype kind, thread
open/resolved, session date, trash-delete), NoteEditor = script editor minus
cue tray. Kind starters incl. Lazy-DM session skeleton. AUTHORING.md + seed
document the format; demo note `barkeep-tobble` in campaign-sample.
**N2 (sessions + retrieval) ✅ BUILT 2026-07-07 — verify by hand.**
`Scene.session` (session-note id) groups the scene list under 📅 session
headers (newest first, Unfiled last; header click opens the session note;
hover 📅 on a scene row = assign/unfile popover). Session notes show their
scenes as chips (click = arm). **Ctrl+K** quick switcher: fuzzy titles over
notes+scenes (subsequence match), 3+ letters also searches inside bodies/
scripts; Enter opens (run mode → note lands in the right panel, script stays).
**Ctrl+J** quick capture: one-liner → timestamped line appended to the armed
scene's session note (else newest session; creates "Session Log" if none).
Right panel gained a read-only 📓 tab (NoteBody renderer + grouped picker)
that auto-follows note selection. Switcher/capture registered as
keyboard-owning modals in every hotkey guard. AUTHORING.md documents
`session`. **N3 (links) ✅ BUILT 2026-07-09 — verify by hand.** `[[note-id]]` /
`[[note-id|label]]` in any note body OR scene script compiles to an atomic
`link` inline (shared compiler — every existing Elor `[[ref]]` went live for
free). Typing `[[` in the note editor opens fuzzy autocomplete over all notes
(Enter/Tab inserts a live-titled chip; unmatched names offer create-on-first-use
via `createNoteInline`, kind `note` — retype on its page). Chips render the
target's live title (label override wins); unresolved refs render dashed, not
lost. Ctrl+click follows a link in the editor; plain click follows in read-only
NoteBody + scene ScriptPanel (links don't consume teleprompter cue slots).
Every note page shows **⤷ Linked from** backlinks (notes + scenes), click to
jump. New: `editor/LinkSuggest.tsx`, `editor/NoteLinkChip.tsx`,
`components/NoteLinkPill.tsx`, `lib/fuzzy.ts` (extracted from QuickSwitcher).
**Verify by hand:** type `[[` in a note → pick → chip appears + autosaves;
Ctrl+click navigates; backlinks show on the target; a `[[link]]` in a scene
script renders + navigates without shifting Space-cue order.
**N4 partial (2026-07-09): promote-from-Cast ✅** — hover ⤴ on a Cast & Loot
row creates a campaign note of the mapped kind (npc/monster→NPC + tag,
item→Item, location→Location, hook→Thread), seeds it with the row's note text
+ a provenance callout, and the row keeps a 📓 button that opens the note.
**Link-navigation UX ✅ (2026-07-10, research-backed — Wikipedia/Obsidian/Notion patterns):**
- **Hover peek**: rest on any [[link]] ~400ms (read-only pills AND editor chips)
  → scrollable preview card (title, kind, full body, "Open →"), 300ms grace to
  move into it, portal-rendered. Read a note without losing your place.
- **Back/forward history**: browser-style stack for note navigation — ←/→
  buttons on the note page + the run-mode 📓 panel, **Alt+←/→** keys, and the
  **mouse back/forward buttons**. Capped at 50 entries.
- **Unresolved links create on click** (wiki convention — never a dead end):
  ref humanized to a title, note created, navigation follows. Editor chips via
  Ctrl+click.
- **Elor content**: bulk-linkified 460+ first mentions across all 88 notes
  (alias-aware: Kena/G/Eddy…), fixed [[mr-spells]] → spells-family, cleaned
  noisy auto-matches. Zero unresolved refs.
- **Verify by hand:** hover a link → card appears/scrolls; click through 3
  notes → Alt+← walks back; mouse4/5 work; type `[[new-thing]]` → click it →
  note created.
- ⏳ Repack pending: desktop-icon build (hearth-release) was in use at build
  time — rerun `npm run pack` when Hearth is closed.

**N4 unlinked mentions ✅ (2026-07-09):** a note page's backlinks section now
also lists 💬 places whose prose says the note's title without a [[link]]
(word-boundary match — "Kena" won't fire inside "Kennarea"); each has a
🔗 button that linkifies every mention in that note/scene in place (casing
preserved via label; `linkifyMentions`/`docMentions` in scriptCompile).
**N4 secrets & clues checklists + carry-forward ✅ (2026-07-09):** new `check`
block in ScriptDoc (`- [ ]` / `- [x]` in bodyText/scriptText; plain `-`
bullets stay prose). Editor: ☑ toolbar button in both editors, typing
`- [ ] ` converts a paragraph, Enter continues the list, Enter-on-empty /
Backspace-at-start exits, live checkbox in the chip. Run mode: ticks in the
teleprompter script save to the scene; ticks in the right-panel 📓 save to the
note. Creating a **new session note** auto-appends the previous session's
unchecked items under "Carried forward (from <session>)" (`docUncheckedItems`
+ toast). Session starter template now seeds Secrets & clues as checkboxes.
**Verify by hand:** new session → tick some boxes → create another session →
carried-forward section appears with only the unticked ones.
**Next (rest of N4):** docx import of Elor sessions.

## 12. Mac support / packaging + distribution (parked until we're happy with everything else)
The app is already mac-compatible (no Windows-specific code; davey has mac
prebuilds; the vc_redist saga is Windows-only). What's missing is DISTRIBUTION
— there's currently no installer for ANY platform (dev-mode only):
- Add **electron-builder** (or Forge) config: mac `.dmg`/`.zip` + Windows
  `.exe` targets.
- Mac builds must be built on macOS — set up **GitHub Actions** (macos runner).
- Unsigned mac builds hit Gatekeeper (right-click → Open workaround) unless
  notarized (Apple Developer, $99/yr) — decide later.
- Remember: bulk audio is gitignored — a packaged app still needs the campaign
  folder copied separately (or build a campaign export/import).

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
