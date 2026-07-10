import { useEffect, useMemo, useState } from 'react'
import type { Combatant, Encounter, Scene } from '../../shared/types'
import { formatCR, loadMonsters, type Monster } from '../lib/compendium'
import { fuzzyScore } from '../lib/fuzzy'
import { rateEncounter } from '../lib/encounter'
import { rollExpr, d20Expr } from '../../shared/dice'
import { submitRoll, useRollStore } from '../lib/rollStore'
import { useStore } from '../store'

const EMPTY: Encounter = { combatants: [], round: 0, turn: -1 }
const d20 = () => Math.floor(Math.random() * 20) + 1

const SIDE_STYLE: Record<Combatant['side'], string> = {
  foe: 'border-red-500/40',
  ally: 'border-emerald-500/40',
  pc: 'border-hearth-gold/40'
}

/**
 * ⚔ Encounter tracker (ONESTOP-PLAN C2): combatants = compendium monsters +
 * PCs/allies, roll initiative, walk turns/rounds, tick HP and round-timed
 * conditions — all persisted on the scene so prep survives restarts. The 2024
 * XP budget readout rates the fight while you stock it.
 */
export default function EncounterPanel({ scene }: { scene: Scene }) {
  const updateScene = useStore((s) => s.updateScene)
  const openCompendium = useStore((s) => s.openCompendium)
  const partyChars = useStore((s) => s.campaign.characters)
  const updateCharacter = useStore((s) => s.updateCharacter)
  const enc = scene.encounter ?? EMPTY

  const [monsters, setMonsters] = useState<Monster[] | null>(null)
  const [query, setQuery] = useState('')
  const [pcDraft, setPcDraft] = useState('')
  const [partySize, setPartySize] = useState(() => Number(localStorage.getItem('hearth:partySize')) || 3)
  const [partyLevel, setPartyLevel] = useState(() => Number(localStorage.getItem('hearth:partyLevel')) || 5)

  useEffect(() => {
    loadMonsters().then(setMonsters).catch(() => setMonsters([]))
  }, [])

  const mutate = (fn: (e: Encounter) => Encounter) =>
    updateScene(scene.id, (s) => ({ ...s, encounter: fn(s.encounter ?? EMPTY) }))

  // --- adding -----------------------------------------------------------------
  const monsterHits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !monsters) return []
    return monsters
      .map((m) => ({ m, score: fuzzyScore(m.name, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
  }, [query, monsters])

  const addMonster = (m: Monster) => {
    setQuery('')
    mutate((e) => {
      const n = e.combatants.filter((c) => c.ref === m.key).length
      return {
        ...e,
        combatants: [
          ...e.combatants,
          {
            id: crypto.randomUUID(),
            name: n > 0 ? `${m.name} ${n + 1}` : m.name,
            ref: m.key,
            side: 'foe',
            maxHp: m.hp,
            hp: m.hp,
            ac: m.ac,
            initBonus: m.initiative ?? Math.floor((m.abilities.dex - 10) / 2),
            xp: m.xp,
            conditions: []
          }
        ]
      }
    })
  }

  const addPc = (characterId?: string) => {
    const char = characterId ? partyChars.find((x) => x.id === characterId) : undefined
    const name = char?.name ?? pcDraft.trim()
    if (!name) return
    setPcDraft('')
    mutate((e) => ({
      ...e,
      combatants: [
        ...e.combatants,
        {
          id: crypto.randomUUID(),
          name,
          characterId: char?.id,
          side: 'pc',
          maxHp: char?.maxHp ?? 0,
          hp: char?.hp ?? 0,
          ac: char?.ac,
          initBonus: char ? Math.floor((char.abilities.dex - 10) / 2) : 0,
          conditions: []
        }
      ]
    }))
  }

  // --- initiative / turns -------------------------------------------------------
  const ordered = useMemo(
    () => [...enc.combatants].sort((a, b) => (b.initiative ?? -99) - (a.initiative ?? -99)),
    [enc.combatants]
  )

  const rollInitiative = () => {
    // Roll through the dice engine so initiative lands in the Game Log
    // (DM-visibility follows the log's "DM rolls public" toggle).
    const dmOnly = !useRollStore.getState().dmPublic
    const rolled = new Map<string, number>()
    for (const c of enc.combatants) {
      if (c.side === 'pc' && c.initiative != null) continue
      const roll = rollExpr(d20Expr(c.initBonus ?? 0), { who: 'DM', what: `${c.name} — initiative`, dmOnly })
      rolled.set(c.id, roll ? roll.total : d20() + (c.initBonus ?? 0))
      if (roll) submitRoll(roll)
    }
    mutate((e) => ({
      ...e,
      round: 1,
      turn: 0,
      combatants: e.combatants.map((c) =>
        // PCs keep hand-entered rolls; monsters/allies roll d20 + bonus.
        rolled.has(c.id) ? { ...c, initiative: rolled.get(c.id) } : c
      )
    }))
  }

  const nextTurn = (dir: 1 | -1) =>
    mutate((e) => {
      if (e.combatants.length === 0) return e
      let turn = (e.turn < 0 ? 0 : e.turn) + dir
      let round = e.round || 1
      if (turn >= e.combatants.length) {
        turn = 0
        round++
      } else if (turn < 0) {
        turn = e.combatants.length - 1
        round = Math.max(1, round - 1)
      }
      // Round-timed conditions expire as the round advances past them.
      const combatants =
        dir === 1 && turn === 0
          ? e.combatants.map((c) => ({
              ...c,
              conditions: (c.conditions ?? []).filter((x) => x.untilRound == null || x.untilRound >= round)
            }))
          : e.combatants
      return { ...e, turn, round, combatants }
    })

  const endFight = () => mutate((e) => ({ ...e, round: 0, turn: -1, combatants: e.combatants.map((c) => ({ ...c, initiative: undefined })) }))

  const patch = (id: string, p: Partial<Combatant>) =>
    mutate((e) => ({ ...e, combatants: e.combatants.map((c) => (c.id === id ? { ...c, ...p } : c)) }))

  /** Linked PCs mirror their character sheet — the tracker never forks HP. */
  const withLiveState = (c: Combatant): Combatant => {
    if (!c.characterId) return c
    const char = partyChars.find((x) => x.id === c.characterId)
    if (!char) return c
    return { ...c, name: char.name, hp: char.hp, maxHp: char.maxHp, ac: char.ac }
  }

  const patchHp = (c: Combatant, hp: number) => {
    if (c.characterId) void updateCharacter(c.characterId, (x) => ({ ...x, hp }))
    else patch(c.id, { hp })
  }

  const totalXp = enc.combatants.filter((c) => c.side === 'foe').reduce((s, c) => s + (c.xp ?? 0), 0)
  const rating = rateEncounter(totalXp, partySize, partyLevel)
  const live = enc.turn >= 0

  return (
    <div className="space-y-2 text-sm">
      {/* Budget + party */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-hearth-muted">
        <select
          value={partySize}
          onChange={(e) => {
            setPartySize(Number(e.target.value))
            localStorage.setItem('hearth:partySize', e.target.value)
          }}
          className="rounded border border-hearth-border bg-hearth-panel2 px-1 py-0.5"
          title="Party size"
        >
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <option key={n} value={n}>
              {n} PCs
            </option>
          ))}
        </select>
        <select
          value={partyLevel}
          onChange={(e) => {
            setPartyLevel(Number(e.target.value))
            localStorage.setItem('hearth:partyLevel', e.target.value)
          }}
          className="rounded border border-hearth-border bg-hearth-panel2 px-1 py-0.5"
          title="Party level"
        >
          {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              lvl {n}
            </option>
          ))}
        </select>
        <span
          className={`rounded-full px-2 py-0.5 ${
            rating.tone === 'hot'
              ? 'bg-red-500/15 text-red-300'
              : rating.tone === 'warn'
                ? 'bg-hearth-gold/15 text-hearth-gold'
                : 'bg-emerald-500/10 text-emerald-300'
          }`}
          title="2024 DMG XP budget (flat sum — no group multipliers)"
        >
          {totalXp.toLocaleString()} XP · {rating.label}
        </span>
      </div>

      {/* Turn controls */}
      {enc.combatants.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {!live ? (
            <button
              onClick={rollInitiative}
              className="rounded border border-hearth-ember bg-hearth-ember/15 px-2 py-0.5 text-xs text-hearth-ember hover:bg-hearth-ember/30"
              title="Roll d20 + bonus for monsters/allies; PCs keep hand-entered values"
            >
              🎲 Roll initiative
            </button>
          ) : (
            <>
              <span className="rounded-full bg-hearth-ember/15 px-2 py-0.5 text-xs text-hearth-ember">Round {enc.round}</span>
              <button onClick={() => nextTurn(-1)} className="rounded border border-hearth-border px-1.5 py-0.5 text-xs text-hearth-muted hover:text-hearth-text" title="Back one turn">
                ◂
              </button>
              <button onClick={() => nextTurn(1)} className="rounded border border-hearth-ember bg-hearth-ember/15 px-2 py-0.5 text-xs text-hearth-ember hover:bg-hearth-ember/30" title="Next turn">
                Next ▸
              </button>
              <button onClick={endFight} className="ml-auto rounded border border-hearth-border px-1.5 py-0.5 text-[10px] text-hearth-muted hover:text-hearth-text" title="End combat (keeps the roster, clears initiative)">
                ⏹ End
              </button>
            </>
          )}
        </div>
      )}

      {/* Roster */}
      <ul className="space-y-1">
        {(live ? ordered : enc.combatants).map(withLiveState).map((c, i) => (
          <CombatantRow
            key={c.id}
            c={c}
            onHp={(hp) => patchHp(c, hp)}
            active={live && i === enc.turn}
            round={enc.round}
            onPatch={(p) => patch(c.id, p)}
            onRemove={() => mutate((e) => ({ ...e, combatants: e.combatants.filter((x) => x.id !== c.id) }))}
            onStatBlock={c.ref ? () => openCompendium({ kind: 'monster', key: c.ref! }) : undefined}
          />
        ))}
      </ul>
      {enc.combatants.length === 0 && (
        <p className="text-xs text-hearth-muted">
          Stock the fight: search a monster below (SRD stats auto-fill) and add your PCs by name.
        </p>
      )}

      {/* Add rows — deliberately available in run mode too: fights get
          stocked mid-session ("two more goblins burst in"). */}
      {
        <div className="space-y-1.5 border-t border-hearth-border pt-2">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Add monster (SRD search)…"
              className="w-full rounded border border-hearth-border bg-hearth-bg px-2 py-1 text-sm text-hearth-text placeholder:text-hearth-muted focus:border-hearth-ember focus:outline-none"
            />
            {monsterHits.length > 0 && (
              <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-hearth-border bg-hearth-panel2 shadow-2xl">
                {monsterHits.map(({ m }) => (
                  <button
                    key={m.key}
                    onClick={() => addMonster(m)}
                    className="flex w-full items-baseline gap-2 px-2.5 py-1 text-left text-sm text-hearth-text hover:bg-hearth-ember/15"
                  >
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <span className="flex-none text-[10px] text-hearth-muted">
                      CR {formatCR(m.cr)} · {m.hp} HP · AC {m.ac}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {partyChars.filter((ch) => !enc.combatants.some((c) => c.characterId === ch.id)).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {partyChars
                .filter((ch) => !enc.combatants.some((c) => c.characterId === ch.id))
                .map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => addPc(ch.id)}
                    title={`Add ${ch.name} — linked to their sheet (HP syncs both ways)`}
                    className="rounded-full border border-hearth-gold/50 bg-hearth-gold/10 px-2 py-0.5 text-xs text-hearth-gold hover:bg-hearth-gold/25"
                  >
                    + {ch.name}
                  </button>
                ))}
            </div>
          )}
          <div className="flex gap-1">
            <input
              value={pcDraft}
              onChange={(e) => setPcDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPc()}
              placeholder="Add unlinked ally by name…"
              className="min-w-0 flex-1 rounded border border-hearth-border bg-hearth-bg px-2 py-1 text-sm text-hearth-text placeholder:text-hearth-muted focus:border-hearth-ember focus:outline-none"
            />
            <button onClick={() => addPc()} className="rounded border border-hearth-border bg-hearth-panel2 px-2 text-sm text-hearth-muted hover:text-hearth-ember">
              +
            </button>
          </div>
        </div>
      }
    </div>
  )
}

