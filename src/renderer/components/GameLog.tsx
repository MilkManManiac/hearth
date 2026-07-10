import { useEffect, useRef, useState } from 'react'
import type { RollEvent } from '../../shared/types'
import { groupText, rollExpr } from '../../shared/dice'
import { submitRoll, useRollStore, wireRollFeed } from '../lib/rollStore'

// Game Log (D1): the campaign's shared roll feed — DDB's "everyone sees the
// nat 20 land". One RollLine renderer serves the DM tab and the player portal.

const timeFmt = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function RollLine({ r }: { r: RollEvent }) {
  return (
    <div
      className={`rounded-md border px-2 py-1.5 text-xs ${
        r.crit === 'crit'
          ? 'border-hearth-gold/60 bg-hearth-gold/10'
          : r.crit === 'fumble'
            ? 'border-red-500/40 bg-red-500/10'
            : 'border-hearth-border bg-hearth-panel2/40'
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-hearth-text">{r.who}</span>
        <span className="min-w-0 flex-1 truncate text-hearth-muted">{r.what}</span>
        {r.dmOnly && <span title="Only the DM sees this roll">🔒</span>}
        <span
          className={`text-base font-bold tabular-nums ${
            r.crit === 'crit' ? 'text-hearth-gold' : r.crit === 'fumble' ? 'text-red-300' : 'text-hearth-ember'
          }`}
        >
          {r.total}
        </span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-2 text-[10px] text-hearth-muted/70">
        <span className="min-w-0 flex-1 truncate">
          {r.expr} · {r.groups.map(groupText).join(' + ')}
          {r.modifier !== 0 ? ` ${r.modifier > 0 ? '+' : ''}${r.modifier}` : ''}
        </span>
        {r.crit === 'crit' && <span className="font-bold text-hearth-gold">NAT 20!</span>}
        {r.crit === 'fumble' && <span className="font-bold text-red-300">nat 1</span>}
        <span>{timeFmt(r.ts)}</span>
      </div>
    </div>
  )
}

/** Scrolling roll list, newest at the bottom, auto-follows unless scrolled up. */
export function RollFeed({ rolls }: { rolls: RollEvent[] }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  useEffect(() => {
    const el = boxRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [rolls])
  return (
    <div
      ref={boxRef}
      onScroll={(e) => {
        const el = e.currentTarget
        stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      }}
      className="flex-1 space-y-1.5 overflow-y-auto pr-1"
    >
      {rolls.length === 0 ? (
        <p className="pt-6 text-center text-xs text-hearth-muted/60">
          No rolls yet — click any number on a sheet or stat block.
        </p>
      ) : (
        rolls.map((r) => <RollLine key={r.id} r={r} />)
      )}
    </div>
  )
}

/** The DM app's 🎲 right-panel tab: shared feed + DM dice tray. */
export default function GameLogPanel() {
  const rolls = useRollStore((s) => s.rolls)
  const dmPublic = useRollStore((s) => s.dmPublic)
  const setDmPublic = useRollStore((s) => s.setDmPublic)
  const [expr, setExpr] = useState('')
  const [bad, setBad] = useState(false)
  useEffect(() => wireRollFeed(), [])

  const rollTray = () => {
    const roll = rollExpr(expr || '1d20', { who: 'DM', what: expr || '1d20', dmOnly: !dmPublic })
    if (!roll) {
      setBad(true)
      return
    }
    setBad(false)
    setExpr('')
    submitRoll(roll)
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">Game Log</span>
        <label
          className="ml-auto flex items-center gap-1 text-[10px] text-hearth-muted"
          title="Off = your rolls are 🔒 DM-only (players never see them). On = they stream to the portal + Discord like player rolls."
        >
          <input type="checkbox" checked={dmPublic} onChange={(e) => setDmPublic(e.target.checked)} className="h-3 w-3 accent-hearth-ember" />
          DM rolls public
        </label>
      </div>
      <RollFeed rolls={rolls} />
      <div className="flex gap-1">
        <input
          value={expr}
          onChange={(e) => {
            setExpr(e.target.value)
            setBad(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && rollTray()}
          placeholder="2d6+3, 1d20+5, 8d6…"
          className={`min-w-0 flex-1 rounded border bg-hearth-bg px-2 py-1 text-xs text-hearth-text placeholder:text-hearth-muted/40 focus:outline-none ${
            bad ? 'border-red-500/60' : 'border-hearth-border focus:border-hearth-ember'
          }`}
        />
        <button
          onClick={rollTray}
          className="rounded border border-hearth-ember bg-hearth-ember/15 px-2.5 py-1 text-xs text-hearth-ember hover:bg-hearth-ember/30"
          title={dmPublic ? 'Roll (players see it)' : 'Roll (DM-only 🔒)'}
        >
          🎲 Roll
        </button>
      </div>
    </div>
  )
}
