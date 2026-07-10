import { useEffect, useMemo, useRef, useState } from 'react'
import { Arc, Circle, Group, Image as KImage, Layer, Line, Rect, Stage, Text } from 'react-konva'
import type Konva from 'konva'
import useImage from 'use-image'
import type { Combatant, FogStroke, MapToken, Scene, SceneMap, TokenDecor } from '../../shared/types'
import { assetUrl } from '../lib/asset'
import { stem } from '../../shared/paths'
import { loadMonsters, type Monster } from '../lib/compendium'
import { useStore } from '../store'
import { MonsterStatBlock } from './StatBlock'

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

/** Ephemeral ping markers (D4): a bright double ring that fades after ~2.5s. */
export interface Ping {
  id: string
  x: number
  y: number
}

export function PingLayer({ pings, scale = 1 }: { pings: Ping[]; scale?: number }) {
  return (
    <Group listening={false}>
      {pings.map((p) => (
        <Group key={p.id} x={p.x} y={p.y}>
          <Circle radius={34 / scale} stroke="#e0a83c" strokeWidth={5 / scale} opacity={0.9} />
          <Circle radius={16 / scale} fill="#e0a83c" opacity={0.5} />
        </Group>
      ))}
    </Group>
  )
}

/** Keep a self-expiring ping list (shared by the editor and the presenter). */
export function usePings(): [Ping[], (p: { x: number; y: number; id?: string }) => void] {
  const [pings, setPings] = useState<Ping[]>([])
  const add = (p: { x: number; y: number; id?: string }) => {
    const ping: Ping = { id: p.id ?? crypto.randomUUID(), x: p.x, y: p.y }
    setPings((ps) => [...ps, ping])
    setTimeout(() => setPings((ps) => ps.filter((x) => x.id !== ping.id)), 2500)
  }
  return [pings, add]
}

/** Snap a point to the center of its grid cell (no-op when the grid is off). */
function snapToGrid(x: number, y: number, cell?: number): { x: number; y: number } {
  if (!cell || cell < 8) return { x, y }
  return {
    x: (Math.floor(x / cell) + 0.5) * cell,
    y: (Math.floor(y / cell) + 0.5) * cell
  }
}

/** HP fraction → ring color (green → amber → red). */
const hpColor = (f: number) => (f > 0.5 ? '#27ae60' : f > 0.25 ? '#e0a83c' : '#c0392b')

/** Token discs: label in a colored circle; HP ring + condition tags via decor. */
export function TokenLayer({
  tokens,
  draggable,
  decor,
  onMove,
  onToggleHidden,
  onRemove,
  onInspect
}: {
  tokens: MapToken[]
  draggable?: boolean
  /** Live (DM) or baked-at-send (presenter) HP rings + condition tags by token id. */
  decor?: Record<string, TokenDecor>
  onMove?: (id: string, x: number, y: number) => void
  onToggleHidden?: (id: string) => void
  onRemove?: (id: string) => void
  onInspect?: (tk: MapToken) => void
}) {
  return (
    <>
      {tokens.map((tk) => {
        const d = decor?.[tk.id]
        return (
          <Group
            key={tk.id}
            name="token"
            x={tk.x}
            y={tk.y}
            draggable={draggable}
            onDragEnd={(e) => onMove?.(tk.id, e.target.x(), e.target.y())}
            onClick={() => onInspect?.(tk)}
            onDblClick={() => onToggleHidden?.(tk.id)}
            onContextMenu={(e) => {
              e.evt.preventDefault()
              onRemove?.(tk.id)
            }}
            opacity={tk.hidden ? 0.45 : 1}
          >
            <Circle radius={tk.r} fill={tk.color} stroke="black" strokeWidth={2} shadowBlur={6} shadowOpacity={0.6} />
            {d?.hpFrac != null && (
              <Arc
                innerRadius={tk.r + 2}
                outerRadius={tk.r + 6}
                angle={Math.max(4, 360 * Math.max(0, Math.min(1, d.hpFrac)))}
                rotation={-90}
                fill={hpColor(d.hpFrac)}
                listening={false}
              />
            )}
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
            {d?.conds && d.conds.length > 0 && (
              <Text
                text={d.conds.slice(0, 3).join(' · ')}
                fontSize={Math.max(11, tk.r * 0.34)}
                fontStyle="bold"
                fill="#c39bd3"
                stroke="black"
                strokeWidth={0.8}
                width={tk.r * 4}
                offsetX={tk.r * 2}
                y={tk.r + 8}
                align="center"
                listening={false}
              />
            )}
          </Group>
        )
      })}
    </>
  )
}

