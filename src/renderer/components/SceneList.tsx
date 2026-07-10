import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import DangerButton from './DangerButton'
import { LeftTabSwitch } from './NotesRail'

/** Built-in starting points; ids must match SCENE_TEMPLATES in main/campaign.ts. */
const TEMPLATES = [
  { id: 'blank', icon: '📄', label: 'Blank' },
  { id: 'tavern', icon: '🍺', label: 'Tavern' },
  { id: 'combat', icon: '⚔️', label: 'Combat' },
  { id: 'dungeon', icon: '🕯️', label: 'Dungeon Crawl' }
]

export default function SceneList({ onCollapse }: { onCollapse?: () => void }) {
  const {
    campaign,
    currentSceneId,
    liveSceneId,
    selectScene,
    goLive,
    duplicateScene,
    deleteScene,
    renameScene,
    createScene,
    updateScene,
    selectNote,
    setLeftTab
  } = useStore()
  const buildMode = useStore((s) => s.uiMode === 'build')
  const [picking, setPicking] = useState(false)
  // Inline rename state: which scene row is an input, and its draft text.
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // Which scene row has the session-assign popover open.
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const renameRef = useRef<HTMLInputElement>(null)

  // Sessions group the scene list (Scene.session → a kind:"session" note).
  // Newest session first; scenes without one land in Unfiled at the bottom.
  const sessionNotes = campaign.notes
    .filter((n) => n.kind === 'session')
    .sort(
      (a, b) =>
        (b.date ?? b.createdAt ?? '').localeCompare(a.date ?? a.createdAt ?? '') ||
        a.title.localeCompare(b.title)
    )
  const groups = sessionNotes
    .map((sn) => ({
      id: sn.id as string | null,
      title: sn.title,
      items: campaign.scenes.filter((s) => s.session === sn.id)
    }))
    .filter((g) => g.items.length > 0)
  const filed = new Set(groups.flatMap((g) => g.items.map((s) => s.id)))
  const unfiled = campaign.scenes.filter((s) => !filed.has(s.id))
  if (unfiled.length > 0) {
    groups.push({ id: null, title: groups.length > 0 ? 'Unfiled' : '', items: unfiled })
  }

  const assignSession = (sceneId: string, sessionId: string | undefined): void => {
    setAssigningId(null)
    void updateScene(sceneId, (s) => ({ ...s, session: sessionId }))
  }

  useEffect(() => {
    if (renamingId) renameRef.current?.select()
  }, [renamingId])

  const commitRename = (): void => {
    if (renamingId && draft.trim()) renameScene(renamingId, draft)
    setRenamingId(null)
  }

  return (
    <aside className="flex w-60 flex-col border-r border-hearth-border bg-hearth-panel">
      <div className="flex items-center px-3 py-2 text-xs font-semibold uppercase tracking-wider text-hearth-muted">
        <LeftTabSwitch />
        <span className="ml-1 text-hearth-muted/60">{campaign.scenes.length}</span>
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
        {campaign.scenes.length === 0 && (
          <p className="px-3 py-2 text-xs text-hearth-muted">
            No scenes yet. Add JSON files to the <code>scenes/</code> folder — they appear here
            automatically.
          </p>
        )}
        {groups.map((group) => (
          <div key={group.id ?? 'unfiled'}>
            {group.title && (
              <button
                onClick={() => {
                  // A session header opens its session note (prep lives there).
                  if (group.id) {
                    selectNote(group.id)
                    setLeftTab('notes')
                  }
                }}
                disabled={!group.id}
                title={group.id ? `Open the "${group.title}" session note` : undefined}
                className={`flex w-full items-center gap-1.5 px-3 pb-0.5 pt-2 text-left text-[10px] font-semibold uppercase tracking-wider text-hearth-muted ${
                  group.id ? 'hover:text-hearth-ember' : ''
                }`}
              >
                {group.id && <span aria-hidden>📅</span>}
                {group.title}
                <span className="text-hearth-muted/60">{group.items.length}</span>
              </button>
            )}
            {group.items.map((scene) => {
          const active = scene.id === currentSceneId
          const live = scene.id === liveSceneId
          const renaming = scene.id === renamingId
          return (
            <div key={scene.id}>
            {/* div, not button: the row holds nested action buttons. */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => !renaming && selectScene(scene.id)}
              onDoubleClick={async () => {
                if (renaming) return
                await selectScene(scene.id)
                goLive()
              }}
              onKeyDown={(e) => e.key === 'Enter' && !renaming && selectScene(scene.id)}
              title={renaming ? undefined : 'Click to open (silent) · double-click to go live'}
              className={`group flex w-full cursor-pointer items-center border-l-2 px-3 py-2 text-left text-sm transition-colors ${
                active
                  ? 'border-hearth-ember bg-gradient-to-r from-hearth-ember/15 to-transparent font-medium text-hearth-text shadow-[inset_2px_0_10px_-4px_rgba(224,138,60,0.6)]'
                  : 'border-transparent text-hearth-muted hover:bg-hearth-panel2/50 hover:text-hearth-text'
              }`}
            >
              {live && (
                <span
                  className="mr-1.5 inline-block h-1.5 w-1.5 flex-none animate-flicker rounded-full bg-hearth-ember"
                  title="This scene's atmosphere is playing"
                />
              )}
              {renaming ? (
                <input
                  ref={renameRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  className="w-full rounded border border-hearth-ember bg-hearth-bg px-1 py-0.5 text-sm text-hearth-text focus:outline-none"
                />
              ) : (
                <span className="flex-1 truncate">{scene.name}</span>
              )}
              {!renaming && buildMode && (
                <span className="ml-1 flex flex-none items-center opacity-40 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDraft(scene.name)
                      setRenamingId(scene.id)
                    }}
                    title={`Rename "${scene.name}"`}
                    className="rounded px-1 text-xs text-hearth-muted hover:text-hearth-ember"
                  >
                    ✎
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      duplicateScene(scene.id)
                    }}
                    title={`Duplicate "${scene.name}"`}
                    className="rounded px-1 text-xs text-hearth-muted hover:text-hearth-ember"
                  >
                    ⧉
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setAssigningId(assigningId === scene.id ? null : scene.id)
                    }}
                    title="Assign to a session"
                    className="rounded px-1 text-xs text-hearth-muted hover:text-hearth-ember"
                  >
                    📅
                  </button>
                  <DangerButton
                    onConfirm={() => deleteScene(scene.id)}
                    title={`Delete "${scene.name}" (moves to recycle bin)`}
                    className="rounded border border-transparent px-1 text-xs text-hearth-muted hover:text-red-400"
                    armedLabel="🗑?"
                  >
                    🗑
                  </DangerButton>
                </span>
              )}
            </div>
            {/* Session-assign popover: file the scene under a session note. */}
            {assigningId === scene.id && (
              <div className="mx-3 mb-1 overflow-hidden rounded-md border border-hearth-border bg-hearth-panel2 text-xs">
                {sessionNotes.length === 0 && (
                  <p className="px-2.5 py-1.5 text-hearth-muted">
                    No session notes yet — create one under 📓 Notes → + New note → Session.
                  </p>
                )}
                {sessionNotes.map((sn) => (
                  <button
                    key={sn.id}
                    onClick={() => assignSession(scene.id, sn.id)}
                    className={`block w-full px-2.5 py-1.5 text-left transition-colors hover:bg-hearth-ember/10 ${
                      scene.session === sn.id ? 'text-hearth-ember' : 'text-hearth-text'
                    }`}
                  >
                    📅 {sn.title}
                  </button>
                ))}
                {scene.session && (
                  <button
                    onClick={() => assignSession(scene.id, undefined)}
                    className="block w-full border-t border-hearth-border px-2.5 py-1.5 text-left text-hearth-muted transition-colors hover:bg-hearth-ember/10"
                  >
                    ✕ Unfile
                  </button>
                )}
              </div>
            )}
            </div>
          )
        })}
          </div>
        ))}
      </div>
      {buildMode && (
      <div className="border-t border-hearth-border p-2">
        {picking && (
          <div className="mb-2 overflow-hidden rounded-md border border-hearth-border bg-hearth-panel2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setPicking(false)
                  createScene(t.id)
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-hearth-muted transition-colors hover:bg-hearth-ember/10 hover:text-hearth-text"
              >
                <span className="mr-2" aria-hidden>
                  {t.icon}
                </span>
                {t.label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setPicking((p) => !p)}
          className="w-full rounded-md border border-dashed border-hearth-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-hearth-muted transition-colors hover:border-hearth-ember/50 hover:text-hearth-text"
        >
          + New Scene
        </button>
      </div>
      )}
      {campaign.errors.length > 0 && (
        <div className="border-t border-hearth-border px-3 py-2 text-[11px] text-red-400">
          <div className="mb-1 font-semibold">Load errors</div>
          {campaign.errors.map((e, i) => (
            <div key={i} className="truncate" title={e}>
              {e}
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
