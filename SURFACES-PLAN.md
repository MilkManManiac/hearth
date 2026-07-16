# The Surfaces Plan — Hearth's faces (locked 2026-07-10, Wes grill rounds 1–3)

Wes's reframe: **the one-stop shop is the PROJECT, not one app.** The DM and
player experiences are completely different products. This doc is the charter;
every decision below came from the interactive grill — change them only with
new answers from Wes.

## The names (locked)

| Face | What it is | Who uses it |
|---|---|---|
| 🔥 **Hearth** | The DM console — sound, scenes, read-aloud, notes, compendium. The umbrella brand AND the fire itself. | DM only |
| ⚔ **Table** | The battle window — map library, fog zones, tokens, tracker, stat blocks. The DM's mid-fight home base. | DM only |
| 🛡 **Party** | The character manager — sheets, builder oversight, 🎁 grants. | DM only |
| 🪨 **Ember** | The player app in any browser — my sheet, dice, and the live table view. Each player carries an ember of the hearth. | Players |

## Architecture (locked): one engine, many faces

**NOT separate apps.** The Electron main process stays the single campaign
server (JSON files + HTTP/SSE portal + Discord). Splitting into real apps would
recreate the DDB/Avrae/Owlbear state-triplication disease — sync is free only
while one process owns the files. The split is by **window**: Table and Party
graduate from overlay/modal to their own Electron windows; Hearth (console)
keeps sound/scenes/notes. Ember is the served browser app. Repo may split into
packages later for maintainability; runtime stays one engine.

**Players never touch Hearth.** No player-facing notes tool for now (paper /
Google Docs is fine, revisit later).

## ⚔ Table (the map system) — DDB Maps model, locked

- **Maps are first-class campaign entities** (a map library), NOT per-scene
  props. Prep several maps like browser tabs; **switching the live map switches
  what players see**. (Migration: today's `scene.map` moves into the library;
  scenes keep audio/script/images only.)
- **Fog zones**: during prep the DM paints named fog regions (rooms, corridors);
  live, one click clears a zone as the party advances. Freehand brush stays for
  improv. This replaces "brush everything live" as the primary workflow.
- **Live-follow**: player view tracks the LIVE map + its current fog/token
  state in real time (tokens move live, zones clear live). The 📤 commit model
  retires along with the presenter window once this is solid.
- **The tracker moves INTO the Table window** (Map window only — the console's
  ⚔ tab becomes an "open the Table" pointer). Encounters attach to maps, not
  scenes. Monster stat blocks + a small SFX pad live in the Table window so the
  DM never alt-tabs mid-fight.
- Existing D4 features carry over: linked tokens, HP rings, condition tags,
  ⚔→map stamping, ruler, pings, AoE templates, grid + snap.

## 🪨 Ember (the player app) — staged, locked

