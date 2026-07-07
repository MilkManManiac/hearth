import { useEffect, useRef, useState } from 'react'
import { engine } from '../store'

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Seek bar for the current audition: drag anywhere in the track to hear the
 * middle before committing it to a scene.
 *
 * Seeking is debounced-live: while dragging, the audio jumps to the thumb
 * every ~150ms (scrub-through, without restarting the source per pixel), and
 * releasing flushes immediately. The displayed position is updated
 * optimistically on every seek so the thumb never snaps back to a stale
 * polled value — the source of the old jank.
 */
export default function PreviewScrubber({ file }: { file: string }) {
  const [prog, setProg] = useState<{ elapsed: number; duration: number } | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const dragRef = useRef<number | null>(null)
  const seekTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const tick = () => {
      // Don't fight the pointer mid-drag.
      if (dragRef.current !== null) return
      const p = engine.previewProgress()
      setProg(p && p.file === file ? { elapsed: p.elapsed, duration: p.duration } : null)
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(seekTimer.current)
    }
  }, [file])

  if (!prog) return null

  const doSeek = (v: number): void => {
    engine.seekPreview(v)
    setProg((p) => (p ? { ...p, elapsed: v } : p)) // optimistic — no snap-back
    dragRef.current = null
    setDrag(null)
  }

  const onScrub = (v: number): void => {
    dragRef.current = v
    setDrag(v)
    window.clearTimeout(seekTimer.current)
    seekTimer.current = window.setTimeout(() => doSeek(v), 150)
  }

  const flush = (): void => {
    if (dragRef.current === null) return
    window.clearTimeout(seekTimer.current)
    doSeek(dragRef.current)
  }

  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="w-8 text-right text-[10px] tabular-nums text-hearth-muted">
        {fmt(drag ?? prog.elapsed)}
      </span>
      <input
        type="range"
        min={0}
        max={prog.duration}
        step={0.1}
        value={drag ?? prog.elapsed}
        title="Scrub — hear the middle of the track before you commit it"
        onChange={(e) => onScrub(parseFloat(e.target.value))}
        onPointerUp={flush}
        onKeyUp={flush}
        onBlur={flush}
        className="h-2 min-w-0 flex-1 cursor-pointer accent-hearth-ember"
      />
      <span className="w-8 text-[10px] tabular-nums text-hearth-muted">{fmt(prog.duration)}</span>
    </div>
  )
}
