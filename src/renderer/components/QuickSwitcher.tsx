import { useEffect, useMemo, useRef, useState } from 'react'
import { NOTE_KINDS, type CampaignNote, type Scene } from '../../shared/types'
import { docText } from '../../shared/scriptCompile'
import { fuzzyScore } from '../lib/fuzzy'
import { useStore } from '../store'

interface Hit {
  key: string
  icon: string
  label: string
  /** Where it lives — kind label, or the session for a scene. */
  detail: string
  /** Higher sorts first. Content-only matches score lowest. */
  score: number
  open: () => void
}

/**
 * Ctrl+K quick switcher: fuzzy-find any note or scene by title in ~3 seconds
 * mid-session; full-text matches surface as a second tier. Enter opens it.
 */
export default function QuickSwitcher() {
  const open = useStore((s) => s.switcherOpen)
  const setOpen = useStore((s) => s.setSwitcherOpen)
  const notes = useStore((s) => s.campaign.notes)
  const scenes = useStore((s) => s.campaign.scenes)
  const selectScene = useStore((s) => s.selectScene)
  const selectNote = useStore((s) => s.selectNote)
  const setLeftTab = useStore((s) => s.setLeftTab)
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setSel(0)
      // Focus after mount.
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const openScene = (scene: Scene) => {
    setOpen(false)
    setLeftTab('scenes')
    void selectScene(scene.id)
  }
  const openNote = (note: CampaignNote) => {
    setOpen(false)
    selectNote(note.id)
    // Build mode: full note page. Run mode: the right panel's Notes tab
    // auto-follows the selection, so the script stays on screen.
    if (useStore.getState().uiMode === 'build') setLeftTab('notes')
  }

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase()
    const out: Hit[] = []
    const sessionTitle = (id?: string) =>
      id ? (notes.find((n) => n.id === id)?.title ?? '') : ''

    for (const scene of scenes) {
      const score = q ? fuzzyScore(scene.name, q) : 1
      const content =
        score === 0 && q.length >= 3 && docText(scene.script).toLowerCase().includes(q)
      if (score > 0 || content) {
        out.push({
          key: `scene:${scene.id}`,
          icon: '🎬',
          label: scene.name,
          detail: sessionTitle(scene.session) || 'Scene',
          score: score || 10,
          open: () => openScene(scene)
        })
      }
    }
    for (const note of notes) {
      const score = q ? fuzzyScore(note.title, q) : 1
      const content =
        score === 0 && q.length >= 3 && docText(note.body).toLowerCase().includes(q)
      if (score > 0 || content) {
        out.push({
          key: `note:${note.id}`,
          icon: NOTE_KINDS[note.kind]?.icon ?? '📝',
          label: note.title,
          detail: NOTE_KINDS[note.kind]?.label ?? 'Note',
          score: score || 10,
          open: () => openNote(note)
        })
      }
    }
    out.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    return out.slice(0, 12)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, notes, scenes])

  useEffect(() => setSel(0), [query])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[18vh]"
      onMouseDown={() => setOpen(false)}
    >
      <div
        className="w-[34rem] max-w-[90vw] overflow-hidden rounded-lg border border-hearth-border bg-hearth-panel shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') setOpen(false)
            else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((s) => Math.min(s + 1, hits.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((s) => Math.max(s - 1, 0))
            } else if (e.key === 'Enter') {
              hits[sel]?.open()
            }
          }}
          placeholder="Find a scene, NPC, location, session…"
          className="w-full border-b border-hearth-border bg-transparent px-4 py-3 text-base text-hearth-text placeholder:text-hearth-muted/60 focus:outline-none"
        />
        <div className="max-h-80 overflow-y-auto py-1">
          {hits.length === 0 && (
            <p className="px-4 py-3 text-sm text-hearth-muted">No matches. (Titles first; 3+ letters also searches inside notes and scripts.)</p>
          )}
          {hits.map((h, i) => (
            <button
              key={h.key}
              onClick={h.open}
              onMouseEnter={() => setSel(i)}
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors ${
                i === sel ? 'bg-hearth-ember/15 text-hearth-text' : 'text-hearth-muted'
              }`}
            >
              <span aria-hidden>{h.icon}</span>
              <span className="flex-1 truncate">{h.label}</span>
              <span className="flex-none text-[11px] uppercase tracking-wide text-hearth-muted/60">
                {h.detail}
              </span>
            </button>
          ))}
        </div>
        <div className="border-t border-hearth-border px-4 py-1.5 text-[10px] text-hearth-muted/60">
          ↑↓ choose · Enter open · Esc close
        </div>
      </div>
    </div>
  )
}