Stage **E1 — Table view (view-only)**: a tab beside "my sheet": the live map
(fog'd), initiative strip, party HP; plus whatever image/handout the DM shows.
Works on phones.
Stage **E2 — own token + ping + measure**: players move ONLY their own PC token
(never others — DDB's most-hated default), ping, and use the ruler. Rolling
stays on the sheet page.
Stage **E3 — the rest**, as the table demands it.

Already shipped in Ember: create/build (⚠ chips), level up, swap skills/spells,
click-to-roll with ADV/DIS, spell slots + ⚡ cast, rest resets, limited-use
pips, Game Log drawer.

## 🛡 Inventory & equipment — full DDB depth MINUS WEIGHT, locked

"No one ever cares about weight." No weight, no encumbrance, ever.
- **Structured inventory rows**: name, qty, equipped ✓, attuned ✦ (max 3),
  charges (wired to limited-uses), notes. Free-text stays possible via custom
  items.
- **Catalog + custom**: players search the SRD's 203 mundane + 757 magic items
  (+ campaign homebrew) with stats attached, or create custom items with manual
  bonuses. DM 🎁 Grant drops structured rows.
- **Auto AC with override**: equipping armor/shield computes AC from real 2024
  formulas (dex caps, unarmored defense); a manual override box absorbs weird
  cases. Equipped weapons feed the attack/roll rows.
- **Money**: per-character coin pouch (cp/sp/gp/pp with math) PLUS one shared
  **party stash** any player can view/edit (the Bag of Holding is real).
- **Migration**: Claude auto-converts the five imported sheets' free-text lines
  (catalog-matched where names line up, custom rows otherwise; gold lines →
  pouches) and flags ambiguities for Wes to tidy in-app.

## Sequencing + constraints (locked)

Session **next week uses ONLY the sound mixer / scene builder** — the audio
core must stay rock-stable; Table/Party/Ember are ongoing projects with no
deadline pressure ("take our time and make sure those are set").

1. **M1 — Map library** ✅ SHIPPED 2026-07-10: `maps/*.json` first-class maps
   (strokes + named fog zones + tokens + overlays + grid + the encounter),
   auto-migration from scene.map/encounter (verified on real Eekso data,
   idempotent), `table.json` live pointer + 🔴 Go live, ◇ Zone tool (polygon,
   auto-named, sidebar list, one-click toggle), MapsPanel library browser
   (TopBar 🗺), presenter live-follows the live map (pushed images interject).
2. **M2 — Ember E1** ✅ SHIPPED 2026-07-10: portal 🗺 Table view live-follows
   the live map (fog zones clear in real time, initiative strip, PC HP rings);
   GET /api/table + path-guarded /asset image route. Presenter retires when
   this is proven at a real table.
3. **M3 — The window split** ✅ SHIPPED 2026-07-16: `WindowManager`
   (src/main/windows.ts) — per-role singleton windows with remembered bounds;
   Table gets `backgroundThrottling: false`. App.tsx hash-routes `#table` /
   `#party` to window roots; both use the store's data-only `bootstrapData()`
   (NO audio engine / Discord-tap wiring — one engine, console only). ⚔ Table
   window = container-sized MapEditor + docked encounter tracker (collapsible,
   map switcher); 🛡 Party window = the full party manager. Console slimmed:
   TopBar 🛡/⚔ open the windows, the right-panel ⚔ tab is an "Open the Table"
   pointer, MapsPanel/ImageStrip 🗺 route map editing into the Table window.
   Smoke-verified (HEARTH_SMOKE=windows + HEARTH_CAMPAIGN override capture
   per-window screenshots headlessly). Deferred to post-freeze: the Table
   window's SFX pad (needs an audio relay to the console window — the frozen
   core).
4. **M4 — Inventory/equipment overhaul** ✅ SHIPPED 2026-07-16: structured
   `InventoryItem` rows (qty/equipped/attuned ✦ decoupled/charge pips/notes/
   catalog link) replace the free-text box; auto-AC derived at render from the
   hand-tabled 13 SRD armors + shield (2024 dex caps, Barbarian/Monk unarmored
   defense) with `acOverride` for weird cases — every AC display goes through
   `effectiveAc()` (src/shared/inventory.ts); coin pouch with auto-make-change
   + ledger; **party stash** (`party.json`, transfer-never-copy + activity
   log) — 🎒 in the Party panel, drawer in the portal; catalog search-first
   add (equip-now / pay-from-pouch); 🎁 Grant writes rows + pouch gold. The 5
   real sheets auto-migrated (verified on scratch copies first: 4/5 ACs
   reproduced by the formula, Eddy pinned at his imported 16; originals kept
   in `legacyEquipment`).
5. **M5 — Ember E2** (own token + ping + measure), then E3.

## Research appendix (4-agent pass, 2026-07-10 — details in the session log)

- **Fog zones** (dungeon-revealer / Owlbear 1.0 toggle-fog + 2.4 Forecast /
  Simplefog / DDB polygon fog): polygon = the zone tool (click vertices; close
  via visible first-vertex handle, double-click, or Enter; Esc cancels);
  auto-name "Zone N" with optional inline rename; new zones SUBTRACT from
  existing (no two zones own a pixel); zone reveal is a TOGGLE, never
  consumption; sidebar list with eye toggles + click-on-canvas both, with
  bidirectional hover-highlight; DM sees zones tinted ~40% with name labels,
  players see solid black; brush stays for improv on a separate layer; undo for
  polygon draw + Cover/Reveal All; no partial zone states ever (split in prep).
- **Live model**: DDB-style — the LIVE map streams everything (zone toggles,
  tokens, fog) in real time; non-live maps are the prep space; Blackout is the
  safety valve. (dungeon-revealer's staged Send retires with the presenter.)
- **Inventory** (DDB/Pathbuilder/Tidy5e/foundry-party-inventory): row =
  equip icon-button + name + attuned dot + charge pips + qty; bottom-sheet
  detail; search-first add with qty/equip-now/attune-now and optional "pay
  from pouch" (Pathbuilder); `attuned` NEVER coupled to `equipped` (DDB's #1
  complaint) — visible `Attuned n/3` tracker instead; coins with auto-make-
  change + transaction ledger; party stash = transfer-never-copy + activity
  log ("Cumb took the +1 Longsword"); NO containers (pointless without weight).
- **Windows** (Electron research): keep mutation→main→broadcast (sane at our
  scale), add revision gating later if needed; WindowManager module with
  per-role singletons + electron-window-state; `backgroundThrottling: false`
  on the Table window so Konva renders unfocused; toasts to focused window.
- **Codebase seams**: equipment.json shipped WITHOUT armor ac/properties
  (fixture gap) → hand-table the 13 SRD armors for auto-AC; probeAssets +
  purgeTrash must include map images once maps are first-class; EncounterPanel
  re-scopes from scene → map; App.tsx hash routing is the window switch point.

## Non-goals (standing)

DDB parity remains the mechanics ceiling. No dynamic lighting/walls/vision, no
midi-qol automation, no dual-ruleset engine, no weight/encumbrance, no player
notes tool (yet), no separate-state apps.
