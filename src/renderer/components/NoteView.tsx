import { useEffect, useMemo, useState } from 'react'
import { NOTE_KINDS, NOTE_KIND_ORDER, type CampaignNote, type NoteKind } from '../../shared/types'
import { docLinks, docMentions, linkifyMentions } from '../../shared/scriptCompile'
import { useStore } from '../store'
import NoteEditor from './NoteEditor'
import { NoteNavButtons } from './NotePeek'

/**
 * A campaign note's page in the main area: editable title, retypeable kind
 * (moving a note between "folders" is one dropdown, never a file move),
 * thread status / session date, and the rich-text body.
 */
/** The scenes filed under this session — jump straight to one (arms it). */
function SessionScenes({ noteId }: { noteId: string }) {
  const scenes = useStore((s) => s.campaign.scenes).filter((sc) => sc.session === noteId)
  const liveSceneId = useStore((s) => s.liveSceneId)
  const selectScene = useStore((s) => s.selectScene)
  const setLeftTab = useStore((s) => s.setLeftTab)
  if (scenes.length === 0) {
    return (
      <p className="rounded border border-dashed border-hearth-border px-3 py-2 text-xs text-hearth-muted">
        No scenes filed here yet — in the 🎬 Scenes list, hover a scene and hit 📅 to assign it to
        this session.
      </p>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
        🎬 Scenes
      </span>
      {scenes.map((sc) => (
        <button
          key={sc.id}
          onClick={() => {
            setLeftTab('scenes')
            void selectScene(sc.id)
          }}
          title={`Open "${sc.name}" (silent arm — Go live starts the sound)`}
          className="flex items-center gap-1.5 rounded-full border border-hearth-border bg-hearth-panel2/60 px-2.5 py-1 text-sm text-hearth-text transition-colors hover:border-hearth-ember hover:text-hearth-ember"
        >
          {sc.id === liveSceneId && (
            <span className="inline-block h-1.5 w-1.5 animate-flicker rounded-full bg-hearth-ember" />
          )}
          {sc.name}
        </button>
      ))}
    </div>
  )
}

export default function NoteView({ note }: { note: CampaignNote }) {
  const updateNote = useStore((s) => s.updateNote)
  const deleteNote = useStore((s) => s.deleteNote)
  const selectNote = useStore((s) => s.selectNote)
  const buildMode = useStore((s) => s.uiMode === 'build')
  const [title, setTitle] = useState(note.title)
  useEffect(() => setTitle(note.title), [note.id, note.title])

  const commitTitle = () => {
    const t = title.trim()
    if (t && t !== note.title) void updateNote(note.id, (n) => ({ ...n, title: t }))
    else setTitle(note.title)
  }

  const meta = NOTE_KINDS[note.kind] ?? NOTE_KINDS.note

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <div className="flex items-center gap-3">
          <NoteNavButtons />
          <span className="text-2xl" aria-hidden title={meta.label}>
            {meta.icon}
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') {
                setTitle(note.title)
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            className="min-w-0 flex-1 bg-transparent font-display text-3xl font-semibold tracking-tight text-hearth-text focus:outline-none focus:ring-1 focus:ring-hearth-ember/50 rounded px-1 -ml-1"
            title="Note title — click to rename"
          />
        </div>
        <div className="mt-2 h-px w-full bg-gradient-to-r from-hearth-ember/50 via-hearth-border to-transparent" />

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-hearth-muted">
          <label className="flex items-center gap-1.5">
            Kind
            <select
              value={note.kind}
              onChange={(e) =>
                void updateNote(note.id, (n) => ({ ...n, kind: e.target.value as NoteKind }))
              }
              className="rounded border border-hearth-border bg-hearth-panel2 px-1.5 py-0.5 text-xs text-hearth-text"
              title="Retype the note — it moves to that group instantly"
            >
              {NOTE_KIND_ORDER.map((k) => (
                <option key={k} value={k}>
                  {NOTE_KINDS[k].icon} {NOTE_KINDS[k].label}
                </option>
              ))}
            </select>
          </label>

          {note.kind === 'session' && (
            <label className="flex items-center gap-1.5">
              Date
              <input
                type="date"
                value={note.date ?? ''}
                onChange={(e) =>
                  void updateNote(note.id, (n) => ({ ...n, date: e.target.value || undefined }))
                }
                className="rounded border border-hearth-border bg-hearth-panel2 px-1.5 py-0.5 text-xs text-hearth-text"
              />
            </label>
          )}

          {note.kind === 'thread' && (
            <button
              onClick={() =>
                void updateNote(note.id, (n) => ({
                  ...n,
                  status: n.status === 'resolved' ? 'open' : 'resolved'
                }))
              }
              className={`rounded-full border px-2 py-0.5 transition-colors ${
                note.status === 'resolved'
                  ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                  : 'border-hearth-gold/60 bg-hearth-gold/10 text-hearth-gold'
              }`}
              title="Threads: open questions & secrets. Mark resolved when it pays off at the table."
            >
              {note.status === 'resolved' ? '✓ resolved' : '● open'}
            </button>
          )}

          {buildMode && (
            <button
              onClick={() => {
                if (window.confirm(`Delete "${note.title}"? The file moves to the recycle bin.`)) {
                  void deleteNote(note.id)
                  selectNote(null)
                }
              }}
              className="ml-auto text-hearth-muted/60 transition-colors hover:text-red-400"
              title="Delete this note (file → recycle bin)"
            >
              🗑 Delete
            </button>
          )}
        </div>
      </div>

      {note.kind === 'session' && <SessionScenes noteId={note.id} />}

      <NoteEditor
        key={note.id}
        noteId={note.id}
        body={note.body ?? [{ type: 'paragraph', content: [] }]}
        onSave={(doc) => void updateNote(note.id, (n) => ({ ...n, body: doc, bodyText: undefined }))}
      />

      <Backlinks noteId={note.id} title={note.title} />
    </div>
  )
}

