import { NOTE_KINDS } from '../../shared/types'
import { useStore } from '../store'

/**
 * Navigate to a linked note: select it (the run-mode right panel auto-follows);
 * in build mode also flip the left rail to Notes so the full page opens.
 */
export function openNoteLink(ref: string): void {
  const st = useStore.getState()
  const exists = st.campaign.notes.some((n) => n.id === ref)
  if (!exists) {
    st.pushToast(`No note "${ref}" yet — create it from the Notes rail or type [[${ref}]] in an editor.`, 'info')
    return
  }
  st.selectNote(ref)
  if (st.uiMode === 'build') st.setLeftTab('notes')
}

/**
 * The rendered face of a [[wiki-link]]: kind icon + the target's live title
 * (label override wins). Unresolved refs render dashed — the note doesn't
 * exist (yet); the ref text still shows so nothing is lost.
 */
export default function NoteLinkPill({
  refId,
  label,
  onNavigate
}: {
  refId: string
  label?: string
  /** Called instead of the default navigation (e.g. editors gate on Ctrl). */
  onNavigate?: () => void
}) {
  const note = useStore((s) => s.campaign.notes.find((n) => n.id === refId))
  const display = label || note?.title || refId
  const icon = note ? (NOTE_KINDS[note.kind]?.icon ?? '📝') : undefined
  return (
    <button
      type="button"
      onClick={() => (onNavigate ? onNavigate() : openNoteLink(refId))}
      title={note ? `Open "${note.title}"` : `No note "${refId}" exists yet`}
      className={
        note
          ? 'mx-px inline-flex items-baseline gap-1 rounded px-0.5 align-baseline text-hearth-gold underline decoration-hearth-gold/40 decoration-dotted underline-offset-2 transition-colors hover:bg-hearth-gold/10 hover:decoration-hearth-gold'
          : 'mx-px inline-flex items-baseline gap-1 rounded border border-dashed border-hearth-border px-1 align-baseline text-hearth-muted transition-colors hover:border-hearth-muted'
      }
    >
      {icon && (
        <span aria-hidden className="text-[0.85em]">
          {icon}
        </span>
      )}
      {display}
    </button>
  )
}
