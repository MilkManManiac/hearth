import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import type { CueKind, LibraryAsset } from '../../shared/types'
import { CUE_BADGE_CLASS, CUE_CHIP_CLASS, CUE_TEXT, fileStem, libSlug } from '../lib/cueMeta'
import { fuzzyScore } from '../lib/fuzzy'
import { useStore } from '../store'

/** Registration payload — mirrors ScriptEditor's EnsureAsset entry. */
export interface CuePick {
  kind: 'music' | 'sfx' | 'ambience'
  id: string
  label: string
  file: string
}

interface SuggestState {
  /** Doc position of the `/`. */
  from: number
  to: number
  query: string
  left: number
  top: number
}

const KIND_TO_CUE: Record<CuePick['kind'], CueKind> = { music: 'music', sfx: 'sfx', ambience: 'amb' }

/**
 * The one "add sound" flow (audit P2): typing `/tense` in the read-aloud
 * editor opens a fuzzy palette over the whole library — ▶ auditions, Enter
 * inserts the cue chip AND registers the asset onto the scene. Built on the
 * LinkSuggest pattern (capture-phase keydown wrapper wins over ProseMirror).
 * The `/` must start a word (start of block or after whitespace) so prose
 * like "and/or" never triggers it; query needs 2+ chars before results show.
 */
export default function CueSuggest({
  editor,
  onPick,
  children
}: {
  editor: Editor | null
  /** Register the asset onto the scene (the editor's ensure-asset hook). */
  onPick: (entry: CuePick) => void
  children: ReactNode
}) {
  const assets = useStore((s) => s.campaign.library.assets)
  const previewAsset = useStore((s) => s.previewAsset)
  const previewingFile = useStore((s) => s.previewingFile)
  const [suggest, setSuggest] = useState<SuggestState | null>(null)
  const [sel, setSel] = useState(0)

  const detect = (ed: Editor): SuggestState | null => {
    const { state } = ed
    const { $from, empty } = state.selection
    if (!empty || !$from.parent.isTextblock) return null
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
    const m = /(?:^|\s)\/([a-zA-Z0-9][a-zA-Z0-9 -]*)$/.exec(before)
    if (!m) return null
    const q = m[1]
    if (q.trim().length < 2) return null
    const from = $from.pos - (q.length + 1) // include the '/'
    let coords: { left: number; bottom: number }
    try {
      coords = ed.view.coordsAtPos($from.pos)
    } catch {
      return null
    }
    return {
      from,
      to: $from.pos,
      query: q,
      left: Math.min(coords.left, window.innerWidth - 340),
      top: coords.bottom + 4
    }
  }

  useEffect(() => {
    if (!editor) return
    const onTx = () => setSuggest(detect(editor))
    editor.on('transaction', onTx)
    editor.on('blur', onTx)
    return () => {
      editor.off('transaction', onTx)
      editor.off('blur', onTx)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  useEffect(() => setSel(0), [suggest?.query])

  const hits = useMemo<LibraryAsset[]>(() => {
    if (!suggest) return []
    const q = suggest.query.trim().toLowerCase()
    return assets
      .filter((a) => !a.trash && (a.kind === 'music' || a.kind === 'sfx' || a.kind === 'ambience'))
      .map((a) => {
        const name = a.name ?? fileStem(a.file)
        let score = fuzzyScore(name, q) * 3
        for (const mood of a.moods ?? []) score = Math.max(score, fuzzyScore(mood, q) * 2.5)
        for (const cat of a.categories ?? []) score = Math.max(score, fuzzyScore(cat, q) * 2)
        for (const tag of a.tags ?? []) score = Math.max(score, fuzzyScore(tag, q) * 1.5)
        if (a.heard) score += 5 // sounds Wes has vetted rank above the pile
        return { a, score }
      })
      .filter((x) => x.score > 5)
      .sort((x, y) => y.score - x.score)
      .slice(0, 8)
      .map((x) => x.a)
  }, [suggest, assets])

  const insert = (asset: LibraryAsset) => {
    if (!editor || !suggest) return
    const display = asset.name ?? fileStem(asset.file)
    const kind = asset.kind as CuePick['kind']
    const cueKind = KIND_TO_CUE[kind]
    const ref = kind === 'ambience' ? asset.file : libSlug(asset.file)
    onPick({ kind, id: ref, label: display, file: asset.file })
    editor
      .chain()
      .focus()
      .deleteRange({ from: suggest.from, to: suggest.to })
      .insertContent([
        { type: 'cue', attrs: { kind: cueKind, ref, label: display } },
        { type: 'text', text: ' ' }
      ])
      .run()
    setSuggest(null)
  }

  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    if (!suggest || hits.length === 0) return
    if (e.key === 'ArrowDown') {
      setSel((s) => Math.min(s + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      setSel((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      const hit = hits[Math.min(sel, hits.length - 1)]
      if (hit) insert(hit)
    } else if (e.key === 'Escape') {
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
          className="fixed z-50 w-80 overflow-hidden rounded-md border border-hearth-border bg-hearth-panel2 shadow-2xl"
          style={{ left: suggest.left, top: suggest.top }}
          // Keep clicks from stealing editor focus/selection.
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="max-h-64 overflow-y-auto py-1">
            {hits.map((a, i) => {
              const cueKind = KIND_TO_CUE[a.kind as CuePick['kind']]
              return (
                <div
                  key={a.file}
                  onMouseEnter={() => setSel(i)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                    i === sel ? 'bg-hearth-ember/15 text-hearth-text' : 'text-hearth-muted'
                  }`}
                >
                  <span aria-hidden className={`${CUE_BADGE_CLASS} ${CUE_CHIP_CLASS[cueKind]} flex-none border-0`}>
                    {CUE_TEXT[cueKind]}
                  </span>
                  <button type="button" onClick={() => insert(a)} className="min-w-0 flex-1 truncate text-left">
                    {a.name ?? fileStem(a.file)}
                  </button>
                  <button
                    type="button"
                    onClick={() => void previewAsset(a.file)}
                    title={previewingFile === a.file ? 'Stop preview' : 'Preview'}
                    className={`flex-none px-1 ${
                      previewingFile === a.file ? 'text-hearth-ember' : 'text-hearth-muted/60 hover:text-hearth-ember'
                    }`}
                  >
                    {previewingFile === a.file ? '⏹' : '▶'}
                  </button>
                </div>
              )
            })}
          </div>
          <div className="border-t border-hearth-border px-3 py-1 text-[10px] text-hearth-muted/60">
            ↑↓ choose · ▶ listen · Enter places the cue & adds it to the scene · Esc dismiss
          </div>
        </div>
      )}
    </div>
  )
}
