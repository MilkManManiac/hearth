import { useState } from 'react'
import { NOTE_KINDS, NOTE_KIND_ORDER } from '../../shared/types'
import { useStore } from '../store'

/** Scenes ⇄ Notes toggle shared by both left-rail headers. */
export function LeftTabSwitch() {
  const leftTab = useStore((s) => s.leftTab)
  const setLeftTab = useStore((s) => s.setLeftTab)
  return (
    <span className="flex items-center gap-1">
      {(['scenes', 'notes'] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => setLeftTab(tab)}
          className={`rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
            leftTab === tab
              ? 'bg-hearth-ember/20 text-hearth-ember'
              : 'text-hearth-muted hover:text-hearth-text'
          }`}
        >
          {tab === 'scenes' ? '🎬 Scenes' : '📓 Notes'}
        </button>
      ))}
    </span>
  )
}

/**
 * Campaign notes browser: the left rail's Notes tab. Flat notes grouped by
 * kind (sessions, NPCs, locations…) — grouping comes from the `kind` field,
 * not folders, so nothing is ever trapped in one bucket. See NOTES-PLAN.md.
 */
export default function NotesRail({ onCollapse }: { onCollapse?: () => void }) {
  const notes = useStore((s) => s.campaign.notes)
  const currentNoteId = useStore((s) => s.currentNoteId)
  const selectNote = useStore((s) => s.selectNote)
  const createNote = useStore((s) => s.createNote)
  const buildMode = useStore((s) => s.uiMode === 'build')
  const [pickingKind, setPickingKind] = useState(false)

  const groups = NOTE_KIND_ORDER.map((kind) => ({
    kind,
    meta: NOTE_KINDS[kind],
    items: notes.filter((n) => n.kind === kind)
  })).filter((g) => g.items.length > 0)

  return (
    <aside className="flex w-60 flex-col border-r border-hearth-border bg-hearth-panel">
      <div className="flex items-center px-3 py-2">
        <LeftTabSwitch />
        {onCollapse && (
          <button
            onClick={onCollapse}
            title="Collapse this panel"
            className="ml-auto px-1 text-hearth-muted transition-colors hover:text-hearth-ember"
          >
            ◂
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {notes.length === 0 && (
          <p className="px-3 py-2 text-xs text-hearth-muted">
            Your campaign's knowledge base: sessions, NPCs, locations, plot threads. Everything
            searchable, nothing lost in folders. Start with <b>+ New note</b> below.
          </p>
        )}
        {groups.map(({ kind, meta, items }) => (
          <div key={kind} className="mb-1">
            <div className="flex items-center gap-1.5 px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
              <span aria-hidden>{meta.icon}</span>
              {meta.plural}
              <span className="text-hearth-muted/60">{items.length}</span>
            </div>
            {items.map((note) => {
              const active = note.id === currentNoteId
              const resolved = note.kind === 'thread' && note.status === 'resolved'
              return (
                <button
                  key={note.id}
                  onClick={() => selectNote(note.id)}
                  className={`block w-full truncate px-3 py-1 text-left text-sm transition-colors ${
                    active
                      ? 'bg-hearth-ember/15 text-hearth-ember'
                      : 'text-hearth-text hover:bg-hearth-panel2'
                  } ${resolved ? 'line-through opacity-60' : ''}`}
                  title={resolved ? `${note.title} (resolved)` : note.title}
                >
                  {note.title}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {buildMode && (
        <div className="border-t border-hearth-border p-2">
          {pickingKind ? (
            <div className="grid grid-cols-2 gap-1">
              {NOTE_KIND_ORDER.map((kind) => (
                <button
                  key={kind}
                  onClick={() => {
                    setPickingKind(false)
                    void createNote(kind, `New ${NOTE_KINDS[kind].label}`)
                  }}
                  className="flex items-center gap-1.5 rounded border border-hearth-border bg-hearth-panel2 px-2 py-1 text-xs text-hearth-text hover:border-hearth-ember hover:text-hearth-ember"
                >
                  <span aria-hidden>{NOTE_KINDS[kind].icon}</span>
                  {NOTE_KINDS[kind].label}
                </button>
              ))}
              <button
                onClick={() => setPickingKind(false)}
                className="col-span-2 rounded px-2 py-1 text-xs text-hearth-muted hover:text-hearth-text"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setPickingKind(true)}
              className="w-full rounded border border-dashed border-hearth-border px-2 py-1.5 text-xs text-hearth-muted transition-colors hover:border-hearth-ember hover:text-hearth-ember"
            >
              + New note
            </button>
          )}
        </div>
      )}
    </aside>
  )
}

