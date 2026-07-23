import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { StatRefInline } from '../../shared/types'
import { loadMonsters, loadTraps, type Monster, type Trap } from '../lib/compendium'
import { CUE_BADGE_CLASS } from '../lib/cueMeta'
import { placeCard, type CardPlacement } from '../lib/floatPlacement'
import {
  hpKey,
  STAT_CHIP_CLASS,
  STAT_CHIP_HOVER,
  STAT_TEXT,
  STAT_TITLE,
  useStatRefStore
} from '../lib/statRef'
import { useStore } from '../store'
import { MonsterStatBlock, TrapCard } from './StatBlock'

const CARD_W = 400

/** undefined = loading, null = not found in compendium/homebrew. */
function useStatData(kind: StatRefInline['kind'], ref: string): Monster | Trap | null | undefined {
  const [data, setData] = useState<Monster | Trap | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    const norm = ref.trim().toLowerCase()
    const load = kind === 'monster' ? loadMonsters() : loadTraps()
    void load.then((rows: (Monster | Trap)[]) => {
      if (!alive) return
      const hit =
        rows.find((r) => r.key.toLowerCase() === norm) ??
        rows.find((r) => r.name.toLowerCase() === norm)
      setData(hit ?? null)
    })
    return () => {
      alive = false
    }
  }, [kind, ref])
  return data
}

/**
 * Read-mode chip for a `{{monster:...}}`/`{{trap:...}}` ref: shows the name
 * (plus live HP once the pool has been touched); click opens a floating card
 * with the full rollable stat block and, for monsters, an HP tracker. Not a
 * sound cue — it never consumes a teleprompter slot.
 */
export default function StatRefPill({
  kind,
  refId,
  label
}: {
  kind: StatRefInline['kind']
  refId: string
  label?: string
}) {
  const [anchor, setAnchor] = useState<CardPlacement | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const data = useStatData(kind, refId)
  const sceneId = useStore((s) => s.currentSceneId)
  const pool = hpKey(sceneId ?? undefined, refId, label)
  const hp = useStatRefStore((s) => s.hp[pool])

  const display = label || data?.name || refId
  const maxHp = kind === 'monster' && data ? (data as Monster).hp : undefined
  const cur = hp ?? maxHp

  const toggle = () => {
    if (anchor) {
      setAnchor(null)
      return
    }
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    // Dock-aware placement: never open into (or under) the sound console.
    setAnchor(placeCard(r, CARD_W, 560))
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title={`${STAT_TITLE[kind]} — ${refId}`}
        className={`mx-1 inline-flex items-center gap-1.5 rounded border px-2 py-0.5 align-middle text-sm transition-colors ${STAT_CHIP_CLASS[kind]} ${STAT_CHIP_HOVER[kind]} ${
          anchor ? 'ring-1 ring-hearth-ember/70' : ''
        }`}
      >
        <span aria-hidden className={CUE_BADGE_CLASS}>
          {STAT_TEXT[kind]}
        </span>
        {display}
        {maxHp !== undefined && hp !== undefined && (
          <span className={`text-xs ${hp === 0 ? '' : 'opacity-80'}`}>
            {hp === 0 ? '💀' : `${hp}/${maxHp}`}
          </span>
        )}
        {data === null && (
          <span aria-hidden className="text-xs opacity-70" title={`"${refId}" not found in the compendium or homebrew`}>
            ?
          </span>
        )}
      </button>
      {anchor &&
        createPortal(
          <StatCard
            kind={kind}
            refId={refId}
            display={display}
            data={data}
            pool={pool}
            anchor={anchor}
            cur={cur}
            onClose={() => setAnchor(null)}
          />,
          document.body
        )}
    </>
  )
}

