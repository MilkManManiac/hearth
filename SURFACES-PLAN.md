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

1. **M1 — Map library**: maps as first-class entities + Map Browser + live-map
   pointer + fog zones + migrate scene.map / encounters. (Foundation for
   everything below; doesn't touch audio.)
2. **M2 — Ember E1**: the Table view (live-follow, view-only) + /asset image
   route. Presenter retires when this is proven at a real table.
3. **M3 — The window split**: Table + Party become real windows; tracker moves
   into Table; console slims down.
4. **M4 — Inventory/equipment overhaul** + migration (can interleave with M2/M3).
5. **M5 — Ember E2** (own token + ping + measure), then E3.

## Non-goals (standing)

DDB parity remains the mechanics ceiling. No dynamic lighting/walls/vision, no
midi-qol automation, no dual-ruleset engine, no weight/encumbrance, no player
notes tool (yet), no separate-state apps.
