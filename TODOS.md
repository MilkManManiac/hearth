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

## 2. Drag & drop editor — make it easier / more reliable
Observed problems in the current contentEditable editor (goblin-ambush got
mangled while testing — text like "narrow s b eneath", and an image cue landed
mid-word):
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

## 3. Audio playback reliability (bug)
- "Audio doesn't always play when I click the button in the main screen / builder."
- Investigate: ensure the Web Audio context resumes on the *first* user gesture
  regardless of which button is clicked (SFX/music/scene); verify every trigger
  path calls `engine.resume()` synchronously enough.
- Verify imported files with spaces/parens in the name (e.g. `Falloutv2 (1).mp3`)
  play — check `asset://` URL encoding end to end.
- Add a visible "now playing / audio active" indicator and a decode/failure toast
  so silent failures are obvious.

## 4. Stock sound library — expand + categorize
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

## 5. More music
- Add a broader CC0/royalty-free music set covering common moods: exploration,
  town, tavern, tension, combat, boss, victory, sad/somber, mystery, travel,
  seafaring, horror.
- Tag by mood + setting so scene-building suggestions get better.

## 6. Per-scene playlist with fade in/out
- A scene can have an ordered **playlist** of music tracks (not just a palette):
  - auto-advance to next track, optional shuffle, loop-the-playlist.
  - crossfade / fade-in / fade-out between tracks (configurable seconds).
  - keep the "palette" (tap-to-switch) behavior too — playlist is an alternate mode.
- Per-track fade-in and fade-out points; gapless where desired.
- A "now playing" strip with next/prev and a progress bar.

## 7. Other ideas (mine)
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
1. Fix audio-click reliability (#3) — it's a live bug.
2. Sound categories + library search + preview (#4) and more sounds/music (#4/#5).
3. Playlist + fades (#6).
4. Drag/drop editor rewrite (#2) — do the grill session first.
5. Design pass (#1) — ongoing.
