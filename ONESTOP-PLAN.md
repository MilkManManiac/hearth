# One-Stop-Shop Plan — rebuilding the D&D Beyond surface inside Hearth

Wes's directive (2026-07-10): turn Hearth into the one-stop DM shop — stat
blocks, maps, character building/updating, newest (2024) rules. This
supersedes the old "no maps/no VTT" scope guard. Three research passes
(DDB feature inventory · 2024 data sources/licensing · OSS prior art)
converged on the plan below.

## The data foundation (decided)
- **Bundle**: Open5e's `srd-2024` JSON fixtures (github.com/open5e/open5e-api,
  `data/v2/wizards-of-the-coast/srd-2024/`) — the canonical machine-readable
  **SRD 5.2.1**, CC-BY-4.0. Counts: 331 creatures, 339 spells, 9 species,
  12 classes + 12 subclasses (one each), 757 magic items, 203 mundane items,
  rules glossary, 15 conditions, 17 feats, 4 backgrounds.
  `scripts/build-compendium.mjs` normalizes fixtures → `public/compendium/*.json`.
- **Attribution (required, shipped in LICENSE-SRD.md + compendium footer):**
  "This work includes material from the System Reference Document 5.2.1
  ("SRD 5.2.1") by Wizards of the Coast LLC, available at
  https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative
  Commons Attribution 4.0 International License."
