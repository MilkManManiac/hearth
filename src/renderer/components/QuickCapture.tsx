import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

/**
 * Ctrl+J quick capture: one keystroke, type the thing that just became canon
 * ("promised Tobble 12gp", "improvised NPC: Marla the ferrywoman"), Enter —
 * a timestamped line lands in the active session note. You never leave the
 * script. Esc abandons.
 */
export default function QuickCapture() {
  const open = useStore((s) => s.captureOpen)
  const setOpen = useStore((s) => s.setCaptureOpen)
  const captureToSession = useStore((s) => s.captureToSession)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setText('')
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  if (!open) return null

  const submit = () => {
    const t = text.trim()
    setOpen(false)
    if (t) void captureToSession(t)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[24vh]"
      onMouseDown={() => setOpen(false)}
    >
      <div
        className="w-[30rem] max-w-[90vw] overflow-hidden rounded-lg border border-hearth-gold/50 bg-hearth-panel shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-hearth-gold">
          ✎ Log it — lands in the session note
        </div>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') setOpen(false)
            else if (e.key === 'Enter') submit()
          }}
          placeholder="e.g. promised Tobble we'd cover his 12gp debt"
          className="w-full bg-transparent px-4 py-3 text-base text-hearth-text placeholder:text-hearth-muted/50 focus:outline-none"
        />
        <div className="border-t border-hearth-border px-4 py-1.5 text-[10px] text-hearth-muted/60">
          Enter save · Esc cancel
        </div>
      </div>
    </div>
  )
}
