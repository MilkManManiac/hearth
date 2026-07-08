# Hearth Notes — design plan (2026-07-07)

**Goal (from the DM):** Hearth + D&D Beyond are the only two tools open at the
table. Maps/rules/pics → D&D Beyond. **All sound + ALL notes → Hearth.** No
tab-hopping, no folder-hunting. Campaign: *Elor: Rebirth*.

Grounded in two research passes: (a) a survey of DM note tools (Obsidian TTRPG
vaults, LegendKeeper, Kanka, World Anvil, Notion/OneNote binders, Realm Works
post-mortem) + the Lazy DM prep methodology; (b) a code map of what Hearth can
reuse. Key findings that shape everything below:

1. **Links beat folders.** Every mature system converges on: shallow filing,
   `[[wiki-links]]` as the real structure, backlinks doing the organization
   automatically. Deep folder trees are an anti-pattern.
2. **Capture friction kills note systems.** If adding a note mid-session takes
   more than "hotkey → type → enter," it doesn't happen. DMs write sparse
   shorthand live and detailed recaps after (93/337 r/DMAcademy comments).
3. **Field-heavy templates fail** (World Anvil's reputation). An NPC should be
   creatable in 30 seconds: name + freetext + a couple of optional light fields.
4. **The Lazy DM one-pager** (strong start / scene outline / secrets & clues /
   locations / NPCs) is the de-facto session-prep artifact. Secrets & clues is
   a *checklist consumed during play* whose unchecked items roll forward.
5. **Local plain files won** (Realm Works died of cloud lock-in). Matches
   Hearth's no-database stance perfectly.

## Ground truth: how this DM actually preps (from Elor_ Sessions.docx)

Read 2026-07-07 (Sessions 0–13, one rolling Google-Doc-style file). The format
per session: **Recap** (narrated aloud) → **read-aloud scene blocks** with DM
prompts ("What would you like to do?"), NPC dialogue, inline image URLs →
**skill-check branches** (Insight 15+ / fail tiers) → **per-PC beats** (dreams,
downtime, "turn it over to Eddy") → initiative lists w/ HP+image links →
post-session **To-Do / Ideas / Things to figure out** lists.

Implications:
- His prep doc IS a Hearth scene script already — sessions-group-scenes is the
  core model, not a bonus. The recap itself is read-aloud (could be a scene).
- Real pain = **duplication**: NPC blocks and encounter tables are copy-pasted
  across sessions (Root's scene appears twice verbatim). Links fix this.
- Even a "wing it" DM accumulates entities: ~10 recurring NPCs, locations,
  open threads (the S-mark, Varen's mark, Tad missing). Light pages + backlinks
  fit; heavy templates don't. He explicitly wants it usable by note-heavy DMs
  too — don't overfit to minimal notes.
- Inline image URLs everywhere → image cues / art imports should absorb these.
- **Future script-editor idea:** a "check" callout with DC tiers (Success /
  Fail reveal blocks) — his most-used structure that plain callouts only
  half-cover. Also: an **import** of this .docx into sessions/scenes/notes
  once N2 lands would be the perfect validation.
- Kinds: he confirmed adding **PC** (per-player pages). Initiative tracking
  stays out of scope (VTT-adjacent; a plain checklist note works).

## The model

### Answering "maybe it's not folders"
Correct instinct. The structure is **flat notes + types + links**, browsed as
if it were folders:

- Every note is one JSON file in `<campaign>/notes/` (mirrors `scenes/`).
- A note has a **kind**: `npc` · `location` · `faction` · `item` · `thread` ·
  `session` · `note` (generic scratch — the default; never force a type).
- The browser GROUPS by kind, so it *feels* like "folders: NPCs, Locations,
  Sessions…" — but a note can be linked from anywhere, and moving/retyping is
  one field, not a file move.
- The campaign root IS the top folder ("Elor: Rebirth" = the campaign folder
  the app already opens).

### Note shape (new type in `src/shared/types.ts`)
```jsonc
{
  "id": "grelka-the-fence",
  "kind": "npc",
  "title": "Grelka the Fence",
  "body": /* ScriptDoc — same rich-text tree the script editor uses */,
  "fields": { "location": "duskhollow", "status": "alive" }, // optional, light
  "tags": [],
  "createdAt": "...", "updatedAt": "..."
}
```
- `body` is a **ScriptDoc** — reuses the whole TipTap stack (headings, bold,
  callouts, colors). Editor = `ScriptEditor` minus the cue tray (already a
  clean seam, per the code map).
- `thread` notes get `status: open|resolved` + checklist items (secrets & clues).
- `session` notes get `date` + the Lazy-DM template pre-filled + a scene list.

### Sessions group scenes (the "Session 1 with multiple scenes" ask)
- `Scene` gains `session?: string` (a session-note id).
- **SceneList groups by session** (collapsible headers, newest first;
  un-assigned scenes in "Unfiled"). Assign via drag or a picker on the row.
- The session note shows its scenes as links; ▶ from the note arms the scene.
- This gives the "Sessions folder" feel with zero file moves and keeps every
  scene file exactly where the loader already expects it.

### Linking (the sleeper feature)
- `[[Name]]` in any note body becomes a live link (new TipTap mark/node,
  same pattern as the cue chip). Typing `[[` opens fuzzy autocomplete over all
  notes + scenes; an unknown name offers **"create NPC/Location/… →"** —
  the 30-second-NPC path.
- Every note shows **backlinks** ("mentioned in: Session 3, Duskhollow,
  The Ashen Hand") — the post-session fan-out happens automatically.
- Later: unlinked mentions ("'Grelka' appears in Session 5 — link it?").

### Capture + retrieval (the two speeds)
- **Quick capture (live):** global hotkey (`Ctrl+J`) → one-line input drops a
  timestamped line into the **current session's log** section, without leaving
  the script/console. This is the "player just made a promise to remember" key.
- **Quick switcher (3-second rule):** `Ctrl+K` → fuzzy search by title across
  notes + scenes + library; Enter opens it. Full-text search lives in the same
  box as a second tier ("no title match → content matches"). In-memory search
  is fine at this scale (LibraryPanel already filters 2k assets live).

### Where it lives in the UI
- **Build mode:** a **Notes rail** as a sibling/tab of the scene list (left
  side) + notes open in the main area (or a wide modal, Library-style).
- **Run mode:** notes DON'T take over the screen. `Ctrl+K` opens the switcher
  as an overlay; a picked note opens in the right panel (new tab beside
  Images/Ideas/Cast) so the script stays visible. Quick capture is a one-liner
  overlay. Teleprompter keys keep working (keys.ts arbitration, capture-phase).
- Existing per-scene **Ideas** stays (it's session scratch that works).
  **Cast & Loot** eventually gets a "promote to campaign note" button per
  entry (entity graduates from scene-local to a real NPC/item note, the scene
  keeps a link).

## Build phases (each ends usable)

**N1 — Notes exist (foundation).**
`Note` type; `notes/` loader/watcher/save/create/delete in campaign.ts (clone
of the scenes path, ~4 IPC channels); Notes browser grouped by kind; NoteEditor
(ScriptEditor minus cues); create note in 2 clicks. *Usable as: a
notebook with rich text, grouped by type.*

**N2 — Sessions + retrieval.**
`session` kind with Lazy-DM template; `Scene.session` + grouped SceneList;
`Ctrl+K` fuzzy switcher (notes + scenes); right-panel Notes tab in run mode;
`Ctrl+J` quick capture into the session log. *Usable as: the full at-the-table
loop.*

**N3 — Links.**
`[[link]]` node + autocomplete + create-on-first-use; backlinks panel;
clickable links navigate. *Usable as: the knowledge web.*

**N4 — The loops that compound.**
Secrets/clues checklist on session notes with **carry-forward** (unchecked →
next session's prep); promote-to-note from Cast panel; unlinked mentions;
full-text search tier; scene script `[[links]]` to notes (open in right panel).

## Deliberately NOT doing
- Field-heavy entity templates, mandatory categorization, deep hierarchies.
- Maps/handout management (D&D Beyond's job; presenter images already exist).
- Cloud/sync anything. Notes are local JSON next to the scenes.
- Player-facing note sharing (maybe someday via presenter; not now).

## Open decisions (for the DM)
1. Notes browser in build mode: left-rail tab beside Scenes vs. full-screen
   modal (recommend: rail tab — notes are peers of scenes, not a popup).
2. Hotkeys: `Ctrl+K` switcher / `Ctrl+J` capture OK? (Space/arrows stay owned
   by the teleprompter.)
3. Kind set: npc / location / faction / item / thread / session / note —
   anything missing for Elor: Rebirth? (PCs? Deities? Can also just be tags.)
4. Do we grill-me the N2 session template (what's on YOUR one-pager)?