/**
 * Everything that [[links]] to this note — notes AND scene scripts — plus
 * "unlinked mentions": places whose prose says this note's title without a
 * link yet, each with a one-click 🔗 that linkifies every mention in place.
 */
function Backlinks({ noteId, title }: { noteId: string; title: string }) {
  const notes = useStore((s) => s.campaign.notes)
  const scenes = useStore((s) => s.campaign.scenes)
  const selectNote = useStore((s) => s.selectNote)
  const selectScene = useStore((s) => s.selectScene)
  const setLeftTab = useStore((s) => s.setLeftTab)
  const updateNote = useStore((s) => s.updateNote)
  const updateScene = useStore((s) => s.updateScene)
  const pushToast = useStore((s) => s.pushToast)

  const { linked, mentions } = useMemo(() => {
    const linked: { key: string; icon: string; title: string; open: () => void }[] = []
    const mentions: { key: string; icon: string; title: string; open: () => void; link: () => void }[] = []
    for (const n of notes) {
      if (n.id === noteId) continue
      const open = () => selectNote(n.id)
      const icon = NOTE_KINDS[n.kind]?.icon ?? '📝'
      if (docLinks(n.body).includes(noteId)) {
        linked.push({ key: `note:${n.id}`, icon, title: n.title, open })
      } else if (docMentions(n.body, title)) {
        mentions.push({
          key: `note:${n.id}`,
          icon,
          title: n.title,
          open,
          link: () => {
            void updateNote(n.id, (src) => {
              const res = linkifyMentions(src.body ?? [], title, noteId)
              pushToast(`Linked ${res.count} mention${res.count === 1 ? '' : 's'} in "${src.title}"`, 'info')
              return { ...src, body: res.doc, bodyText: undefined }
            })
          }
        })
      }
    }
    for (const sc of scenes) {
      const open = () => {
        setLeftTab('scenes')
        void selectScene(sc.id)
      }
      if (docLinks(sc.script).includes(noteId)) {
        linked.push({ key: `scene:${sc.id}`, icon: '🎬', title: sc.name, open })
      } else if (docMentions(sc.script, title)) {
        mentions.push({
          key: `scene:${sc.id}`,
          icon: '🎬',
          title: sc.name,
          open,
          link: () => {
            void updateScene(sc.id, (src) => {
              const res = linkifyMentions(src.script ?? [], title, noteId)
              pushToast(`Linked ${res.count} mention${res.count === 1 ? '' : 's'} in "${src.name}"`, 'info')
              return { ...src, script: res.doc }
            })
          }
        })
      }
    }
    return { linked, mentions }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, title, notes, scenes])

  if (linked.length === 0 && mentions.length === 0) return null

  return (
    <div className="space-y-3 border-t border-hearth-border pt-3">
      {linked.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
            ⤷ Linked from {linked.length} {linked.length === 1 ? 'place' : 'places'}
          </div>
          <div className="flex flex-wrap gap-2">
            {linked.map((s) => (
              <button
                key={s.key}
                onClick={s.open}
                className="flex items-center gap-1.5 rounded-full border border-hearth-border bg-hearth-panel2/60 px-2.5 py-1 text-sm text-hearth-muted transition-colors hover:border-hearth-gold hover:text-hearth-gold"
              >
                <span aria-hidden className="text-xs">
                  {s.icon}
                </span>
                {s.title}
              </button>
            ))}
          </div>
        </div>
      )}
      {mentions.length > 0 && (
        <div>
          <div
            className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted"
            title={`Prose that says “${title}” without a [[link]] yet`}
          >
            💬 Unlinked mentions ({mentions.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {mentions.map((s) => (
              <span
                key={s.key}
                className="flex items-center gap-1 rounded-full border border-dashed border-hearth-border bg-hearth-panel2/40 py-1 pl-2.5 pr-1 text-sm text-hearth-muted"
              >
                <button onClick={s.open} className="flex items-center gap-1.5 transition-colors hover:text-hearth-text">
                  <span aria-hidden className="text-xs">
                    {s.icon}
                  </span>
                  {s.title}
                </button>
                <button
                  onClick={s.link}
                  title={`Turn every “${title}” in this ${s.key.startsWith('scene') ? 'scene' : 'note'} into a link`}
                  className="rounded-full px-1.5 text-xs text-hearth-gold transition-colors hover:bg-hearth-gold/15"
                >
                  🔗 link
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
