import { NOTE_KINDS } from '../../shared/types'
import { openNoteLink } from '../lib/noteNav'
import { useStore } from '../store'
import { useNotePeek } from './NotePeek'

/**
 * The rendered face of a [[wiki-link]]: kind icon + the target's live title
 * (label override wins). Hovering ~400ms peeks the note in a card; click
 * navigates (with back/forward history). An unresolved ref renders dashed and
 * clicking it CREATES the note — a link is never a dead end.
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
  const peek = useNotePeek(refId)
  const display = label || note?.title || refId
  const icon = note ? (NOTE_KINDS[note.kind]?.icon ?? '📝') : undefined
  return (
    <>
      <button
        type="button"
        onClick={() => (onNavigate ? onNavigate() : void openNoteLink(refId))}
        onMouseEnter={peek.onMouseEnter}
        onMouseLeave={peek.onMouseLeave}
        title={
          note
            ? `Open "${note.title}" — Alt+← comes back`
            : `No note "${refId}" yet — click to create it`
        }
        className={
          note
            ? 'mx-px inline-flex items-baseline gap-1 rounded px-0.5 align-baseline text-hearth-gold underline decoration-hearth-gold/40 decoration-dotted underline-offset-2 transition-colors hover:bg-hearth-gold/10 hover:decoration-hearth-gold'
            : 'mx-px inline-flex items-baseline gap-1 rounded border border-dashed border-hearth-border px-1 align-baseline text-hearth-muted transition-colors hover:border-hearth-gold hover:text-hearth-gold'
        }
      >
        {icon && (
          <span aria-hidden className="text-[0.85em]">
            {icon}
          </span>
        )}
        {display}
      </button>
      {peek.card}
    </>
  )
}
