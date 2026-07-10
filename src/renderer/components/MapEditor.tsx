import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, Group, Image as KImage, Layer, Line, Rect, Stage, Text } from 'react-konva'
import type Konva from 'konva'
import useImage from 'use-image'
import type { FogStroke, MapToken, Scene, SceneMap } from '../../shared/types'
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

/** Square grid overlay (under the fog, so unrevealed cells stay dark). */
export function GridLayer({ w, h, cell }: { w: number; h: number; cell: number }) {
  if (cell < 8) return null
  const lines: number[] = []
  for (let x = cell; x < w; x += cell) lines.push(x)
  const ys: number[] = []
  for (let y = cell; y < h; y += cell) ys.push(y)
  return (
    <Group listening={false} opacity={0.25}>
      {lines.map((x) => (
        <Line key={`v${x}`} points={[x, 0, x, h]} stroke="black" strokeWidth={1.5} />
      ))}
      {ys.map((y) => (
        <Line key={`h${y}`} points={[0, y, w, y]} stroke="black" strokeWidth={1.5} />
      ))}
    </Group>
  )
}

/** Snap a point to the center of its grid cell (no-op when the grid is off). */
function snapToGrid(x: number, y: number, cell?: number): { x: number; y: number } {
  if (!cell || cell < 8) return { x, y }
  return {
    x: (Math.floor(x / cell) + 0.5) * cell,
    y: (Math.floor(y / cell) + 0.5) * cell
  }
}

/** Token discs: label in a colored circle; presenter hides hidden ones. */
export function TokenLayer({
  tokens,
  draggable,
  onMove,
  onToggleHidden,
  onRemove
}: {
  tokens: MapToken[]
  draggable?: boolean
  onMove?: (id: string, x: number, y: number) => void
  onToggleHidden?: (id: string) => void
  onRemove?: (id: string) => void
}) {
  return (
    <>
      {tokens.map((tk) => (
        <Group
          key={tk.id}
          name="token"
          x={tk.x}
          y={tk.y}
          draggable={draggable}
          onDragEnd={(e) => onMove?.(tk.id, e.target.x(), e.target.y())}
          onDblClick={() => onToggleHidden?.(tk.id)}
          onContextMenu={(e) => {
            e.evt.preventDefault()
            onRemove?.(tk.id)
          }}
          opacity={tk.hidden ? 0.45 : 1}
        >
          <Circle radius={tk.r} fill={tk.color} stroke="black" strokeWidth={2} shadowBlur={6} shadowOpacity={0.6} />
          <Text
            text={tk.label.slice(0, 3)}
            fontSize={tk.r * 0.9}
            fontStyle="bold"
            fill="white"
            width={tk.r * 2}
            height={tk.r * 2}
            offsetX={tk.r}
            offsetY={tk.r}
            align="center"
            verticalAlign="middle"
            listening={false}
          />
        </Group>
      ))}
    </>
  )
}

/** Player-side render: image + committed fog, scaled to fit the window. */
export function PresenterMap({
  file,
  strokes,
  tokens = [],
  grid
}: {
  file: string
  strokes: FogStroke[]
  tokens?: MapToken[]
  grid?: number
}) {
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
        {grid ? <GridLayer w={img.width} h={img.height} cell={grid} /> : null}
        <FogLayer w={img.width} h={img.height} strokes={strokes} opacity={1} />
        <TokenLayer tokens={tokens.filter((t) => !t.hidden)} />
      </Layer>
    </Stage>
  )
}

type Tool = 'reveal' | 'hide' | 'pan' | 'token'

