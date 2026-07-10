# D&D Beyond Mechanics Study → Hearth Plan (2026-07-10)

Wes's ask: fan out researchers on DDB's app mechanics (ignore source-material/licensing) —
how players use it, how DMs use it, how Maps works, why building/editing characters is so
easy, in-app dice — find what it does well/poorly, then plan what to implement. Five
parallel research passes (builder · player play-flow · DM tools · Maps VTT · community
sentiment + bolt-on ecosystem). This file is the synthesis; the build plan is at the
bottom and mirrored in ONESTOP-PLAN.md as phases D1–D5.

---

## The one-paragraph verdict

DDB's moat is exactly two things: **the guided builder/level-up that makes rules-legal
characters idiot-proof** (choices surfaced as dropdowns at exactly the moment they're
legal; blue "you owe a decision" flags; warn-don't-block), and **always-correct derived
stats with everything hyperlinked and click-to-roll**. Nearly everything else — encounter
tracker, homebrew authoring, notes, mobile, offline, VTT — is community-consensus
half-built, and the entire third-party ecosystem (Beyond20, Avrae, DDB Importer) exists to
pump DDB's trusted character data into a **better table surface** (usually Discord +
Owlbear Rodeo). Hearth IS a table surface with audio + images + notes + a synced tracker
— the strategy is: steal the builder/dice moat, keep closing the loops DDB never closed.

## Scorecard — DDB vs Hearth today

| Area | DDB | Hearth today |
|---|---|---|
| Guided builder / level-up | ⭐ the moat | ✗ raw (selects + number inputs) |
| Click-to-roll dice + shared Game Log | ⭐ (with gaps) | ✗ none |
| Derived stats / rules links | ⭐ | ✓ good (derived math, tooltips) |
| Party dashboard | ✗ (web page hides HP/AC; extensions fill it) | ⭐ native |
| Combat tracker ↔ PC sheets | ✗ one-way, flaky, can't damage a PC | ⭐ two-way writes |
| Conditions with teeth | ✗ cosmetic labels | ✗ cosmetic labels (tie) |
| Maps: fog/tokens | ✓ mature, manual-by-design | ✓ same philosophy, younger |
| Token ↔ sheet link on map | ⭐ live HP, stat block from token | ✗ dumb discs |
| Homebrew | ✗ template forms, no classes, hostile UI | ⭐ any JSON, data-equal, 🏠 |
| Notes/prep | ✗ (Journals just launched, minimal) | ⭐ wiki-linked notes system |
| Audio/ambience | ✗ nothing | ⭐ the whole origin of Hearth |
| Player access | ⭐ accounts, mobile app, offline books | ✓ portal (LAN link, no accounts — Owlbear-style zero onboarding) |
| Image/handout push | ✓ only inside Maps ("Reveals") | ⭐ presenter + scene images |

## What DDB does WELL (steal these)

1. **Builder-as-interview.** Class → background → species → abilities → equipment as
   navigable steps; every choice a pick grants is rendered as a dropdown with the correct
   count ("choose 2 skills from…"), at the moment it becomes legal. Quick Build (class +
   species + name → legal level-1 char with recommended picks). Ability scores via
   standard array / point buy / manual dropdowns with background bonuses applied as
   visible "+2 Soldier" rows. **Incomplete choices = blue exclamation flags, never hard
   blocks** — you can save half-built and come back.
2. **Level-up = same builder, re-entered.** Bump the level dropdown → new features
   auto-append; anything with a choice (subclass at 3, ASI-or-feat, new spells) gets the
   blue flag. HP: fixed-average auto-applied (rolled HP is a buried pain — do better).
   Gap to fix: DDB gives **no "here's what you gained" summary** and never prompts spells.