function StatCard({
  kind,
  refId,
  display,
  data,
  pool,
  anchor,
  cur,
  onClose
}: {
  kind: StatRefInline['kind']
  refId: string
  display: string
  data: Monster | Trap | null | undefined
  pool: string
  anchor: CardPlacement
  cur: number | undefined
  onClose: () => void
}) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const bumpOpen = useStatRefStore((s) => s.bumpOpen)
  const openCompendium = useStore((s) => s.openCompendium)

  // The teleprompter yields Space while a card is open; Esc / outside click
  // close. Mount-only with onClose behind a ref: if the deps churned, any
  // store update flushed mid-dispatch (e.g. another window listener calling
  // setState) would remove-and-re-add these listeners DURING the event, and a
  // listener removed mid-dispatch never receives that event — Esc would
  // silently miss the card.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    bumpOpen(1)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    const onDown = (e: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    // Defer so the opening click doesn't immediately close the card.
    const t = window.setTimeout(() => document.addEventListener('pointerdown', onDown), 0)
    return () => {
      bumpOpen(-1)
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const monster = kind === 'monster' && data ? (data as Monster) : null
  return (
    <div
      ref={cardRef}
      className="fixed z-50 flex flex-col overflow-hidden rounded-lg border border-hearth-border bg-hearth-panel shadow-2xl"
      style={{
        left: anchor.left,
        top: anchor.top,
        width: CARD_W,
        maxHeight: anchor.maxHeight,
        transform: anchor.above ? 'translateY(-100%)' : undefined
      }}
    >
      <div className="flex flex-none items-center gap-2 border-b border-hearth-border bg-hearth-panel2/60 px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-hearth-text">
          {display}
          {display !== (data?.name ?? refId) && data && (
            <span className="ml-1.5 font-normal text-hearth-muted">({data.name})</span>
          )}
        </span>
        {monster && (
          <button
            onClick={() => {
              onClose()
              openCompendium({ kind: 'monster', key: monster.key })
            }}
            className="flex-none rounded border border-hearth-border px-1.5 py-0.5 text-[10px] text-hearth-muted transition-colors hover:border-hearth-gold hover:text-hearth-gold"
            title="Open in the compendium"
          >
            📖
          </button>
        )}
        <button
          onClick={onClose}
          className="flex-none rounded border border-hearth-border px-1.5 py-0.5 text-[10px] text-hearth-muted transition-colors hover:border-hearth-gold hover:text-hearth-gold"
          title="Close (Esc)"
        >
          ✕
        </button>
      </div>
      {monster && <HpTracker pool={pool} max={monster.hp} cur={cur ?? monster.hp} />}
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-2.5">
        {data === undefined ? (
          <p className="py-4 text-center text-sm text-hearth-muted">Loading…</p>
        ) : data === null ? (
          <p className="py-4 text-sm text-hearth-muted">
            <span className="font-semibold text-hearth-text">“{refId}”</span> isn't in the compendium or this
            campaign's homebrew.{' '}
            {kind === 'monster'
              ? 'Add it to homebrew/monsters.json or fix the ref (⚙ on the chip in edit mode).'
              : 'Add it to homebrew/traps.json or fix the ref (⚙ on the chip in edit mode).'}
          </p>
        ) : monster ? (
          <MonsterStatBlock m={monster} />
        ) : (
          <TrapCard t={data as Trap} />
        )}
      </div>
    </div>
  )
}

/** HP bar + quick damage/heal. Session memory only — resets when Hearth restarts. */
function HpTracker({ pool, max, cur }: { pool: string; max: number; cur: number }) {
  const setHp = useStatRefStore((s) => s.setHp)
  const clearHp = useStatRefStore((s) => s.clearHp)
  const [amt, setAmt] = useState('')

  const apply = (sign: 1 | -1) => {
    const n = parseInt(amt, 10)
    const delta = Number.isFinite(n) && n > 0 ? n : 1 // empty box = 1
    setHp(pool, Math.max(0, Math.min(max, cur - sign * delta)))
    setAmt('')
  }

  const pct = max > 0 ? cur / max : 0
  const barColor = pct > 0.5 ? 'bg-emerald-500/80' : pct > 0.25 ? 'bg-amber-500/80' : 'bg-red-500/80'
  return (
    <div className="flex flex-none flex-col gap-1.5 border-b border-hearth-border bg-hearth-panel2/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold ${cur === 0 ? 'text-red-400' : 'text-hearth-text'}`}>
          {cur === 0 ? '💀 0' : cur}
          <span className="font-normal text-hearth-muted"> / {max} HP</span>
        </span>
        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-black/40">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct * 100}%` }} />
        </div>
        <button
          onClick={() => clearHp(pool)}
          title="Reset to full HP"
          className="flex-none rounded border border-hearth-border px-1.5 py-0.5 text-[10px] text-hearth-muted transition-colors hover:border-hearth-gold hover:text-hearth-gold"
        >
          ↺
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={1}
          placeholder="dmg"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply(1)
          }}
          className="w-16 rounded border border-hearth-border bg-hearth-bg px-1.5 py-0.5 text-sm text-hearth-text"
        />
        <button
          onClick={() => apply(1)}
          className="rounded border border-red-500/50 bg-red-500/10 px-2 py-0.5 text-xs text-red-300 transition-colors hover:bg-red-500/25"
          title="Subtract from HP (Enter in the box does this too)"
        >
          − Damage
        </button>
        <button
          onClick={() => apply(-1)}
          className="rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/25"
          title="Add to HP"
        >
          + Heal
        </button>
      </div>
    </div>
  )
}
