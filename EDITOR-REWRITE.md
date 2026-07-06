# Read-aloud editor rewrite — spec (TODOS #2)

Decisions from the grill session (2026-07-06). This replaces the raw
`contentEditable` `ScriptEditor.tsx` that corrupts scene text (mid-word drops,
stray whitespace). Build against this; each item ends verified live (`npm run dev`).

## Scope shift (important)
The original constraint "keep `ScriptNode[]` serialization unchanged" is
**intentionally dropped**. The read-aloud panel is now a genuine rich-text
document (block structure + inline marks + atomic cue chips), so the schema and
`scriptCompile.ts` **will** change. That schema redesign is the largest piece of
work, not a footnote.

## Foundation
- **TipTap (on ProseMirror)**, MIT. Everything needed is free core/StarterKit:
  bold/italic/heading, `@tiptap/extension-color` + `text-style`, `highlight`,
  custom node/mark, `dropcursor`, `BubbleMenu`, `history`. Pure JS — **no native
  module**, so it sidesteps the `vcruntime140.dll` install gotcha in CLAUDE.md.
- Rationale: ProseMirror's position/transaction model is the gold standard for
  the exact caret-precision + atomic-node correctness that's broken today. Cues
  become **atomic inline nodes** (React NodeView), which structurally eliminates
  the text-mangling bug class.

## Data model (own, framework-neutral schema)
Stored in **`scene.script`** (field reused; type changes from the flat array to
the tree below). Not raw TipTap JSON — we keep a documented schema and a
TipTap↔schema mapping layer so data files aren't locked to the editor library.

```ts
type ScriptDoc = Block[]

type Block =
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'heading'; level: 1 | 2 | 3; content: Inline[] }
  | { type: 'callout'; content: Block[] }        // DM-note box; nests blocks

type Inline =
  | { type: 'text'; text: string; marks?: Mark[] }
  | { type: 'cue'; kind: 'music' | 'sfx' | 'image'; ref: string; label?: string }

type Mark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'color'; value: string }       // named palette id, not hex
  | { type: 'highlight'; value: string }   // named palette id, not hex
```

- **Callouts nest blocks** (`content: Block[]`) — multi-paragraph stage
  directions allowed; cue chips allowed inside.
- **Color/highlight use a fixed named palette** (e.g. `danger` / `whisper` /
  `emphasis`), mapped to Hearth theme colors — dark-mode-safe, one-click,
  Claude-authorable. Not free-form hex. Define the palette in `types.ts`
  alongside `LIBRARY_CATEGORIES`.

### Migration
Loader detects legacy shape (top-level `type: 'text' | 'cue'` array) and
up-converts to the tree (wrap runs in `paragraph`, split on `\n`). Re-persisted
as a tree on the next save. One field (`scene.script`), one meaning.

## Authoring path (Claude via `scriptText`)
`scriptText` becomes **structural markdown + cues**: `#` headings, `**bold**`,
`*italic*`, `> [!dm]` callouts, plus today's `{{sfx:...}}` / `{{music:...}}` /
`{{image:...}}` cues. `scriptCompile.ts` grows from a cue-splitter into a
markdown→`ScriptDoc` compiler (use a small proven parser, e.g. markdown-it, in
`src/shared/` — no editor dependency, since compile runs at load).
**Color/highlight are app-only** polish — they don't map cleanly to markdown, so
Claude doesn't author them. Keeps the compiler tractable.

## Interaction
- **Drop placement:** live drop-caret while dragging, but **snap the final drop
  to the nearest word boundary** — a cue can never land inside a word. Kills the
  reported bug directly.
- **Insertion methods:** drag-and-drop **and** click-a-tray-item →
  insert-at-caret (mouse-light, keyboard-accessible). No slash command.
- **Chip controls:** hover **×** (comfortable hit target) + native
  **Backspace/Delete** on a selected chip + **drag to reposition**. Click a chip
  to select.
- **Tray source:** the **full categorized Library** (grouped by category,
  searchable — reuse `LibraryPanel` search/grouping). Dropping an asset not yet
  on the scene **auto-registers** it into `scene.sfx/music/images` (synthesize
  id + label) so palette and cue stay in sync. Watch for duplicate ids. Realizes
  the deferred TODOS #4 "group tray by category."

## Mode & saving
- Keep an explicit **✎ Edit ↔ Done** mode toggle (required: read-mode chips
  **fire** the sound; edit-mode chips are editable — contradictory on the same
  element, so no always-editable). Aligns with the prep-vs-run split in TODOS #1.
- **Debounced autosave** while editing (no data loss on a crash). `Done` exits
  to read mode. **Undo/redo (Ctrl+Z / Ctrl+Shift+Z)** replaces the Cancel button.

## Formatting UI
- Inline marks (bold/italic/color/highlight) in a **BubbleMenu** on selection.
- Block actions (heading, callout) in a **small fixed toolbar** atop the editor.

## Read-mode renderer
`ScriptPanel`'s non-editing view must render the new tree: headings, visually
distinct **callout boxes** (so you never read your own notes aloud), and inline
marks — while keeping cues as **clickable fire buttons**. Rebuild `renderNode`
into a recursive block/inline renderer.

## Serialization boundary — unchanged consumers
`scene.script` stays the persisted structured field; `store.updateScene()` →
`window.hearth.saveScene()` → `campaign.saveScene()` still writes scene JSON and
hot-reloads. The schema *shape* changes; the save/load *plumbing* does not.

## Out of scope for this pass
Player-facing script rendering (players never see the script — `PresenterView`
pushes images only). Slash-command insertion. Free-form hex colors. Full
extended-markdown color syntax.
