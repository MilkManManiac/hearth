import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NOTE_KINDS } from '../../shared/types'
import { placeCard, type CardPlacement } from '../lib/floatPlacement'
import { openNoteLink } from '../lib/noteNav'
import { useStore } from '../store'
import NoteBody from './NoteBody'

const CARD_W = 340
const CARD_H = 320
const OPEN_DELAY_MS = 400 // intent delay (Wikipedia uses 650; our notes are sparser + lookups urgent)
const CLOSE_GRACE_MS = 300 // time to travel from link into the card

type PeekPos = CardPlacement

/**
 * Hover-peek for note links (the Wikipedia/Obsidian page-preview pattern):
 * rest on a link ~400ms and a scrollable preview card appears — read without
 * losing your place; "Open" (or clicking through) commits to navigation.
 * Attach `onMouseEnter`/`onMouseLeave` to the link and render `card` after it.
 */
export function useNotePeek(refId: string) {
  const [pos, setPos] = useState<PeekPos | null>(null)
  const openT = useRef<number | undefined>(undefined)
  const closeT = useRef<number | undefined>(undefined)

  useEffect(() => {
    return () => {
      window.clearTimeout(openT.current)
      window.clearTimeout(closeT.current)
    }
  }, [])

  const onMouseEnter = (e: React.MouseEvent) => {
    const el = e.currentTarget as HTMLElement
    window.clearTimeout(closeT.current)
    window.clearTimeout(openT.current)
    openT.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect()
      // Dock-aware placement: never open into (or under) the sound console.
      setPos(placeCard(r, CARD_W, CARD_H))
    }, OPEN_DELAY_MS)
  }

  const onMouseLeave = () => {
    window.clearTimeout(openT.current)
    closeT.current = window.setTimeout(() => setPos(null), CLOSE_GRACE_MS)
  }

  // Portal: the card must never live inside the link's own DOM — links render
  // inside <p> tags and ProseMirror inline nodes, where a <div> is invalid.
  const card = pos
    ? createPortal(
        <PeekCard
          refId={refId}
          pos={pos}
          onEnter={() => window.clearTimeout(closeT.current)}
          onLeave={onMouseLeave}
          onClose={() => setPos(null)}
        />,
        document.body
      )
    : null

  return { onMouseEnter, onMouseLeave, card }
}

/**
 * Browser-style back/forward for note navigation (Alt+←/→, mouse 4/5).
 * `always` renders them disabled even with no history — on the note page they
 * must be visible from the first visit or nobody learns they exist.
 */
export function NoteNavButtons({ always = false }: { always?: boolean }) {
  const canBack = useStore((s) => s.noteBack.length > 0)
  const canForward = useStore((s) => s.noteForward.length > 0)
  const goNoteBack = useStore((s) => s.goNoteBack)
  const goNoteForward = useStore((s) => s.goNoteForward)
  if (!always && !canBack && !canForward) return null
  return (
    <span className="flex items-center gap-0.5">
      <button
        onClick={goNoteBack}
        disabled={!canBack}
        title="Back to the previous note (Alt+←)"
        className="rounded border border-hearth-border px-1.5 py-0.5 text-xs text-hearth-muted transition-colors hover:border-hearth-gold hover:text-hearth-gold disabled:opacity-30 disabled:hover:border-hearth-border disabled:hover:text-hearth-muted"
      >
        ←
      </button>
      <button
        onClick={goNoteForward}
        disabled={!canForward}
        title="Forward (Alt+→)"
        className="rounded border border-hearth-border px-1.5 py-0.5 text-xs text-hearth-muted transition-colors hover:border-hearth-gold hover:text-hearth-gold disabled:opacity-30 disabled:hover:border-hearth-border disabled:hover:text-hearth-muted"
      >
        →
      </button>
    </span>
  )
}