- **NOT bundled, user-importable later**: 5etools-format JSON (full 2024
  PHB/MM — Artificer, all subclasses, Beholder-tier IP monsters). Unlicensed
  WotC text (DMCA'd Aug 2024) — gitignored local import only, exactly like
  the audio library. DDB character JSON import for the party dashboard.

## Build phases (each ends usable)
- **C1 — Compendium** ✅ SHIPPED 2026-07-10: normalized SRD data + 📖 browser modal
  (kind tabs, fuzzy search, CR/type/level/school filters), 2024-layout stat
  blocks + spell cards, Ctrl+K searches it, hover-peek later. The DM's
  daily-driver lookup, offline.
- **C2 — Encounters & initiative** ✅ SHIPPED 2026-07-10 (⚔ right-panel tab; PC max-HP entry + presenter party view still open):: `Combatant = compendium ref + overrides +
  mutable state` (Improved Initiative's shape), per-scene encounter JSON,
  2024 XP-budget math (flat budget table — no multipliers), presenter-window
  party view with fuzzed HP. Conditions with round timers.
- **C3 — Maps + fog** ✅ SHIPPED 2026-07-10 (+ tokens: ⛂ tool — click to place, drag to move, dbl-click hides from players, right-click removes; + grid 2026-07-10: cell-size box in the toolbar, tokens snap to cell centers, players see the grid): react-konva stage in DM + presenter windows;
  `maps/*.json` = image + **vector fog shapes** (brush/polygon, add/subtract,
  undoable) + tokens[]; dungeon-revealer's "commit reveal" push model. NO
  dynamic lighting/walls/vision — that's the Foundry trap.
- **C4 — Characters** ✅ v1 SHIPPED 2026-07-10 (+ multiclass 2026-07-10: `multiclass[]`
  on Character, per-class feature gating, 2024 combined-caster slot math; the real
  party imported from Wes's DDB PDF exports incl. Eddy Pal4/Sor2 + retired Brolin
  Cleric5/Bard1. Guided builder wizard + automated DDB import still open): party dashboard first (AC/HP/passives/slots grid —
  GAMEPLAN Phase 4, DDB's biggest unfilled need), fed by DDB import or manual
  JSON. Then a 2024 builder/level-up on SRD data (class→origin→abilities→
  equipment flow), storing CHOICES and deriving stats (never persisting
  computed values — Foundry's items+advancements lesson).

## Principles from research
- Tooltips/hover-cards everywhere = what makes DDB feel good; Hearth already
  has the peek-card pattern — extend it to compendium refs.
- Beat DDB where it's weak: party dashboard, unrestricted homebrew (any JSON),
  offline/local-first, combat tracker that actually syncs PC state.
- Homebrew ✅ SHIPPED 2026-07-10: <campaign>/homebrew/*.json (same schemas as
  public/compendium) merges into the compendium/pickers/Ctrl+K with a 🏠
  badge; served to the player portal too. Elor ships Aasimar + Way of Shadow
  + Diviner (paraphrased) — the party drafts now use their REAL identities.
- Stat blocks: fixed single-column, actions as rows, math pre-parsed — never
  accordion-hidden.

- **C5 — Player portal** ✅ SHIPPED 2026-07-10: Hearth hosts a local web
  server (🌐 toggle in 🛡 Party); each player opens THEIR sheet in any browser
  — build, level up, swap spells, inventory, HP — saves land in
  characters/*.json and the DM sees them live (SSE keeps players in sync).
  LAN by default; remote players via a tunnel (cloudflared/Tailscale) — no
  auth (table of friends). End-to-end tested over HTTP.

## Round 2 — DDB mechanics study (2026-07-10, see DDB-MECHANICS.md)
Five-agent research pass on D&D Beyond's app mechanics (builder, play flow, DM tools,
Maps VTT, community sentiment). Verdict: DDB's moat = guided builder/level-up +
click-to-roll with a shared Game Log; its graveyard = tracker that can't touch PCs,
inert conditions, homebrew ceiling, silo'd sheet (Beyond20/Avrae exist to fix it).
Scope rule from Wes: **DDB parity is the ceiling** — match their mechanics, never
exceed them (UX improvements on the same mechanic are fine).
Phases — **ALL FIVE SHIPPED 2026-07-10** (full detail in DDB-MECHANICS.md):
- **D1 — Dice + Game Log** ✅: click-to-roll on every sheet number + monster stat
  block (attacks/damage/saves/init roll as the monster), visible ADV/DIS armed
  toggle + freeform tray, shared Game Log (🎲 right-panel tab + portal drawer with
  unseen badge; SSE), DM rolls default 🔒 private with a public toggle, optional
  Discord text-channel feed (picker in the Discord panel). Engine + portal API
  smoke-tested end to end.
- **D2 — Builder + level-up** ✅: owed-choices ⚠ chips (DDB's blue flags, warn-
  don't-block) driven by hand-tabled 2024 progression (skills/ASI/cantrips/
  prepared), ⬆ Level-up modal (per-class incl. new multiclass, avg HP applied,
  features + slot diffs + choices, ends on a what-you-gained summary), ⚙ Scores
  dialog (standard array / 27-point buy), live spell counters, portal players
  build their own characters (+ Build on the picker).
- **D3 — Play-state depth** ✅: limited-use pips w/ short/long-rest resets (party
  sheets pre-seeded), ⚡ CAST with upcast picker + slot spend, 🧠 concentration
  badge (one at a time), standard-condition quick-pick incl. exhaustion, * =
  attuned counter (n/3).
- **D4 — Maps ↔ everything** ✅: tokens linked to sheets/combatants (HP rings +
  condition tags), click-token inspector (stat block w/ rollable dice, HP writes
  through), ⚔→map stamping (auto-sized, foes hidden), 📏 ruler (5 ft/cell),
  📤 Send bakes PC-only HP rings + an initiative strip. Also shipped same day:
  ⭘ AoE templates (circle/cone/line in feet, damage tints, players see them) and
  Alt+click pings (pulse on DM + presenter). ~~Still open: portal token-moving~~
  — ✅ shipped 2026-07-20 as SURFACES-PLAN M5 (Ember E2).
- **D5 — Campaign glue** ✅: 🎁 Grant bar in the Party panel (give item/gold,
  🔔 unlock milestone level-up — badges the portal, cleared by leveling — and
  party-wide ☀️ long rest).
Non-goals stay: no dynamic lighting/vision, no midi-qol automation depth, no portal
auth (link-is-the-table), no dual-ruleset engine.

## Round 3 — The Surfaces plan
**See SURFACES-PLAN.md** (locked 2026-07-10 via three grill rounds): the
one-stop shop is the PROJECT, not one app. One engine, many faces — 🔥 Hearth
(DM console) · ⚔ Table (map window: library of maps + fog zones + tracker) ·
🛡 Party (character manager) · 🪨 Ember (the player browser app: sheet + live
table view). Ember's live map replaces the presenter; equipment goes DDB-depth
minus weight; milestones M1–M5 in that doc.

## Papercuts
Log every friction hit during this build in PAPERCUTS.md.
