import { useEffect, useMemo, useRef, useState } from 'react'
import { Group, Image as KImage, Layer, Line, Rect, Stage } from 'react-konva'
import type Konva from 'konva'
import useImage from 'use-image'
import type { FogStroke, Scene, SceneMap } from '../../shared/types'
import { assetUrl } from '../lib/asset'
import { stem } from '../../shared/paths'
import { useStore } from '../store'

// ONESTOP-PLAN C3 — battle map with vector fog of war.
// DM paints reveal/hide strokes over the map; players only ever see what was
// explicitly SENT (dungeon-revealer's commit model). Strokes are stored in
// image coordinates on the scene, so they survive restarts and git-sync.

/**
 * The fog overlay: a black sheet with the stroke history applied in order —
 * reveal strokes punch holes (destination-out), hide strokes paint fog back.
 * Rendered inside its own cached Group so composite ops stay local.
 */
export function FogLayer({
  w,
  h,
  strokes,
  opacity
}: {
  w: number
  h: number
  strokes: FogStroke[]
  opacity: number
}) {
  return (
    <Group opacity={opacity}>
      <Rect x={0} y={0} width={w} height={h} fill="black" />
      {strokes.map((s, i) =>
        s.shape === 'fill' ? (
          <Rect
            key={i}
            x={0}
            y={0}
            width={w}
            height={h}
            fill="black"
            globalCompositeOperation={s.mode === 'reveal' ? 'destination-out' : 'source-over'}
          />
        ) : (
          <Line
            key={i}
            points={s.points}
            stroke="black"
            strokeWidth={s.radius * 2}
            lineCap="round"
            lineJoin="round"
            tension={0}
            globalCompositeOperation={s.mode === 'reveal' ? 'destination-out' : 'source-over'}
          />
        )
      )}
    </Group>
  )
}

/** Player-side render: image + committed fog, scaled to fit the window. */
export function PresenterMap({ file, strokes }: { file: string; strokes: FogStroke[] }) {
  const [img] = useImage(assetUrl(file))
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  if (!img) return null
  const scale = Math.min(size.w / img.width, size.h / img.height)
  const x = (size.w - img.width * scale) / 2
  const y = (size.h - img.height * scale) / 2
  return (
    <Stage width={size.w} height={size.h}>
      <Layer x={x} y={y} scaleX={scale} scaleY={scale}>
        <KImage image={img} />
        <FogLayer w={img.width} h={img.height} strokes={strokes} opacity={1} />
      </Layer>
    </Stage>
  )
}

type Tool = 'reveal' | 'hide' | 'pan'

