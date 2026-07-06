import type { EditorView } from '@tiptap/pm/view'
import type { CueKind } from '../../shared/types'

export interface CueAttrs {
  kind: CueKind
  ref: string
  label: string
}

/** The single character at doc position `pos` (leaf/atom → '', block break → \n). */
function charAt(view: EditorView, pos: number): string {
  const size = view.state.doc.content.size
  if (pos < 0 || pos >= size) return ''
  return view.state.doc.textBetween(pos, pos + 1, '\n', '')
}

const isWordChar = (c: string) => /\w/.test(c)

/**
 * Round a drop/caret position to the nearest word boundary so a cue can never
 * land inside a word. If already at a boundary (adjacent to a space, cue, or
 * block edge), the position is returned unchanged.
 */
export function snapToWord(view: EditorView, pos: number): number {
  const size = view.state.doc.content.size
  pos = Math.max(0, Math.min(pos, size))
  if (!isWordChar(charAt(view, pos - 1)) || !isWordChar(charAt(view, pos))) return pos

  let left = pos
  while (left > 0 && isWordChar(charAt(view, left - 1))) left--
  let right = pos
  while (right < size && isWordChar(charAt(view, right))) right++
  return pos - left <= right - pos ? left : right
}

/** Insert a cue node at `pos`, snapped to the nearest word boundary. */
export function insertCueAt(view: EditorView, pos: number, attrs: CueAttrs): void {
  const type = view.state.schema.nodes.cue
  if (!type) return
  const snapped = snapToWord(view, pos)
  try {
    view.dispatch(view.state.tr.insert(snapped, type.create(attrs)))
    view.focus()
  } catch {
    // Position wasn't a valid inline spot (e.g. between blocks) — insert at the
    // current selection instead.
    const at = view.state.selection.from
    view.dispatch(view.state.tr.insert(at, type.create(attrs)))
    view.focus()
  }
}
