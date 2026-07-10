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
Plan phases (full detail in DDB-MECHANICS.md; build order D1→D2→D4→D3→D5):
- **D1 — Dice + Game Log**: click-to-roll everywhere, visible adv/dis, campaign roll
  feed (DM app + portal via SSE + optional Discord embeds), roll→damage applies to
  the tracker.
- **D2 — Builder wizard + level-up**: guided create steps, owed-choices ⚠ engine,
  level-up modal with "what you gained" summary; per-class progression tables added
  to build-compendium.
- **D3 — Play-state depth**: limited-use pips, CAST button w/ upcast, concentration
  tracking, standard-condition picker, attunement slots.
- **D4 — Maps ↔ everything**: tokens linked to sheets/stat blocks w/ HP rings,
  ⚔→map stamping, presenter initiative strip, condition badges, ruler/AoE/ping;
  portal token-moving later.
- **D5 — Campaign glue**: DM grant flow (item/gold/XP), milestone level-up flag,
  party rest-all.
Non-goals stay: no dynamic lighting/vision, no midi-qol automation depth, no portal
auth (link-is-the-table), no dual-ruleset engine.

## Papercuts
Log every friction hit during this build in PAPERCUTS.md.