function CombatantRow({
  c,
  active,
  round,
  onPatch,
  onRemove,
  onStatBlock,
  onHp
}: {
  c: Combatant
  active: boolean
  round: number
  onPatch: (p: Partial<Combatant>) => void
  onRemove: () => void
  onStatBlock?: () => void
  onHp: (hp: number) => void
}) {
  const [dmg, setDmg] = useState('')
  const [condDraft, setCondDraft] = useState('')
  const dead = c.maxHp > 0 && c.hp <= 0

  const applyHp = (sign: 1 | -1) => {
    const n = parseInt(dmg, 10)
    if (!Number.isFinite(n) || n <= 0) return
    setDmg('')
    onHp(Math.min(c.maxHp || 999, Math.max(0, c.hp + sign * n)))
  }

  const addCond = () => {
    const raw = condDraft.trim()
    if (!raw) return
    setCondDraft('')
    // "poisoned 3" = expires after 3 rounds; bare name = until removed.
    const m = /^(.*?)\s+(\d+)$/.exec(raw)
    const cond = m ? { name: m[1], untilRound: round + parseInt(m[2], 10) } : { name: raw }
    onPatch({ conditions: [...(c.conditions ?? []), cond] })
  }

  return (
    <li
      className={`group rounded border bg-hearth-panel2/40 px-2 py-1 ${SIDE_STYLE[c.side]} ${
        active ? 'ring-1 ring-hearth-ember shadow-[0_0_8px_rgba(255,140,60,0.3)]' : ''
      } ${dead ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={c.initiative ?? ''}
          onChange={(e) => onPatch({ initiative: e.target.value === '' ? undefined : Number(e.target.value) })}
          placeholder="—"
          title={`Initiative (bonus ${c.initBonus != null && c.initBonus >= 0 ? '+' : ''}${c.initBonus ?? 0})`}
          className="w-9 flex-none rounded border border-hearth-border bg-hearth-bg px-1 py-0.5 text-center text-xs text-hearth-text [appearance:textfield]"
        />
        <button
          onClick={onStatBlock}
          disabled={!onStatBlock}
          className={`min-w-0 flex-1 truncate text-left text-sm ${dead ? 'line-through' : ''} ${
            onStatBlock ? 'text-hearth-text hover:text-hearth-ember' : 'text-hearth-text'
          }`}
          title={onStatBlock ? 'Open the stat block (📖)' : undefined}
        >
          {c.name}
          {dead ? ' ☠' : ''}
        </button>
        {c.ac != null && (
          <span className="flex-none text-[10px] text-hearth-muted" title="AC">
            🛡{c.ac}
          </span>
        )}
        {c.maxHp > 0 && (
          <span
            className={`flex-none text-[11px] tabular-nums ${c.hp <= c.maxHp / 2 ? 'text-red-300' : 'text-hearth-muted'}`}
            title="HP / max"
          >
            {c.hp}/{c.maxHp}
          </span>
        )}
        <button onClick={onRemove} className="flex-none px-0.5 text-hearth-muted opacity-40 hover:text-red-400 group-hover:opacity-100" title="Remove">
          ×
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1 pl-10">
        {(c.conditions ?? []).map((x, i) => (
          <button
            key={`${x.name}:${i}`}
            onClick={() => onPatch({ conditions: (c.conditions ?? []).filter((_, j) => j !== i) })}
            className="rounded-full bg-purple-500/15 px-1.5 py-px text-[10px] text-purple-300 hover:bg-red-500/20 hover:text-red-300"
            title={`${x.name}${x.untilRound != null ? ` — ends after round ${x.untilRound}` : ''} · click to clear`}
          >
            {x.name}
            {x.untilRound != null ? ` ⏳${x.untilRound}` : ''}
          </button>
        ))}
        <input
          value={condDraft}
          onChange={(e) => setCondDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCond()}
          placeholder="+condition (name [rounds])"
          className="w-36 rounded border border-transparent bg-transparent px-1 py-px text-[10px] text-hearth-muted placeholder:text-hearth-muted/40 focus:border-hearth-border focus:outline-none"
        />
        {c.maxHp > 0 && (
          <span className="ml-auto flex items-center gap-0.5">
            <input
              value={dmg}
              onChange={(e) => setDmg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyHp(-1)
              }}
              placeholder="dmg"
              className="w-11 rounded border border-hearth-border bg-hearth-bg px-1 py-px text-center text-[11px] text-hearth-text placeholder:text-hearth-muted/40 focus:outline-none"
            />
            <button onClick={() => applyHp(-1)} className="rounded bg-red-500/15 px-1 text-[11px] text-red-300 hover:bg-red-500/30" title="Damage (Enter)">
              −
            </button>
            <button onClick={() => applyHp(1)} className="rounded bg-emerald-500/15 px-1 text-[11px] text-emerald-300 hover:bg-emerald-500/30" title="Heal">
              +
            </button>
          </span>
        )}
      </div>
    </li>
  )
}