const TOKEN_COLORS = ['#d8b26a', '#e08a3c', '#c0392b', '#8e44ad', '#2980b9', '#27ae60', '#7f8c8d']

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

  const [tokenLabel, setTokenLabel] = useState('PC')
  const tokens = map.tokens ?? []

  const persist = (next: FogStroke[]) =>
    updateScene(scene.id, (s) => ({ ...s, map: { ...(s.map as SceneMap), strokes: next } }))

  const persistTokens = (next: MapToken[]) =>
    updateScene(scene.id, (s) => ({ ...s, map: { ...(s.map as SceneMap), tokens: next } }))

  const grid = map.grid ?? 0
  const persistGrid = (cell: number) =>
    updateScene(scene.id, (s) => ({ ...s, map: { ...(s.map as SceneMap), grid: cell || undefined } }))

  const imgPos = (): { x: number; y: number } | null => {
    const stage = stageRef.current
    if (!stage) return null
    const p = stage.getPointerPosition()
    if (!p) return null
    return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale }
  }

  const onDown = (e?: Konva.KonvaEventObject<MouseEvent>) => {
    if (tool === 'pan') return
    // Clicking an existing token (to drag it) must not also place a new one.
    if (tool === 'token' && e && e.target !== e.target.getStage() && e.target.findAncestor('.token')) return
    const p = imgPos()
    if (!p) return
    if (tool === 'token') {
      const sp = snapToGrid(p.x, p.y, grid)
      persistTokens([
        ...tokens,
        {
          id: crypto.randomUUID(),
          label: tokenLabel.trim() || '●',
          x: sp.x,
          y: sp.y,
          r: grid >= 8 ? grid * 0.42 : Math.max(14, brush / view.scale / 2),
          color: TOKEN_COLORS[tokens.length % TOKEN_COLORS.length]
        }
      ])
      return
    }
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
    void window.hearth.presenterShow({
      file: map.image,
      map: { strokes: map.strokes, tokens, grid: grid || undefined }
    })
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
        <ToolBtn t="token" label="⛂ Token" title="Click to place a token; drag to move; double-click = hide from players; right-click = remove" />
        {tool === 'token' && (
          <input
            value={tokenLabel}
            onChange={(e) => setTokenLabel(e.target.value)}
            placeholder="label"
            maxLength={3}
            className="w-14 rounded border border-hearth-border bg-hearth-bg px-1.5 py-1 text-center text-sm text-hearth-text"
            title="Token label (1–3 chars)"
          />
        )}
        <label className="flex items-center gap-1.5 text-xs text-hearth-muted">
          Brush
          <input type="range" min={12} max={200} value={brush} onChange={(e) => setBrush(Number(e.target.value))} className="w-24" />
        </label>
        <label
          className="flex items-center gap-1.5 text-xs text-hearth-muted"
          title="Grid cell size in map-image pixels (0 = off). Tokens snap to cell centers; players see the grid too."
        >
          Grid
          <input
            type="number"
            min={0}
            max={2000}
            step={5}
            value={grid}
            onChange={(e) => persistGrid(Math.max(0, Number(e.target.value) || 0))}
            className="w-16 rounded border border-hearth-border bg-hearth-bg px-1.5 py-1 text-center text-sm text-hearth-text"
          />
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
        onMouseDown={(e) => onDown(e)}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onWheel={onWheel}
        style={{ cursor: tool === 'pan' ? 'grab' : 'crosshair' }}
      >
        <Layer>
          {img && <KImage image={img} />}
          {img && grid >= 8 && <GridLayer w={img.width} h={img.height} cell={grid} />}
          {/* DM sees dim fog (players get full black in the presenter). */}
          {img && <FogLayer w={img.width} h={img.height} strokes={strokes} opacity={0.6} />}
          {/* Tokens interact only in token mode so brushing never drags one. */}
          <Group listening={tool === 'token'}>
            <TokenLayer
              tokens={tokens}
              draggable={tool === 'token'}
              onMove={(id, x, y) => {
                const sp = snapToGrid(x, y, grid)
                persistTokens(tokens.map((tk) => (tk.id === id ? { ...tk, x: sp.x, y: sp.y } : tk)))
              }}
              onToggleHidden={(id) =>
                persistTokens(tokens.map((tk) => (tk.id === id ? { ...tk, hidden: !tk.hidden } : tk)))
              }
              onRemove={(id) => persistTokens(tokens.filter((tk) => tk.id !== id))}
            />
          </Group>
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