function PeekCard({
  refId,
  pos,
  onEnter,
  onLeave,
  onClose
}: {
  refId: string
  pos: PeekPos
  onEnter: () => void
  onLeave: () => void
  onClose: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const note = useStore((s) => s.campaign.notes.find((n) => n.id === refId))
  const pinPeek = useStore((s) => s.pinPeek)
  if (!note) return null
  const meta = NOTE_KINDS[note.kind] ?? NOTE_KINDS.note
  return (
    <div
      ref={rootRef}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="fixed z-50 flex flex-col overflow-hidden rounded-lg border border-hearth-border bg-hearth-panel shadow-2xl"
      style={{
        left: pos.left,
        top: pos.top,
        width: CARD_W,
        maxHeight: pos.maxHeight,
        transform: pos.above ? 'translateY(-100%)' : undefined
      }}
    >
      <div className="flex flex-none items-center gap-2 border-b border-hearth-border bg-hearth-panel2/60 px-3 py-1.5">
        <span aria-hidden className="text-sm">
          {meta.icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-hearth-text">{note.title}</span>
        <button
          onClick={() => {
            // Freeze the card where it currently sits — the pin should not jump.
            const r = rootRef.current?.getBoundingClientRect()
            pinPeek(refId, r?.left ?? pos.left, r?.top ?? pos.top)
            onClose()
          }}
          className="flex-none rounded border border-hearth-border px-1.5 py-0.5 text-[10px] text-hearth-muted transition-colors hover:border-hearth-gold hover:text-hearth-gold"
          title="Pin this card — it stays put (and draggable) while you keep working"
        >
          📌 Pin
        </button>
        <button
          onClick={() => {
            onClose()
            void openNoteLink(refId)
          }}
          className="flex-none rounded border border-hearth-border px-1.5 py-0.5 text-[10px] text-hearth-muted transition-colors hover:border-hearth-gold hover:text-hearth-gold"
          title="Open the full note"
        >
          Open →
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <NoteBody doc={note.body ?? []} />
      </div>
    </div>
  )
}

/**
 * The pinned-card layer: hover peeks promoted via 📌 render here as
 * persistent draggable cards (drag by the header). Rendered ONCE at the board
 * root — cards are position:fixed so they float over everything but modals.
 */
export function PinnedPeeks() {
  const pinned = useStore((s) => s.pinnedPeeks)
  if (pinned.length === 0) return null
  return (
    <>
      {pinned.map((p) => (
        <PinnedCard key={p.refId} refId={p.refId} x={p.x} y={p.y} />
      ))}
    </>
  )
}

function PinnedCard({ refId, x, y }: { refId: string; x: number; y: number }) {
  const note = useStore((s) => s.campaign.notes.find((n) => n.id === refId))
  const unpinPeek = useStore((s) => s.unpinPeek)
  const movePinnedPeek = useStore((s) => s.movePinnedPeek)
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  // The note was deleted out from under the pin — let the card go with it.
  useEffect(() => {
    if (!note) unpinPeek(refId)
  }, [note, refId, unpinPeek])
  if (!note) return null
  const meta = NOTE_KINDS[note.kind] ?? NOTE_KINDS.note

  const onPointerDown = (e: React.PointerEvent) => {
    // Header is the drag handle; buttons inside it still click normally.
    if ((e.target as HTMLElement).closest('button')) return
    drag.current = { dx: e.clientX - x, dy: e.clientY - y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const nx = Math.min(Math.max(0, e.clientX - drag.current.dx), window.innerWidth - 60)
    const ny = Math.min(Math.max(0, e.clientY - drag.current.dy), window.innerHeight - 40)
    movePinnedPeek(refId, nx, ny)
  }
  const onPointerUp = () => {
    drag.current = null
  }

  return (
    <div
      className="fixed z-40 flex flex-col overflow-hidden rounded-lg border border-hearth-gold/50 bg-hearth-panel shadow-2xl"
      style={{ left: x, top: y, width: CARD_W, maxHeight: CARD_H }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex flex-none cursor-grab select-none items-center gap-2 border-b border-hearth-border bg-hearth-panel2/60 px-3 py-1.5 active:cursor-grabbing"
        title="Drag to move"
      >
        <span aria-hidden className="text-sm">
          {meta.icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-hearth-text">{note.title}</span>
        <button
          onClick={() => {
            unpinPeek(refId)
            void openNoteLink(refId)
          }}
          className="flex-none rounded border border-hearth-border px-1.5 py-0.5 text-[10px] text-hearth-muted transition-colors hover:border-hearth-gold hover:text-hearth-gold"
          title="Open the full note"
        >
          Open →
        </button>
        <button
          onClick={() => unpinPeek(refId)}
          className="flex-none rounded border border-hearth-border px-1.5 py-0.5 text-[10px] text-hearth-muted transition-colors hover:border-hearth-ember hover:text-hearth-ember"
          title="Unpin — close this card"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <NoteBody doc={note.body ?? []} />
      </div>
    </div>
  )
}
