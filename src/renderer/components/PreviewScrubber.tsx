import { useEffect, useState } from 'react'
import { engine } from '../store'

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Seek bar for the current audition: drag anywhere in the track to hear the
 * middle before committing it to a scene. Polls the engine while previewing;
 * during a drag the thumb follows the pointer and the seek commits on release
 * (seeking on every pixel would restart the source constantly).
 */
export default function PreviewScrubber({ file }: { file: string }) {
  const [prog, setProg] = useState<{ elapsed: number; duration: number } | null>(null)
  const [drag, setDrag] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => {
      const p = engine.previewProgress()
      setProg(p && p.file === file ? { elapsed: p.elapsed, duration: p.duration } : null)
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [file])

  if (!prog) return null

  const commit = (): void => {
    if (drag !== null) engine.seekPreview(drag)
    setDrag(null)
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
        onChange={(e) => setDrag(parseFloat(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        className="h-1 min-w-0 flex-1 cursor-pointer accent-hearth-ember"
      />
      <span className="w-8 text-[10px] tabular-nums text-hearth-muted">{fmt(prog.duration)}</span>
    </div>
  )
}
