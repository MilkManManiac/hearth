# HANDOFF — read this before your first commit

You (and your Claude/Sol sessions) are joining a project that is **Wes's live
D&D toolchain**, not a sandbox. His table runs on this code. This doc is the
context an agent can't infer from the code: what we're building, why the big
decisions went the way they did, and the few rules that are actually hard.

Start every session by reading **CLAUDE.md** (the operational brain — layout,
commands, conventions). This doc is the layer above it: goals and direction.

---

## What this project IS

**The one-stop shop for running D&D over Discord — as a PROJECT, not one app.**
A DM (Wes) runs his campaign with: pre-built scenes (music/ambience/SFX/images/
read-aloud scripts), a wiki-linked campaign notebook, an SRD 5.2.1 rules
compendium, native 2024 character sheets, an encounter tracker, battle maps
with fog-of-war, dice with a shared Game Log, and a browser app his players
open on their phones. Audio streams into the Discord voice channel.

Four named faces, ONE engine (SURFACES-PLAN.md is the charter):

| Face | What | Who |
|---|---|---|
| 🔥 **Hearth** | DM console — sound, scenes, read-aloud, notes, compendium | DM |
| ⚔ **Table** | Battle window — map library, fog zones, tokens, tracker | DM |
| 🛡 **Party** | Character manager — sheets, builder oversight, grants | DM |
| 🪨 **Ember** | The player app in any browser — sheet, dice, live table view | Players |

## The decision spine (do not relitigate without new evidence)

These were each researched and deliberately chosen; the reasoning lives in the
linked docs:

1. **One engine, many faces — NEVER separate apps with their own state.** The
   Electron main process owns the campaign JSON, the player HTTP portal, and
   Discord. Splitting state across apps recreates the disease that kills every
   multi-tool D&D stack (sheet/bot/map triplication — see DDB-MECHANICS.md).
   The M3 milestone splits *windows*, not processes.