/** Player-side render: image + committed fog, scaled to fit the window. */
export function PresenterMap({
  file,
  strokes,
  tokens = [],
  grid,
  decor,
  initiative,
  pings = []
}: {
  file: string
  strokes: FogStroke[]
  tokens?: MapToken[]
  grid?: number
  decor?: Record<string, TokenDecor>
  initiative?: { names: string[]; turn: number }
  pings?: Ping[]
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
    <div className="relative h-full w-full">
      <Stage width={size.w} height={size.h}>
        <Layer x={x} y={y} scaleX={scale} scaleY={scale}>
          <KImage image={img} />
          {grid ? <GridLayer w={img.width} h={img.height} cell={grid} /> : null}
          <FogLayer w={img.width} h={img.height} strokes={strokes} opacity={1} />
          <TokenLayer tokens={tokens.filter((t) => !t.hidden)} decor={decor} />
          <PingLayer pings={pings} scale={scale} />
        </Layer>
      </Stage>
      {/* Initiative strip (D4): who's up, baked at 📤 Send. */}
      {initiative && initiative.names.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
          <div className="flex max-w-[95vw] flex-wrap items-center gap-1 rounded-b-lg bg-black/70 px-3 py-1.5">
            {initiative.names.map((n, i) => (
              <span
                key={`${n}:${i}`}
                className={`rounded px-2 py-0.5 text-sm ${
                  i === initiative.turn ? 'bg-amber-500/90 font-bold text-black' : 'text-white/70'
                }`}
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

type Tool = 'reveal' | 'hide' | 'pan' | 'token' | 'ruler'

const TOKEN_COLORS = ['#d8b26a', '#e08a3c', '#c0392b', '#8e44ad', '#2980b9', '#27ae60', '#7f8c8d']

/** Creature size → token radius in grid cells (DDB auto-sizing: Large = 2×2). */
const SIZE_CELLS: Record<string, number> = {
  tiny: 0.35,
  small: 0.42,
  medium: 0.42,
  large: 0.92,
  huge: 1.42,
  gargantuan: 1.9
}

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

  // --- D4: token ↔ sheet/tracker links -------------------------------------
  const characters = useStore((s) => s.campaign.characters)
  const updateCharacter = useStore((s) => s.updateCharacter)
  const enc = scene.encounter
  const [monsters, setMonsters] = useState<Monster[] | null>(null)
  useEffect(() => {
    loadMonsters().then(setMonsters).catch(() => setMonsters([]))
  }, [])
  const [inspectId, setInspectId] = useState<string | null>(null)
  const [ruler, setRuler] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [pings, addPing] = usePings()

  /** A token's linked combatant (by id, or by the character it mirrors). */
  const combatantOf = (tk: MapToken): Combatant | undefined =>
    enc?.combatants.find((cb) => cb.id === tk.combatantId) ??
    (tk.characterId ? enc?.combatants.find((cb) => cb.characterId === tk.characterId) : undefined)

  /** Live HP rings + condition tags (the presenter gets a baked copy at send). */
  const decor = useMemo(() => {
    const out: Record<string, TokenDecor> = {}
    for (const tk of tokens) {
      const d: TokenDecor = {}
      const ch = tk.characterId ? characters.find((x) => x.id === tk.characterId) : undefined
      const cb = combatantOf(tk)
      if (ch && ch.maxHp > 0) d.hpFrac = ch.hp / ch.maxHp
      else if (cb && cb.maxHp > 0) d.hpFrac = cb.hp / cb.maxHp
      const conds = cb?.conditions?.map((x) => x.name) ?? []
      if (conds.length) d.conds = conds
      if (d.hpFrac != null || d.conds) out[tk.id] = d
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, characters, enc])

  /** ⚔ → map: stamp every combatant without a token (auto-sized, PCs south / foes north). */
  const stampEncounter = () => {
    if (!enc || enc.combatants.length === 0 || !img) return
    const cell = grid >= 8 ? grid : 128
    const baseR = cell * 0.42
    const fresh = enc.combatants.filter(
      (cb) => !tokens.some((tk) => tk.combatantId === cb.id || (cb.characterId && tk.characterId === cb.characterId))
    )
    if (fresh.length === 0) {
      pushToast('Every combatant already has a token', 'info')
      return
    }
    const next = [...tokens]
    let pcCol = 0
    let foeCol = 0
    for (const cb of fresh) {
      const isPc = cb.side === 'pc'
      const mon = cb.ref ? monsters?.find((m) => m.key === cb.ref) : undefined
      const r = mon ? cell * (SIZE_CELLS[mon.size?.toLowerCase() ?? 'medium'] ?? 0.42) : baseR
      const col = isPc ? pcCol++ : foeCol++
      next.push({
        id: crypto.randomUUID(),
        label: cb.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '●',
        x: img.width / 2 + (col - fresh.length / 4) * cell * 2.2,
        y: isPc ? img.height - cell * 2 : cell * 2,
        r,
        color: isPc ? TOKEN_COLORS[col % TOKEN_COLORS.length] : '#c0392b',
        combatantId: cb.id,
        characterId: cb.characterId,
        ref: cb.ref,
        hidden: !isPc // foes arrive hidden — reveal on contact (dbl-click)
      })
    }
    persistTokens(next)
    pushToast(`${fresh.length} token${fresh.length > 1 ? 's' : ''} stamped from ⚔ (foes hidden — double-click to reveal)`, 'info')
  }

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
    // Alt+click in any tool: ping — pulses here AND on the presenter (if open).
    if (e?.evt.altKey) {
      const p = imgPos()
      if (p) {
        addPing(p)
        void window.hearth.presenterPing(p)
      }
      return
    }
    if (tool === 'pan') return
    // Clicking an existing token (to drag it) must not also place a new one.
    if (tool === 'token' && e && e.target !== e.target.getStage() && e.target.findAncestor('.token')) return
    const p = imgPos()
    if (!p) return
    if (tool === 'ruler') {
      setRuler({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
      return
    }
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
    if (ruler) {
      const p = imgPos()
      if (p) setRuler((r) => (r ? { ...r, x2: p.x, y2: p.y } : r))
      return
    }
    if (!drawing) return
    const p = imgPos()
    if (!p) return
    setDrawing((d) => (d ? { ...d, points: [...d.points, p.x, p.y] } : d))
  }
  const onUp = () => {
    if (ruler) {
      setRuler(null)
      return
    }
    if (!drawing) return
    persist([...map.strokes, drawing])
    setDrawing(null)
  }

  /** Ruler distance: with a grid, cells × 5 ft; without, raw pixels. */
  const rulerLabel = (r: { x1: number; y1: number; x2: number; y2: number }): string => {
    const px = Math.hypot(r.x2 - r.x1, r.y2 - r.y1)
    return grid >= 8 ? `${Math.round((px / grid) * 5)} ft` : `${Math.round(px)} px`
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
    // Bake presenter decor: PC HP rings only (enemy HP stays the DM's secret),
    // condition tags for everyone visible.
    const baked: Record<string, TokenDecor> = {}
    for (const tk of tokens) {
      if (tk.hidden) continue
      const d: TokenDecor = {}
      if (tk.characterId) {
        const ch = characters.find((x) => x.id === tk.characterId)
        if (ch && ch.maxHp > 0) d.hpFrac = ch.hp / ch.maxHp
      }
      const conds = combatantOf(tk)?.conditions?.map((x) => x.name) ?? []
      if (conds.length) d.conds = conds
      if (d.hpFrac != null || d.conds) baked[tk.id] = d
    }
    // Initiative strip: only once the fight started; hidden tokens' combatants omitted.
    let initiative: { names: string[]; turn: number } | undefined
    if (enc && enc.turn >= 0 && enc.combatants.length > 0) {
      const ordered = [...enc.combatants].sort((a, b) => (b.initiative ?? -99) - (a.initiative ?? -99))
      const active = ordered[Math.min(enc.turn, ordered.length - 1)]
      const visible = ordered.filter((cb) => {
        const tk = tokens.find((t) => t.combatantId === cb.id || (cb.characterId && t.characterId === cb.characterId))
        return !tk?.hidden
      })
      initiative = { names: visible.map((cb) => cb.name), turn: visible.findIndex((cb) => cb.id === active?.id) }
    }
    void window.hearth.presenterShow({
      file: map.image,
      map: {
        strokes: map.strokes,
        tokens,
        grid: grid || undefined,
        decor: Object.keys(baked).length ? baked : undefined,
        initiative
      }
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
        <ToolBtn t="token" label="⛂ Token" title="Click empty ground to place; drag to move; click a token = inspect (stat block / HP); double-click = hide from players; right-click = remove" />
        <ToolBtn t="ruler" label="📏 Ruler" title={grid >= 8 ? 'Drag to measure (5 ft per cell)' : 'Drag to measure (set a Grid for feet)'} />
        {enc && enc.combatants.length > 0 && (
          <button
            onClick={stampEncounter}
            title="Stamp every ⚔ combatant as a token — auto-sized from the stat block, foes arrive hidden"
            className="rounded border border-hearth-border bg-hearth-panel2 px-2.5 py-1 text-sm text-hearth-muted hover:text-hearth-text"
          >
            ⚔ → map
          </button>
        )}
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
              decor={decor}
              onMove={(id, x, y) => {
                const sp = snapToGrid(x, y, grid)
                persistTokens(tokens.map((tk) => (tk.id === id ? { ...tk, x: sp.x, y: sp.y } : tk)))
              }}
              onToggleHidden={(id) =>
                persistTokens(tokens.map((tk) => (tk.id === id ? { ...tk, hidden: !tk.hidden } : tk)))
              }
              onRemove={(id) => persistTokens(tokens.filter((tk) => tk.id !== id))}
              onInspect={(tk) => setInspectId(tk.id)}
            />
          </Group>
          <PingLayer pings={pings} scale={view.scale} />
          {/* Ruler (D4): DM-only measurement, never sent to players. */}
          {ruler && (
            <Group listening={false}>
              <Line
                points={[ruler.x1, ruler.y1, ruler.x2, ruler.y2]}
                stroke="#e0a83c"
                strokeWidth={3 / view.scale}
                dash={[12 / view.scale, 8 / view.scale]}
              />
              <Text
                text={rulerLabel(ruler)}
                x={(ruler.x1 + ruler.x2) / 2}
                y={(ruler.y1 + ruler.y2) / 2 - 24 / view.scale}
                fontSize={20 / view.scale}
                fontStyle="bold"
                fill="#e0a83c"
                stroke="black"
                strokeWidth={1 / view.scale}
              />
            </Group>
          )}
        </Layer>
      </Stage>

      {inspectId && (
        <TokenInspect
          token={tokens.find((t) => t.id === inspectId)}
          combatant={tokens.find((t) => t.id === inspectId) ? combatantOf(tokens.find((t) => t.id === inspectId)!) : undefined}
          characters={characters}
          monsters={monsters}
          onPatchCharacterHp={(id, hp) => void updateCharacter(id, (x) => ({ ...x, hp }))}
          onPatchCombatantHp={(id, hp) =>
            updateScene(scene.id, (s) => ({
              ...s,
              encounter: s.encounter
                ? { ...s.encounter, combatants: s.encounter.combatants.map((cb) => (cb.id === id ? { ...cb, hp } : cb)) }
                : s.encounter
            }))
          }
          onClose={() => setInspectId(null)}
        />
      )}

      {!img && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-hearth-muted">
          Loading {map.image}…
        </div>
      )}
    </div>
  )
}

/**
 * Click-a-token inspector (D4): monster tokens open the stat block with an HP
 * flyout (DDB's token menu); PC tokens show live vitals writing to the sheet.
 */
function TokenInspect({
  token,
  combatant,
  characters,
  monsters,
  onPatchCharacterHp,
  onPatchCombatantHp,
  onClose
}: {
  token: MapToken | undefined
  combatant?: Combatant
  characters: { id: string; name: string; hp: number; maxHp: number; ac: number }[]
  monsters: Monster[] | null
  onPatchCharacterHp: (characterId: string, hp: number) => void
  onPatchCombatantHp: (combatantId: string, hp: number) => void
  onClose: () => void
}) {
  const [dmg, setDmg] = useState('')
  if (!token) return null
  const ch = token.characterId ? characters.find((x) => x.id === token.characterId) : undefined
  const mon = token.ref ? monsters?.find((m) => m.key === token.ref) : undefined
  const hp = ch ? { cur: ch.hp, max: ch.maxHp } : combatant ? { cur: combatant.hp, max: combatant.maxHp } : null

  const applyHp = (sign: 1 | -1) => {
    const n = parseInt(dmg, 10)
    if (!Number.isFinite(n) || n <= 0 || !hp) return
    setDmg('')
    const next = Math.max(0, Math.min(hp.max, hp.cur + sign * n))
    if (ch) onPatchCharacterHp(ch.id, next)
    else if (combatant) onPatchCombatantHp(combatant.id, next)
  }

  return (
    <div className="absolute bottom-4 right-4 top-16 z-20 flex w-96 max-w-[90vw] flex-col rounded-lg border border-hearth-border bg-hearth-panel/95 shadow-2xl">
      <div className="flex items-center gap-2 border-b border-hearth-border px-3 py-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: token.color }} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-hearth-text">
          {ch?.name ?? combatant?.name ?? mon?.name ?? token.label}
        </span>
        {token.hidden && <span className="text-[10px] text-hearth-muted">hidden from players</span>}
        <button onClick={onClose} className="px-1 text-hearth-muted hover:text-hearth-text">
          ✕
        </button>
      </div>
      {hp && (
        <div className="flex flex-wrap items-center gap-2 border-b border-hearth-border px-3 py-2 text-xs text-hearth-muted">
          <span>
            HP <span className="text-sm font-semibold text-hearth-text">{hp.cur}</span>/{hp.max}
          </span>
          {(ch?.ac ?? combatant?.ac) != null && <span>AC {ch?.ac ?? combatant?.ac}</span>}
          <span className="ml-auto flex items-center gap-0.5">
            <input
              value={dmg}
              onChange={(e) => setDmg(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyHp(-1)}
              placeholder="dmg/heal"
              className="w-16 rounded border border-hearth-border bg-hearth-bg px-1 py-0.5 text-center text-xs text-hearth-text placeholder:text-hearth-muted/40"
            />
            <button onClick={() => applyHp(-1)} className="rounded bg-red-500/15 px-1.5 text-sm text-red-300 hover:bg-red-500/30" title="Damage">
              −
            </button>
            <button onClick={() => applyHp(1)} className="rounded bg-emerald-500/15 px-1.5 text-sm text-emerald-300 hover:bg-emerald-500/30" title="Heal">
              +
            </button>
          </span>
          {combatant?.conditions && combatant.conditions.length > 0 && (
            <span className="w-full text-purple-300">
              {combatant.conditions.map((x) => x.name).join(' · ')}
            </span>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3">
        {mon ? (
          <MonsterStatBlock m={mon} />
        ) : ch ? (
          <p className="text-xs text-hearth-muted">
            Linked to the character sheet — HP edits here land on the sheet, the dashboard, and the player's
            browser. Open 🛡 Party for the full sheet.
          </p>
        ) : (
          <p className="text-xs text-hearth-muted">A plain marker — link it by stamping from ⚔ instead.</p>
        )}
      </div>
    </div>
  )
}