3. **Click-to-roll with the modifier baked in**, results in a **shared Game Log** — who
   rolled, what for, the dice, the total; visible to DM + party in real time. This is
   the "table presence" feature remote tables love (everyone sees the nat 20 land).
   Gaps to fix: adv/dis hidden behind right-click (make it a visible toggle); no
   situational dice (Bless d4, Guidance) — support dice-expression bonuses; no
   crit→damage chaining; **rolls never change state** (Foundry's lesson: close the loop).
4. **Everything is a hoverable rules link** (spells, conditions, monsters, items). Hearth
   already does this pattern (glossary tooltips, peek cards) — extend everywhere.
5. **Maps' token↔sheet live link**: PC tokens use sheet portraits, HP edits flow both
   ways, click a monster token → its stat block, tokens auto-size from the stat block
   (Large = 2×2). Combat tracker lives IN the map ("Add All Tokens" → initiative).
   Their grid calibration is drag-a-token-to-fit — friendlier than numeric entry.
6. **Spell management**: prepared checkboxes with live X/max counter; CAST button spends
   the right slot pip; upcast via slot-level selector on the button; spell cards a tap
   away. Rest buttons that list-and-reset everything (slots, uses, hit dice) in one tap.
7. **Limited-use pips**: every X/short-rest, X/long-rest feature aggregated with
   clickable use pips, reset by the rest buttons.
8. **"Honda Accord" philosophy for Maps** (their own words): no dynamic lighting, no
   walls, no automation — anyone can drive it instantly. Validates Hearth's C3 scope.

## What DDB does POORLY (avoid / out-compete)

- **Sheet is a silo**: rolls only land in DDB's log; Beyond20/Avrae exist purely to get
  them to Discord/VTTs. Hearth owns the Discord bridge already → native rolls-to-Discord
  beats the whole bolt-on stack.
- **Tracker can't touch PCs** (no damage/conditions onto players, one-way flaky HP sync).
  Hearth's tracker already writes through to sheets — keep that lead.
- **Conditions/exhaustion are inert checkboxes** — no mechanical effect anywhere.
- **No concentration tracking** (top request for years).
- **No DM grant flow** (XP/gold/items) — DMs hand-edit each sheet.
- **No party dashboard on the web** — browser extensions fill it. (Hearth ⭐.)
- **Homebrew ceiling**: template forms, inline tag syntax, NO custom classes, "unforgivably
  awful" UI. (Hearth: JSON-as-data, anything goes.)
- **Fragmentation**: Encounters, Maps combat, sheets, Game Log = half-integrated silos;
  running a fight = three tabs. (Hearth: one window + presenter + portal.)
- **Performance**: 10–30s sheet loads, chronic. (Hearth: local JSON — stay instant.)
- **Offline/mobile second-class**: no offline editing, no builder in the app.
- **2014/2024 mixing** via source checkboxes, no clean ruleset toggle, "Legacy" clutter.
- Notes vacuum (Journals = minimal, Maps-only, 2026). (Hearth ⭐.)

## The bolt-on ecosystem's lesson (Beyond20 / Avrae / Owlbear)

- **Beyond20**: injects roll buttons on the DDB sheet, sends rolls (computed modifiers,
  crits, spell cards) into Roll20/Foundry/**Discord webhooks**. → The sheet must be the
  input device for the table's shared space.
- **Avrae** (Discord bot, WotC-acquired): `!attack`, `!cast`, full initiative tracker in
  a text channel, DDB Game Log bridging. Friction: manual `!update` re-sync, CLI learning
  curve. → Discord-native play matters; sync must be automatic.
- **Owlbear Rodeo**: a link IS the table; zero accounts; map+tokens+fog and nothing else.
  → Hearth's portal already follows this (URL, no accounts). Extend the portal from
  "my sheet" toward "the table" (rolls, initiative, eventually the map).
- **Discord-table state triplication** (sheet vs bot vs map tokens, nothing syncs):
  Hearth's single-source-of-truth JSON + SSE is the structural answer. Never fork state.

---

## THE PLAN — phases D1–D5 (mirrored in ONESTOP-PLAN.md)

Ordered by leverage for Wes's actual table (remote over Discord, players on the portal).

### D1 — Dice + Game Log (the biggest missing moat piece)
- Click-to-roll on every number in CharacterSheet (abilities, saves, skills, initiative,
  spell atk) + monster stat blocks (attacks, saves, damage) + a freeform dice tray
  (`2d6+3` parser; keep/drop for adv/dis).
- **Visible ADV/DIS toggle** (sticky per roll bar, not hidden right-click) + crit button
  on damage rolls; situational dice add-ons (+1d4 Bless chip) — fix DDB's gaps.
- **Game Log**: campaign-wide roll feed (who/what/dice/total, expandable), stored as a
  rolling session file; rendered in the DM app (right panel tab) AND the player portal
  (SSE already streams state — add a `roll` event). DM rolls get a 🎲→"DM only" toggle
  (default public for players, private for DM — copy DDB, fix the footgun with a clear
  indicator).
- **Discord**: bot posts rolls to a text channel (embed with dice breakdown) — native
  Beyond20/Avrae replacement, zero player setup. Off by default per campaign.
- **Close the loop**: from a monster damage roll in the tracker, one click applies it to
  the selected combatant (respecting temp HP). Rolls can change state; DDB's never do.

### D2 — Builder wizard + level-up (the onboarding moat)
- **Guided create** (portal + DM app, same component): steps Class → Background →
  Species → Abilities (standard array / point buy / manual, background +2/+1 applied as
  visible rows) → Skills (correct choice counts from class data) → Spells (class list
  filtered, known/prepared counts) → Equipment (free text v1) → Review.
- **Owed-choices engine**: a `pendingChoices(c)` derivation that returns "subclass needed
  (level 3)", "2 skills to pick", "1 feat/ASI at level 4", "spells known 4/5" — rendered
  as amber ⚠ chips on the sheet (DDB's blue flags), each chip a jump-to-fix. Warn, never
  block.
- **Level-up flow**: ＋Level button → modal listing exactly what this level grants
  (features from classes.json at that level, HP +fixed-average with override box,
  new slots, owed choices) → applies → **"What you gained" summary** (the thing DDB
  forgot). Multiclass: pick which class takes the level.
- Data prep: extend build-compendium.mjs to emit per-class progression tables
  (skill-choice counts, spells-known/prepared/cantrips by level, subclass level) — most
  already derivable from the Open5e fixtures; hand-table the rest (12 classes, small).

### D3 — Play-state depth on the sheet
- **Limited-use pips**: parse "X/Long Rest"-style uses from class/species features into
  clickable pips (usesSpent already persists); rest buttons reset matching pips.
- **CAST button** on spell chips: spends the right slot (upcast selector when higher
  slots exist), rolls the spell's attack/damage/save into the Game Log.
- **Concentration tracker**: casting a concentration spell sets `concentratingOn`;
  badge on sheet + dashboard + tracker; warning when casting a second one; CON-save
  prompt chip when the character takes damage in the tracker.
- Conditions with rules text on hover (glossary wiring exists) + a standard-conditions
  quick-pick instead of free text; exhaustion 1–6 with the 2024 effects listed.
- Attunement: 3-slot tracker on equipment lines prefixed `*` (lightweight, no item DB).

### D4 — Maps ↔ everything (the token-sheet link)
- **Link tokens to combatants/characters**: token gets `characterId`/`combatantId`;
  renders name + **HP ring** (DM always; players see PC rings only — fuzzed enemy HP
  stays hidden); click token → sheet (PC) or stat block (monster) in a side panel.
- **"⚔ → map" button**: stamp all encounter combatants as tokens (auto-numbered,
  auto-sized from monster size like DDB: Large 2×2 cells).
- **Initiative strip on the presenter** (names/portraits only, hidden monsters omitted).
- Condition badges on tokens (DDB's #1 map gap — we already track conditions).
- QoL: ruler (grid-scaled feet), basic AoE templates (circle/cone/line, damage-type
  tints), ping (double-click pulse visible on presenter), drag-to-calibrate grid helper.
- LATER (own decision): portal map view — players move their own tokens from the phone
  (Owlbear's whole pitch). Needs the portal to receive map state via SSE (plumbing
  exists); DM-gated per map.

### D5 — Campaign glue (small, high-affection features)
- **DM grant flow**: from 🛡 Party — give item / gold / XP to selected characters in one
  action (writes equipment/notes/xp); "Level Up unlocked" milestone flag that badges the
  portal sheet.
- Rest-all button on the dashboard (long rest the party after the session).
- Portal QoL: character picker remembers by device (exists), add a per-player claim
  ("this is my character" lock, honor system — no auth per Wes's call pending).

### Explicit non-goals (DDB's own graveyard + our scope guards)
- No dynamic lighting/walls/vision (Foundry trap; even DDB refuses).
- No full rules-effects automation (midi-qol depth) — close the roll→HP loop, stop there.
- No accounts/auth on the portal unless Wes asks (Owlbear lesson: the link is the table).
- No 2014/2024 dual-ruleset engine — 2024 SRD is the base, homebrew absorbs the rest.

## Suggested build order

**D1 → D2 → D4 → D3 → D5.** D1 is the biggest missing moat piece and pays off at the
very next session (rolls in Discord + Game Log on the portal). D2 makes the party
self-service for the next level-up. D4 turns the map demo into the actual fight surface.
D3/D5 are steady quality-of-life stacking.
