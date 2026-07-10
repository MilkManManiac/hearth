import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import { NOTE_KINDS, type CampaignNote } from '../../shared/types'
import { fuzzyScore } from '../lib/fuzzy'
import { useStore } from '../store'

interface SuggestState {
  /** Doc position of the opening `[[`. */
  from: number
  /** Caret position (end of the query). */
  to: number
  query: string
  left: number
  top: number
}

interface Hit {
  key: string
  icon: string
  label: string
  detail: string
  pick: () => void | Promise<void>
}

/**
 * Typing `[[` in the editor opens this fuzzy autocomplete over all campaign
 * notes; Enter/Tab inserts an atomic noteLink chip (ref = note id, live-titled).
 * An unmatched name offers create-on-first-use — the 30-second-NPC path.
 * Wraps EditorContent so its capture-phase keydown wins over ProseMirror.
 */
export default function LinkSuggest({ editor, children }: { editor: Editor | null; children: ReactNode }) {
  const notes = useStore((s) => s.campaign.notes)
  const createNoteInline = useStore((s) => s.createNoteInline)
  const [suggest, setSuggest] = useState<SuggestState | null>(null)
  const [sel, setSel] = useState(0)
  // Esc dismisses; remember where so re-detection doesn't instantly reopen.
  const dismissedFrom = useRef<number | null>(null)

  const detect = (ed: Editor): SuggestState | null => {
    const { state } = ed
    const { $from, empty } = state.selection
    if (!empty || !$from.parent.isTextblock) return null
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
    const m = /\[\[([^\[\]￼]*)$/.exec(before)
    if (!m) return null
    const from = $from.pos - m[0].length
    let coords: { left: number; bottom: number }
    try {
      coords = ed.view.coordsAtPos($from.pos)
    } catch {
      return null
    }
    return {
      from,
      to: $from.pos,
      query: m[1],
      left: Math.min(coords.left, window.innerWidth - 320),
      top: coords.bottom + 4
    }
  }

  useEffect(() => {
    if (!editor) return
    const onTx = () => {
      const s = detect(editor)
      if (s === null) dismissedFrom.current = null
      setSuggest(s && s.from === dismissedFrom.current ? null : s)
    }
    editor.on('transaction', onTx)
    editor.on('blur', onTx)
    return () => {
      editor.off('transaction', onTx)
      editor.off('blur', onTx)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  useEffect(() => setSel(0), [suggest?.query])

  const insertLink = (noteId: string) => {
    if (!editor || !suggest) return
    editor
      .chain()
      .focus()
      .deleteRange({ from: suggest.from, to: suggest.to })
      .insertContent([{ type: 'noteLink', attrs: { ref: noteId, label: '' } }, { type: 'text', text: ' ' }])
      .run()
    setSuggest(null)
  }

  const hits = useMemo<Hit[]>(() => {
    if (!suggest) return []
    const q = suggest.query.trim().toLowerCase()
    const scored: { note: CampaignNote; score: number }[] = []
    for (const note of notes) {
      const score = q ? Math.max(fuzzyScore(note.title, q), fuzzyScore(note.id, q)) : 1
      if (score > 0) scored.push({ note, score })
    }
    scored.sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title))
    const out: Hit[] = scored.slice(0, 7).map(({ note }) => ({
      key: note.id,
      icon: NOTE_KINDS[note.kind]?.icon ?? '📝',
      label: note.title,
      detail: NOTE_KINDS[note.kind]?.label ?? 'Note',
      pick: () => insertLink(note.id)
    }))
    const exact = notes.some((n) => n.title.toLowerCase() === q)
    if (q && !exact) {
      out.push({
        key: '::create',
        icon: '➕',
        label: `New note “${suggest.query.trim()}”`,
        detail: 'create & link',
        pick: async () => {
          const id = await createNoteInline('note', suggest.query.trim())
          if (id) insertLink(id)
        }
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggest, notes])

  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    if (!suggest || hits.length === 0) return
    if (e.key === 'ArrowDown') {
      setSel((s) => Math.min(s + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      setSel((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      void hits[Math.min(sel, hits.length - 1)]?.pick()
    } else if (e.key === 'Escape') {
      dismissedFrom.current = suggest.from
      setSuggest(null)
    } else {
      return // let the editor have it
    }
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div className="relative" onKeyDownCapture={onKeyDownCapture}>
      {children}
      {suggest && hits.length > 0 && (
        <div
          className="fixed z-50 w-72 overflow-hidden rounded-md border border-hearth-border bg-hearth-panel2 shadow-2xl"
          style={{ left: suggest.left, top: suggest.top }}
          // Keep clicks from stealing editor focus/selection.
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="max-h-64 overflow-y-auto py-1">
            {hits.map((h, i) => (
              <button
                key={h.key}
                type="button"
                onClick={() => void h.pick()}
                onMouseEnter={() => setSel(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                  i === sel ? 'bg-hearth-ember/15 text-hearth-text' : 'text-hearth-muted'
                }`}
              >
                <span aria-hidden>{h.icon}</span>
                <span className="flex-1 truncate">{h.label}</span>
                <span className="flex-none text-[10px] uppercase tracking-wide text-hearth-muted/60">{h.detail}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-hearth-border px-3 py-1 text-[10px] text-hearth-muted/60">
            ↑↓ choose · Enter link · Esc dismiss
          </div>
        </div>
      )}
    </div>
  )
}