2. **DDB parity is the mechanics ceiling** (Wes's explicit rule: "no intent to
   go above and beyond what they do as far as mechs"). Match D&D Beyond's
   mechanics; improve UX on the same mechanic freely; add *no* deeper
   automation. Concretely banned: dynamic lighting/walls/vision, Foundry-style
   effect chaining (midi-qol), auto-applied situational modifiers.
3. **Choices stored, stats derived.** Characters persist decisions (class,
   scores, spells); everything computable is computed at render (lib/character
   .ts, lib/progression.ts). Never persist derived values — Foundry's lesson.
4. **Warn, don't block.** Rules guidance is amber chips and counters, never a
   hard gate. Homebrew and table rulings always win.
5. **Homebrew is data-equal.** `<campaign>/homebrew/*.json` merges into the
   compendium with a 🏠 badge. Same schemas as public/compendium. Anything can
   be homebrewed — that's a core advantage over DDB.
6. **JSON files in a campaign folder. No database.** Hot-reloaded by a watcher,
   synced across machines via THIS git repo. `writeJsonAtomic` for every save.
7. **Read-first surfaces.** Play views are read-only; authoring hides behind
   build mode / ✎ toggles. Click-a-link navigates, never edits.
8. **Live-follow.** Players follow the LIVE map in real time (zones clear as
   the DM clicks). Non-live maps are the prep space. The presenter window is
   legacy — Ember's Table view replaces it once proven at a real table.
9. **No weight/encumbrance, ever.** ("No one ever cares about weight.")

## Where we are / where we're going

Shipped (all 2026-07-10, see ONESTOP-PLAN.md C1–C5 + D1–D5, SURFACES-PLAN
M1–M2): compendium, tracker, character sheets + multiclass + real imported
party, player portal, dice + Game Log (portal + optional Discord feed),
builder chips + level-up modal, map library with fog zones + live-follow,
Ember's Table view. **Human-tested: almost none of it.** Wes has a session
next week using ONLY the sound/scene core.

Open milestones, in order (full specs in SURFACES-PLAN.md — the research
appendix is effectively the design doc):

- ~~M3 — window split~~ ✅ shipped 2026-07-16 (WindowManager, hash-routed
  `#table`/`#party` roots, tracker docked in the Table window).
- ~~M4 — inventory/equipment overhaul~~ ✅ shipped 2026-07-16: structured rows,
  auto-AC (`src/shared/inventory.ts` — armor table + `effectiveAc()`), coin
  pouches, party stash (`party.json`, transfer-never-copy), Grant → rows,
  5 real sheets migrated (originals in `legacyEquipment`).
- **M5 — Ember E2**: players move their OWN token + ping + measure. Never
  other tokens.
- **Design pass**: the app is "functional but plain" (Wes's words, TODOS #1).
  Shared primitives, visual polish. Wide open for someone with taste.
- Smaller open items: guided builder wizard, portal auth-for-tunnel (needed
  before exposing the portal beyond LAN), store.ts split, drag-to-calibrate
  grid helper, Chronicler → auto session notes (the dream feature).

## HARD RULES (the short list that actually matters)

1. **🔊 DO NOT TOUCH THE AUDIO CORE until Wes's next session has happened.**
   Frozen: `src/renderer/audio/AudioEngine.ts`, the audio actions in
   `store.ts`, `SoundConsole/MusicPalette/AmbienceMixer/SfxGrid`, the scene
   arm/go-live flow, and `src/main/discord.ts`'s voice path. His session runs
   on exactly this. If a change *forces* you near it, leave it for after.
2. **Pull before you start; push when green.** Two parties push straight to
   main — small, frequent, descriptive commits; `npm run typecheck` AND
   `npm run build` before every push. The repo is also Wes's campaign sync —
   never leave main broken.
3. **`campaigns/elor-rebirth/` is his REAL campaign** (notes, the actual
   party's sheets, session prep). Don't bulk-edit or "clean up" anything in
   there; code changes must migrate his data safely (see the M1 migration in
   campaign.ts for the pattern: idempotent, atomic writes, tested on a scratch
   copy first).
4. **Never commit copyrighted content**: no verbatim WotC book text (SRD
   5.2.1 CC-BY is fine; homebrew must be paraphrased mechanics), no ripped
   audio (`license: private` assets stay gitignored). SRD attribution
   (LICENSE-SRD.md) ships with the compendium.
5. **`hearth-config.json` (userData) is merge-written, never overwritten** —
   it holds the Discord bot token.
6. Windows quirks that WILL bite you once: packaging fails EBUSY while
   Hearth.exe runs (`npm run pack:wait` waits for close — output lands
   OUTSIDE the repo, see DEPLOY.md); PS 5.1 `Set-Content -Encoding utf8`
   writes a BOM that breaks Node's JSON.parse; content going into TS template
   literals must be edited directly, never via shell pipelines. PAPERCUTS.md
   is the full scar-tissue log — add yours.

## How to verify anything

- `npm run dev` — hot-reloading app (dev userData is `%APPDATA%\Electron`, so
  dev uses its own hearth-config — usually pointed at `campaign-sample/`).
- `HEARTH_PORTAL=1` + launching `out/main/index.js` headless = the tested
  pattern for exercising the portal/API/migrations without a UI (grep the git
  log for "smoke-tested" commits to see examples).
- After mechanical rewrites, **smoke-test a WRITE path, not just boot** — a
  regex once rewrote `writeJsonAtomic` into infinite recursion and passed
  typecheck + boot.

## Working with Wes

- He runs autonomous "send it" sessions: build → typecheck → build → commit →
  push, repeatedly, with review items queued for him instead of blocking.
- Things needing his eyes/decision go in **TODOS.md → "🔔 WES — review queue"**.
- When direction is genuinely his call, he likes being **grilled** — pointed
  multiple-choice questions (AskUserQuestion), never open-ended essays.
- Friction goes in **PAPERCUTS.md** (one line, newest first).
- Docs are load-bearing: status lives in CLAUDE.md + the plan docs; when you
  ship a milestone, mark it in SURFACES-PLAN.md so the next session (his,
  yours, or an agent's) doesn't re-derive state.

## Doc map

| Doc | What it is |
|---|---|
| **CLAUDE.md** | Operational brain: layout, commands, conventions. Agents read it automatically — keep it true. |
| **SURFACES-PLAN.md** | THE charter: faces, locked decisions, milestones M1–M5, research appendix. |
| **DDB-MECHANICS.md** | The D&D Beyond study: what to steal/avoid, scorecard, D1–D5 detail. |
| **ONESTOP-PLAN.md** | History of rounds C1–C5 and D1–D5 (all shipped). |
| **GAMEPLAN.md** | Original architecture rationale (audio engine, data model). |
| **AUDIT-2026-07-10.md** | Bug/priority punch list. |
| **TODOS.md** | Backlog + Wes's review queue. |
| **PAPERCUTS.md** | Environment scar tissue — read before fighting the tooling. |
| **DEPLOY.md / DISCORD-BRIDGE.md** | Packaging; the voice bridge (status contested — ask Wes). |