/** Full-screen DM fog editor over the scene's map image. */
export default function MapEditor({ scene, onClose }: { scene: Scene; onClose: () => void }) {
  const updateScene = useStore((s) => s.updateScene)
  const pushToast = useStore((s) => s.pushToast)
  const map = scene.map!
  const [img] = useImage(assetUrl(map.image))
  const [tool, setTool] = useState<Tool>('reveal')
  const [brush, setBrush] = useState(60)
  // Live strokes: scene strokes + the one being drawn, for lag-free painting.
  const [drawing, setDrawing] = useState<FogStroke | null>(null)
  const [view, setView] = useState({ x: 40, y: 40, scale: 0.8 })
  const stageRef = useRef<Konva.Stage | null>(null)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Fit the image on first load.
  useEffect(() => {
    if (!img) return
    const scale = Math.min((size.w - 80) / img.width, (size.h - 120) / img.height, 1.5)
    setView({ x: (size.w - img.width * scale) / 2, y: (size.h - img.height * scale) / 2 + 20, scale })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img])

  const strokes = useMemo(
    () => (drawing ? [...map.strokes, drawing] : map.strokes),
    [map.strokes, drawing]
  )

  const persist = (next: FogStroke[]) =>
    updateScene(scene.id, (s) => ({ ...s, map: { ...(s.map as SceneMap), strokes: next } }))

  const imgPos = (): { x: number; y: number } | null => {
    const stage = stageRef.current
    if (!stage) return null
    const p = stage.getPointerPosition()
    if (!p) return null
    return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale }
  }

  const onDown = () => {
    if (tool === 'pan') return
    const p = imgPos()
    if (!p) return
    setDrawing({ points: [p.x, p.y, p.x + 0.01, p.y + 0.01], radius: brush / view.scale, mode: tool })
  }
  const onMove = () => {
    if (!drawing) return
    const p = imgPos()
    if (!p) return
    setDrawing((d) => (d ? { ...d, points: [...d.points, p.x, p.y] } : d))
  }
  const onUp = () => {
    if (!drawing) return
    persist([...map.strokes, drawing])
    setDrawing(null)
  }

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const p = stage.getPointerPosition()
    if (!p) return
    const factor = e.evt.deltaY < 0 ? 1.12 : 1 / 1.12
    const scale = Math.min(6, Math.max(0.1, view.scale * factor))
    // Zoom toward the cursor.
    setView({
      scale,
      x: p.x - ((p.x - view.x) / view.scale) * scale,
      y: p.y - ((p.y - view.y) / view.scale) * scale
    })
  }

  const send = () => {
    void window.hearth.presenterShow({ file: map.image, map: { strokes: map.strokes } })
    pushToast('Map sent to the presenter window', 'info')
  }

  const ToolBtn = ({ t, label, title }: { t: Tool; label: string; title: string }) => (
    <button
      onClick={() => setTool(t)}
      title={title}
      className={`rounded border px-2.5 py-1 text-sm transition-colors ${
        tool === t
          ? 'border-hearth-ember bg-hearth-ember/20 text-hearth-ember'
          : 'border-hearth-border bg-hearth-panel2 text-hearth-muted hover:text-hearth-text'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-40 bg-hearth-bg">
      {/* Toolbar */}
      <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 border-b border-hearth-border bg-hearth-panel/95 px-4 py-2">
        <span className="font-display text-sm font-semibold text-hearth-text">🗺 {stem(map.image)}</span>
        <div className="mx-2 h-4 w-px bg-hearth-border" />
        <ToolBtn t="reveal" label="🔦 Reveal" title="Paint away the fog (what players will see)" />
        <ToolBtn t="hide" label="🌫 Hide" title="Paint fog back over a revealed area" />
        <ToolBtn t="pan" label="✋ Pan" title="Drag to move the map (wheel zooms anytime)" />
        <label className="flex items-center gap-1.5 text-xs text-hearth-muted">
          Brush
          <input type="range" min={12} max={200} value={brush} onChange={(e) => setBrush(Number(e.target.value))} className="w-24" />
        </label>
        <div className="mx-2 h-4 w-px bg-hearth-border" />
        <button
          onClick={() => persist(map.strokes.slice(0, -1))}
          disabled={map.strokes.length === 0}
          className="rounded border border-hearth-border bg-hearth-panel2 px-2 py-1 text-sm text-hearth-muted hover:text-hearth-text disabled:opacity-30"
          title="Undo the last stroke"
        >
          ↶
        </button>
        <button
          onClick={() => persist([...map.strokes, { points: [], radius: 0, mode: 'reveal', shape: 'fill' }])}
          className="rounded border border-hearth-border bg-hearth-panel2 px-2 py-1 text-xs text-hearth-muted hover:text-hearth-text"
          title="Reveal the whole map"
        >
          Reveal all
        </button>
        <button
          onClick={() => persist([])}
          className="rounded border border-hearth-border bg-hearth-panel2 px-2 py-1 text-xs text-hearth-muted hover:text-hearth-text"
          title="Cover everything in fog again"
        >
          Reset fog
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={send}
            className="rounded border border-hearth-ember bg-hearth-ember/20 px-3 py-1 text-sm text-hearth-ember shadow-ember hover:bg-hearth-ember/30"
            title="Push the current fog state to the player-facing presenter window — players never see uncommitted brushing"
          >
            📤 Send to players
          </button>
          <button
            onClick={() => void window.hearth.presenterShow({ file: null })}
            className="rounded border border-hearth-border bg-hearth-panel2 px-2 py-1 text-xs text-hearth-muted hover:text-hearth-text"
            title="Blank the presenter window"
          >
            ⬛ Blackout
          </button>
          <button onClick={onClose} className="rounded px-2 py-1 text-hearth-muted hover:text-hearth-text" title="Close (Esc)">
            ✕ Close
          </button>
        </div>
      </div>

      {/* Canvas */}
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        draggable={tool === 'pan'}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }))
        }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onWheel={onWheel}
        style={{ cursor: tool === 'pan' ? 'grab' : 'crosshair' }}
      >
        <Layer>
          {img && <KImage image={img} />}
          {/* DM sees dim fog (players get full black in the presenter). */}
          {img && <FogLayer w={img.width} h={img.height} strokes={strokes} opacity={0.6} />}
        </Layer>
      </Stage>

      {!img && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-hearth-muted">
          Loading {map.image}…
        </div>
      )}
    </div>
  )
}
