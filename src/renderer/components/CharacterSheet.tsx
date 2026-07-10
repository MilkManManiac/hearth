import { useEffect, useMemo, useState } from 'react'
import type { AbilityScores, Character, RollEvent } from '../../shared/types'
import { d20Expr, groupText, rollExpr } from '../../shared/dice'
import {
  ABILITY_KEYS,
  ABILITY_LABEL,
  classLevels,
  fmtMod,
  mod,
  passive,
  profBonus,
  saveBonus,
  skillBonus,
  SKILL_ABILITY,
  spellSlots,
  suggestedMaxHp,
  type AbilityKey
} from '../lib/character'
import { loadSpells, SPELL_LEVEL_LABEL, type ClassEntry, type NamedEntry, type Spell } from '../lib/compendium'
import { fuzzyScore } from '../lib/fuzzy'
import { pendingChoices } from '../lib/builder'
import { expectedSpells } from '../lib/progression'
import LevelUpModal from './LevelUp'

// The one character sheet, shared by the DM's 🛡 Party panel (Electron) and
// the browser-based player portal — everything flows through the `onPatch`
// callback so the surface decides how saves happen (IPC vs HTTP).

export const CASTING_ABILITY: Record<string, AbilityKey> = {
  bard: 'cha', cleric: 'wis', druid: 'wis', paladin: 'cha',
  ranger: 'wis', sorcerer: 'cha', warlock: 'cha', wizard: 'int'
}

export interface SheetCallbacks {
  onPatch: (p: Partial<Character>) => void
  /** Open a spell's card (DM: compendium deep-link; player: inline modal). */
  onOpenSpell?: (key: string) => void
  onOpenSpecies?: (key: string) => void
  /** Send a roll to the campaign Game Log (D1). Absent = no dice on this surface. */
  onRoll?: (roll: RollEvent) => void
}

type RollMode = 'adv' | 'dis' | null

export default function CharacterSheet({
  c,
  classes,
  species,
  backgrounds,
  cb,
  headerExtra
}: {
  c: Character
  classes: ClassEntry[]
  species: NamedEntry[]
  backgrounds: NamedEntry[]
  cb: SheetCallbacks
  /** Rendered beside the name (the DM panel puts its delete button here). */
  headerExtra?: React.ReactNode
}) {
  const patch = cb.onPatch
  const cls = classes.find((x) => x.key === c.classKey)
  const subclasses = classes.filter((x) => x.subclassOf === c.classKey)
  const sub = classes.find((x) => x.key === c.subclassKey)
  const pb = profBonus(c.level)
  const levels = classLevels(c)
  const slots = spellSlots(c, classes)
  // Spell DC/attack use the primary class's casting ability, or the first caster class.
  const castKey = levels.map((e) => e.classKey).find((k) => k && k in CASTING_ABILITY)
  const castAbility = castKey ? CASTING_ABILITY[castKey] : undefined
  const spellDc = castAbility ? 8 + pb + mod(c.abilities[castAbility]) : null
  const spellAtk = castAbility ? pb + mod(c.abilities[castAbility]) : null
  const hpSuggest = suggestedMaxHp(c, cls?.hitDice)
  // Each class contributes its features gated by ITS class level (not the total).
  const features = levels
    .flatMap(({ classKey, subclassKey, level }) => {
      const k = classes.find((x) => x.key === classKey)
      const s = classes.find((x) => x.key === subclassKey)
      return [...(k?.features ?? []), ...(s?.features ?? [])].map((f) => ({ f, clsLevel: level }))
    })
    .filter(({ f, clsLevel }) => f.levels.length === 0 || f.levels.some((l) => l <= clsLevel))
    .sort(
      (a, b) =>
        Math.min(...(a.f.levels.length ? a.f.levels : [0])) - Math.min(...(b.f.levels.length ? b.f.levels : [0]))
    )
  const classLabel = levels
    .map(({ classKey, subclassKey, level }) => {
      const k = classes.find((x) => x.key === classKey)
      const s = classes.find((x) => x.key === subclassKey)
      return k ? `${k.name}${s ? ` (${s.name})` : ''} ${level}` : null
    })
    .filter(Boolean)
    .join(' / ')

  // --- Builder (D2): owed-choices chips + level-up + score helper.
  const [allSpells, setAllSpells] = useState<Spell[] | null>(null)
  useEffect(() => {
    loadSpells().then(setAllSpells).catch(() => setAllSpells([]))
  }, [])
  const chips = useMemo(() => pendingChoices(c, classes, allSpells), [c, classes, allSpells])
  const spellCounts = useMemo(() => {
    const exp = expectedSpells(levels)
    if (!allSpells || (exp.cantrips === 0 && exp.prepared === 0)) return null
    const byKey = new Map(allSpells.map((s) => [s.key, s]))
    let cantrips = 0
    let leveled = 0
    for (const k of c.spells ?? []) {
      const s = byKey.get(k)
      if (!s) continue
      if (s.level === 0) cantrips++
      else leveled++
    }
    return { cantrips, leveled, exp }
  }, [allSpells, c.spells, levels])
  const [levelUpOpen, setLevelUpOpen] = useState(false)
  const [scoresOpen, setScoresOpen] = useState(false)

  // --- Dice (D1): every derived number is a roll button when onRoll is wired.
  const [rollMode, setRollMode] = useState<RollMode>(null)
  const [lastRoll, setLastRoll] = useState<RollEvent | null>(null)
  const canRoll = !!cb.onRoll
  const doRoll = (what: string, bonus: number) => {
    if (!cb.onRoll) return
    const roll = rollExpr(d20Expr(bonus), {
      who: c.name || 'Unnamed',
      characterId: c.id,
      what,
      mode: rollMode ?? undefined
    })
    if (!roll) return
    setLastRoll(roll)
    setRollMode(null) // adv/dis is per-roll, armed then consumed (visible, unlike DDB's right-click)
    cb.onRoll(roll)
  }

  const [dmg, setDmg] = useState('')
  const applyHp = (sign: 1 | -1) => {
    const n = parseInt(dmg, 10)
    if (!Number.isFinite(n) || n <= 0) return
    setDmg('')
    if (sign === -1 && (c.tempHp ?? 0) > 0) {
      // Temp HP absorbs first (2024 rules).
      const fromTemp = Math.min(c.tempHp ?? 0, n)
      const rest = n - fromTemp
      patch({ tempHp: (c.tempHp ?? 0) - fromTemp, hp: Math.max(0, c.hp - rest) })
      return
    }
    patch({ hp: Math.min(c.maxHp, Math.max(0, c.hp + sign * n)) })
  }

  const longRest = () =>
    patch({
      hp: c.maxHp,
      tempHp: 0,
      slotsUsed: {},
      usesSpent: {},
      concentratingOn: undefined,
      deathSaves: { success: 0, fail: 0 },
      hitDiceSpent: Math.max(0, (c.hitDiceSpent ?? 0) - Math.max(1, Math.floor(c.level / 2)))
    })

  const shortRest = () => {
    // Warlock Pact slots return; short-rest counters reset.
    const uses = { ...c.usesSpent }
    for (const u of c.limitedUses ?? []) {
      if (u.reset === 'short') delete uses[u.name]
    }
    patch({
      slotsUsed: levels.some((e) => e.classKey === 'warlock') ? {} : c.slotsUsed,
      usesSpent: uses
    })
  }

  return (
    <div className="space-y-4 text-sm">
      {/* Identity row */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={c.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="min-w-0 flex-1 rounded bg-transparent font-display text-2xl font-semibold text-hearth-text focus:outline-none focus:ring-1 focus:ring-hearth-ember/50"
        />
        <input
          value={c.player ?? ''}
          onChange={(e) => patch({ player: e.target.value || undefined })}
          placeholder="player"
          className="w-24 rounded border border-hearth-border bg-hearth-bg px-2 py-1 text-xs text-hearth-muted placeholder:text-hearth-muted/40"
        />
        {headerExtra}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select value={c.classKey ?? ''} onChange={(e) => patch({ classKey: e.target.value || undefined, subclassKey: undefined })} className="rounded border border-hearth-border bg-hearth-panel2 px-1.5 py-1 text-hearth-text">
          <option value="">— class —</option>
          {classes.filter((x) => !x.subclassOf).map((x) => (
            <option key={x.key} value={x.key}>{x.name}</option>
          ))}
        </select>
        {subclasses.length > 0 && (
          <select value={c.subclassKey ?? ''} onChange={(e) => patch({ subclassKey: e.target.value || undefined })} className="rounded border border-hearth-border bg-hearth-panel2 px-1.5 py-1 text-hearth-text">
            <option value="">— subclass —</option>
            {subclasses.map((x) => (
              <option key={x.key} value={x.key}>{x.name}</option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1 text-hearth-muted">
          Level
          <input
            type="number"
            min={1}
            max={20}
            value={c.level}
            onChange={(e) => patch({ level: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })}
            title="TOTAL level (all classes) — features, proficiency bonus, and spell slots follow"
            className="w-12 rounded border border-hearth-border bg-hearth-bg px-1 py-0.5 text-center text-hearth-text"
          />
        </label>
        {(c.multiclass ?? []).map((mc, i) => {
          const mcSubs = classes.filter((x) => x.subclassOf === mc.classKey)
          const setMc = (p: Partial<{ classKey?: string; subclassKey?: string; level: number }>) =>
            patch({ multiclass: (c.multiclass ?? []).map((x, j) => (j === i ? { ...x, ...p } : x)) })
          return (
            <span key={i} className="flex items-center gap-1 rounded border border-hearth-border/60 bg-hearth-panel2/50 px-1 py-0.5">
              <span className="text-hearth-muted/60">＋</span>
              <select value={mc.classKey ?? ''} onChange={(e) => setMc({ classKey: e.target.value || undefined, subclassKey: undefined })} className="rounded border border-hearth-border bg-hearth-panel2 px-1 py-0.5 text-hearth-text">
                <option value="">— class —</option>
                {classes.filter((x) => !x.subclassOf).map((x) => (
                  <option key={x.key} value={x.key}>{x.name}</option>
                ))}
              </select>
              {mcSubs.length > 0 && (
                <select value={mc.subclassKey ?? ''} onChange={(e) => setMc({ subclassKey: e.target.value || undefined })} className="rounded border border-hearth-border bg-hearth-panel2 px-1 py-0.5 text-hearth-text">
                  <option value="">— subclass —</option>
                  {mcSubs.map((x) => (
                    <option key={x.key} value={x.key}>{x.name}</option>
                  ))}
                </select>
              )}
              <input
                type="number"
                min={1}
                max={19}
                value={mc.level}
                onChange={(e) => setMc({ level: Math.min(19, Math.max(1, Number(e.target.value) || 1)) })}
                title="Levels in this class (the primary class gets the rest of the total)"
                className="w-10 rounded border border-hearth-border bg-hearth-bg px-1 py-0.5 text-center text-hearth-text"
              />
              <button
                onClick={() => patch({ multiclass: (c.multiclass ?? []).filter((_, j) => j !== i).length ? (c.multiclass ?? []).filter((_, j) => j !== i) : undefined })}
                className="text-hearth-muted hover:text-red-400"
                title="Remove this class"
              >
                ×
              </button>
            </span>
          )
        })}
        <button
          onClick={() => patch({ multiclass: [...(c.multiclass ?? []), { level: 1 }] })}
          className="rounded border border-dashed border-hearth-border px-1.5 py-0.5 text-hearth-muted hover:text-hearth-text"
          title="Multiclass: add levels in a second class"
        >
          + class
        </button>
        <select value={c.speciesKey ?? ''} onChange={(e) => patch({ speciesKey: e.target.value || undefined })} className="rounded border border-hearth-border bg-hearth-panel2 px-1.5 py-1 text-hearth-text">
          <option value="">— species —</option>
          {species.map((x) => (
            <option key={x.key} value={x.key}>{x.name}</option>
          ))}
        </select>
        <select value={c.backgroundKey ?? ''} onChange={(e) => patch({ backgroundKey: e.target.value || undefined })} className="rounded border border-hearth-border bg-hearth-panel2 px-1.5 py-1 text-hearth-text">
          <option value="">— background —</option>
          {backgrounds.map((x) => (
            <option key={x.key} value={x.key}>{x.name}</option>
          ))}
        </select>
        <button
          onClick={() => setLevelUpOpen(true)}
          title="Level up — shows exactly what the next level grants, applies HP, lists your choices"
          className="rounded border border-hearth-gold/50 bg-hearth-gold/10 px-2 py-1 text-hearth-gold hover:bg-hearth-gold/25"
        >
          ⬆ Level up
        </button>
        <span className="text-hearth-muted">PB +{pb}</span>
        {(c.multiclass?.length ?? 0) > 0 && (
          <span className="text-hearth-muted/70" title="Class split (primary class gets the remainder of the total level)">
            {classLabel}
          </span>
        )}
        {c.speciesKey && cb.onOpenSpecies && (
          <button onClick={() => cb.onOpenSpecies!(c.speciesKey!)} className="text-hearth-gold hover:text-hearth-ember" title="Species traits (📖)">
            📖
          </button>
        )}
      </div>

      {/* Vitals */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-hearth-border bg-hearth-panel2/40 px-3 py-2">
        <label className="flex items-center gap-1 text-xs text-hearth-muted">
          AC
          <input type="number" value={c.ac} onChange={(e) => patch({ ac: Number(e.target.value) || 0 })} className="w-12 rounded border border-hearth-border bg-hearth-bg px-1 py-0.5 text-center text-sm text-hearth-text" />
        </label>
        <label className="flex items-center gap-1 text-xs text-hearth-muted">
          HP
          <span className="text-sm text-hearth-text">{c.hp}</span>/
          <input
            type="number"
            value={c.maxHp}
            onChange={(e) => patch({ maxHp: Number(e.target.value) || 0, hp: Math.min(c.hp, Number(e.target.value) || 0) })}
            title={hpSuggest != null ? `Suggested max for ${cls?.name} ${c.level} (fixed HP): ${hpSuggest}` : undefined}
            className="w-14 rounded border border-hearth-border bg-hearth-bg px-1 py-0.5 text-center text-sm text-hearth-text"
          />
          {hpSuggest != null && hpSuggest !== c.maxHp && (
            <button onClick={() => patch({ maxHp: hpSuggest, hp: Math.min(c.hp, hpSuggest) })} className="text-[10px] text-hearth-gold hover:text-hearth-ember" title="Apply the suggested max HP">
              → {hpSuggest}
            </button>
          )}
        </label>
        <label className="flex items-center gap-1 text-xs text-hearth-muted">
          Temp
          <input type="number" value={c.tempHp ?? 0} onChange={(e) => patch({ tempHp: Math.max(0, Number(e.target.value) || 0) || undefined })} className="w-12 rounded border border-hearth-border bg-hearth-bg px-1 py-0.5 text-center text-sm text-hearth-text" />
        </label>
        <span className="flex items-center gap-0.5">
          <input
            value={dmg}
            onChange={(e) => setDmg(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyHp(-1)}
            placeholder="dmg/heal"
            className="w-16 rounded border border-hearth-border bg-hearth-bg px-1 py-0.5 text-center text-xs text-hearth-text placeholder:text-hearth-muted/40"
          />
          <button onClick={() => applyHp(-1)} className="rounded bg-red-500/15 px-1.5 text-sm text-red-300 hover:bg-red-500/30" title="Damage (temp HP absorbs first)">−</button>
          <button onClick={() => applyHp(1)} className="rounded bg-emerald-500/15 px-1.5 text-sm text-emerald-300 hover:bg-emerald-500/30" title="Heal">+</button>
        </span>
        <label className="flex items-center gap-1 text-xs text-hearth-muted" title="Hit dice spent / total">
          HD {c.hitDiceSpent ?? 0}/{c.level}
          <button onClick={() => patch({ hitDiceSpent: Math.min(c.level, (c.hitDiceSpent ?? 0) + 1) })} className="rounded bg-hearth-bg px-1 hover:text-hearth-ember">spend</button>
        </label>
        <button onClick={() => patch({ inspiration: !c.inspiration })} className={`rounded-full border px-2 py-0.5 text-xs ${c.inspiration ? 'border-hearth-gold bg-hearth-gold/20 text-hearth-gold' : 'border-hearth-border text-hearth-muted'}`} title="Heroic Inspiration">
          ✨ Insp
        </button>
        {canRoll && (
          <button
            onClick={() => doRoll('Initiative', mod(c.abilities.dex))}
            title={`Roll initiative (1d20${fmtMod(mod(c.abilities.dex))})`}
            className="rounded border border-hearth-border px-2 py-0.5 text-xs text-hearth-muted hover:border-hearth-ember hover:text-hearth-ember"
          >
            ⚡ Init {fmtMod(mod(c.abilities.dex))}
          </button>
        )}
        {c.concentratingOn && (
          <button
            onClick={() => patch({ concentratingOn: undefined })}
            title="Concentrating — casting another concentration spell replaces this; click to drop"
            className="rounded-full border border-purple-400/60 bg-purple-500/15 px-2 py-0.5 text-xs text-purple-300 hover:bg-red-500/20 hover:text-red-300"
          >
            🧠 {c.concentratingOn} ✕
          </button>
        )}
        <span className="ml-auto flex gap-1.5">
          <button onClick={shortRest} className="rounded border border-hearth-border px-2 py-0.5 text-xs text-hearth-muted hover:text-hearth-text" title="Short rest: warlock Pact slots + short-rest features return">
            🌙 Short rest
          </button>
          <button onClick={longRest} className="rounded border border-hearth-ember bg-hearth-ember/15 px-2 py-0.5 text-xs text-hearth-ember hover:bg-hearth-ember/30" title="Long rest: full HP, all slots, half your hit dice back">
            ☀️ Long rest
          </button>
        </span>
      </div>

      {c.hp === 0 && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs">
          <span className="font-semibold text-red-300">Death saves</span>
          {(['success', 'fail'] as const).map((k) => (
            <label key={k} className="flex items-center gap-1 text-hearth-muted">
              {k === 'success' ? '✓' : '✗'}
              {[1, 2, 3].map((n) => (
                <input
                  key={n}
                  type="checkbox"
                  checked={(c.deathSaves?.[k] ?? 0) >= n}
                  onChange={(e) =>
                    patch({ deathSaves: { success: 0, fail: 0, ...c.deathSaves, [k]: e.target.checked ? n : n - 1 } })
                  }
                  className={`h-3.5 w-3.5 ${k === 'fail' ? 'accent-red-500' : 'accent-emerald-500'}`}
                />
              ))}
            </label>
          ))}
        </div>
      )}

      {c.levelUpReady && (
        <div className="flex items-center gap-2 rounded-md border border-hearth-gold/60 bg-hearth-gold/10 px-3 py-1.5 text-sm text-hearth-gold">
          🔔 The DM unlocked a level — hit <span className="font-semibold">⬆ Level up</span> when you're ready.
        </div>
      )}

      {/* Owed-choices chips (D2): DDB's blue flags, warn-don't-block. */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.id}
              title={chip.detail}
              className="cursor-help rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300"
            >
              ⚠ {chip.label}
            </span>
          ))}
        </div>
      )}

      {/* Dice bar (D1): visible adv/dis toggle — armed for the next roll. */}
      {canRoll && (
        <RollBar
          mode={rollMode}
          setMode={setRollMode}
          lastRoll={lastRoll}
          onFreeRoll={(expr) => {
            const roll = rollExpr(expr, { who: c.name || 'Unnamed', characterId: c.id, what: expr })
            if (!roll) return false
            setLastRoll(roll)
            cb.onRoll!(roll)
            return true
          }}
        />
      )}

      {/* Abilities + saves */}
      <div className="flex items-center">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">Abilities</span>
        <button
          onClick={() => setScoresOpen(true)}
          title="Assign scores with the standard array or point buy"
          className="ml-2 rounded border border-hearth-border px-1.5 py-px text-[10px] text-hearth-muted hover:border-hearth-ember hover:text-hearth-ember"
        >
          ⚙ scores
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ABILITY_KEYS.map((k) => (
          <div key={k} className="rounded-md border border-hearth-border bg-hearth-panel2/40 px-2 py-1.5 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">{ABILITY_LABEL[k].slice(0, 3)}</div>
            <input
              type="number"
              value={c.abilities[k]}
              onChange={(e) => patch({ abilities: { ...c.abilities, [k]: Number(e.target.value) || 0 } })}
              className="w-full bg-transparent text-center text-lg font-semibold text-hearth-text focus:outline-none"
            />
            {canRoll ? (
              <button
                onClick={() => doRoll(`${ABILITY_LABEL[k]} check`, mod(c.abilities[k]))}
                title={`Roll a ${ABILITY_LABEL[k]} check (1d20${fmtMod(mod(c.abilities[k]))})`}
                className="rounded px-1 text-xs text-hearth-ember hover:bg-hearth-ember/15"
              >
                {fmtMod(mod(c.abilities[k]))}
              </button>
            ) : (
              <div className="text-xs text-hearth-ember">{fmtMod(mod(c.abilities[k]))}</div>
            )}
            {canRoll ? (
              <button
                onClick={() => doRoll(`${ABILITY_LABEL[k]} save`, saveBonus(c, k, cls?.savingThrows ?? []))}
                title={`Roll a ${ABILITY_LABEL[k]} saving throw`}
                className="rounded px-1 text-[10px] text-hearth-muted hover:bg-hearth-ember/15 hover:text-hearth-ember"
              >
                save {fmtMod(saveBonus(c, k, cls?.savingThrows ?? []))}
                {cls?.savingThrows.includes(k) ? ' ●' : ''}
              </button>
            ) : (
              <div className="text-[10px] text-hearth-muted" title="Saving throw">
                save {fmtMod(saveBonus(c, k, cls?.savingThrows ?? []))}
                {cls?.savingThrows.includes(k) ? ' ●' : ''}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Skills + conditions/slots */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-hearth-border bg-hearth-panel2/30 p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
            Skills <span className="normal-case">(click ○ → proficient → expertise)</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3">
            {Object.keys(SKILL_ABILITY).map((sk) => {
              const state = c.expertise?.includes(sk) ? 2 : c.skillProfs.includes(sk) ? 1 : 0
              const cycle = () => {
                if (state === 0) patch({ skillProfs: [...c.skillProfs, sk] })
                else if (state === 1) patch({ expertise: [...(c.expertise ?? []), sk] })
                else patch({ skillProfs: c.skillProfs.filter((x) => x !== sk), expertise: (c.expertise ?? []).filter((x) => x !== sk) })
              }
              const skillName = sk.replace(/_/g, ' ')
              return (
                <span key={sk} className="flex items-center gap-1.5 rounded px-1 py-px text-xs text-hearth-muted hover:bg-hearth-panel2">
                  <button onClick={cycle} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" title="Click: ○ → proficient → expertise">
                    <span className={state === 2 ? 'text-hearth-gold' : state === 1 ? 'text-hearth-ember' : 'text-hearth-muted/40'}>
                      {state === 2 ? '◉' : state === 1 ? '●' : '○'}
                    </span>
                    <span className="min-w-0 flex-1 truncate capitalize">{skillName}</span>
                  </button>
                  {canRoll ? (
                    <button
                      onClick={() => doRoll(`${skillName.replace(/\b\w/g, (ch) => ch.toUpperCase())} check`, skillBonus(c, sk))}
                      title={`Roll ${skillName} (1d20${fmtMod(skillBonus(c, sk))})`}
                      className="rounded px-1 tabular-nums text-hearth-text hover:bg-hearth-ember/15 hover:text-hearth-ember"
                    >
                      {fmtMod(skillBonus(c, sk))}
                    </button>
                  ) : (
                    <span className="tabular-nums text-hearth-text">{fmtMod(skillBonus(c, sk))}</span>
                  )}
                </span>
              )
            })}
          </div>
          <div className="mt-1.5 border-t border-hearth-border pt-1 text-[10px] text-hearth-muted">
            Passives: 👁 Perception {passive(c, 'perception')} · 💡 Insight {passive(c, 'insight')} · 🔍 Investigation {passive(c, 'investigation')}
          </div>
        </div>

        <div className="space-y-3">
          <ConditionsBox c={c} onPatch={patch} />
          <LimitedUsesBox c={c} onPatch={patch} />
          {Object.keys(slots).length > 0 && (
            <div className="rounded-md border border-hearth-border bg-hearth-panel2/30 p-2">
              <div className="mb-1 flex items-baseline gap-2 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
                Spell slots
                {spellDc != null &&
                  (canRoll ? (
                    <span className="normal-case">
                      DC {spellDc} ·{' '}
                      <button
                        onClick={() => doRoll('Spell attack', spellAtk!)}
                        title={`Roll a spell attack (1d20${fmtMod(spellAtk!)})`}
                        className="rounded px-0.5 text-hearth-ember hover:bg-hearth-ember/15"
                      >
                        atk {fmtMod(spellAtk!)}
                      </button>
                    </span>
                  ) : (
                    <span className="normal-case">DC {spellDc} · atk {fmtMod(spellAtk!)}</span>
                  ))}
              </div>
              {Object.entries(slots).map(([lvl, total]) => {
                const used = c.slotsUsed?.[lvl] ?? 0
                return (
                  <div key={lvl} className="flex items-center gap-1.5 py-0.5 text-xs text-hearth-muted">
                    <span className="w-8">{SPELL_LEVEL_LABEL(Number(lvl)).replace('Level ', 'L')}</span>
                    {Array.from({ length: total }, (_, i) => (
                      <input
                        key={i}
                        type="checkbox"
                        checked={i < used}
                        onChange={(e) =>
                          patch({ slotsUsed: { ...c.slotsUsed, [lvl]: e.target.checked ? i + 1 : i } })
                        }
                        title="Tick = expended"
                        className="h-3.5 w-3.5 accent-hearth-ember"
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <SpellsBox c={c} onPatch={patch} onOpenSpell={cb.onOpenSpell} counts={spellCounts} slots={slots} />

      {levelUpOpen && (
        <LevelUpModal c={c} classes={classes} onApply={patch} onClose={() => setLevelUpOpen(false)} />
      )}
      {scoresOpen && (
        <ScoresDialog
          current={c.abilities}
          onApply={(a) => patch({ abilities: a })}
          onClose={() => setScoresOpen(false)}
        />
      )}

      {features.length > 0 && (
        <details className="rounded-md border border-hearth-border bg-hearth-panel2/30 p-2" open={false}>
          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
            Class features ({features.length}) — {classLabel || `${cls?.name ?? ''}${sub ? ` / ${sub.name}` : ''}`}
          </summary>
          <div className="mt-1 space-y-1.5">
            {features.map(({ f, clsLevel }, i) => (
              <p key={`${f.name}:${i}`} className="text-xs leading-snug text-hearth-muted">
                <span className="font-semibold text-hearth-text">
                  {f.name}
                  {f.levels.length ? ` (${f.levels.filter((l) => l <= clsLevel).join(', ')})` : ''}.{' '}
                </span>
                {f.desc.length > 400 ? `${f.desc.slice(0, 400)}…` : f.desc}
              </p>
            ))}
          </div>
        </details>
      )}

      {/* Equipment + notes */}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
            Equipment (one per line)
            {(() => {
              const attuned = (c.equipment ?? []).filter((l) => l.trimStart().startsWith('*')).length
              return attuned > 0 ? (
                <span
                  className={`ml-2 normal-case ${attuned > 3 ? 'font-bold text-red-400' : 'text-hearth-gold'}`}
                  title="Lines starting with * count as attuned magic items (max 3)"
                >
                  ✦ attuned {attuned}/3
                </span>
              ) : (
                <span className="ml-2 normal-case text-hearth-muted/50" title="Start a line with * to mark an attuned magic item (max 3)">
                  (* = attuned)
                </span>
              )
            })()}
          </span>
          <textarea
            value={(c.equipment ?? []).join('\n')}
            onChange={(e) => patch({ equipment: e.target.value.split('\n') })}
            onBlur={(e) => patch({ equipment: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) })}
            rows={5}
            className="mt-1 w-full rounded border border-hearth-border bg-hearth-bg px-2 py-1 text-xs text-hearth-text focus:border-hearth-ember focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">Notes</span>
          <textarea
            value={c.notes ?? ''}
            onChange={(e) => patch({ notes: e.target.value || undefined })}
            rows={5}
            className="mt-1 w-full rounded border border-hearth-border bg-hearth-bg px-2 py-1 text-xs text-hearth-text focus:border-hearth-ember focus:outline-none"
          />
        </label>
      </div>
    </div>
  )
}

// Point-buy costs (2024): 8 is free, 15 is the ceiling, 27 points total.
const PB_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 }
const STANDARD = [15, 14, 13, 12, 10, 8]

/** Standard-array / point-buy assignment dialog (D2). */
function ScoresDialog({
  current,
  onApply,
  onClose
}: {
  current: AbilityScores
  onApply: (a: AbilityScores) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'array' | 'buy'>('array')
  // Standard array: ability → assigned value (0 = unassigned).
  const [assign, setAssign] = useState<Record<AbilityKey, number>>({ str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 })
  // Point buy: a draft clamped to 8–15.
  const [draft, setDraft] = useState<AbilityScores>(() => {
    const clamp = (v: number) => Math.min(15, Math.max(8, v))
    return {
      str: clamp(current.str), dex: clamp(current.dex), con: clamp(current.con),
      int: clamp(current.int), wis: clamp(current.wis), cha: clamp(current.cha)
    }
  })
  const spent = ABILITY_KEYS.reduce((n, k) => n + (PB_COST[draft[k]] ?? 0), 0)
  const used = Object.values(assign).filter(Boolean)
  const arrayDone = used.length === 6

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-hearth-border bg-hearth-panel p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg font-semibold text-hearth-text">⚙ Ability scores</h3>
          <div className="ml-auto flex rounded border border-hearth-border text-xs">
            <button
              onClick={() => setTab('array')}
              className={`px-2 py-1 ${tab === 'array' ? 'bg-hearth-ember/20 text-hearth-ember' : 'text-hearth-muted'}`}
            >
              Standard array
            </button>
            <button
              onClick={() => setTab('buy')}
              className={`px-2 py-1 ${tab === 'buy' ? 'bg-hearth-ember/20 text-hearth-ember' : 'text-hearth-muted'}`}
            >
              Point buy
            </button>
          </div>
        </div>

        {tab === 'array' ? (
          <>
            <p className="mt-2 text-xs text-hearth-muted">Assign 15 / 14 / 13 / 12 / 10 / 8 — each value once.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {ABILITY_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-xs text-hearth-muted">
                  <span className="w-20">{ABILITY_LABEL[k]}</span>
                  <select
                    value={assign[k] || ''}
                    onChange={(e) => setAssign((a) => ({ ...a, [k]: Number(e.target.value) || 0 }))}
                    className="flex-1 rounded border border-hearth-border bg-hearth-panel2 px-1.5 py-1 text-sm text-hearth-text"
                  >
                    <option value="">—</option>
                    {STANDARD.map((v, i) => (
                      <option key={`${v}:${i}`} value={v} disabled={assign[k] !== v && used.filter((u) => u === v).length >= STANDARD.filter((s) => s === v).length}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button
              onClick={() => {
                onApply(assign as AbilityScores)
                onClose()
              }}
              disabled={!arrayDone}
              className="mt-3 w-full rounded border border-hearth-ember bg-hearth-ember/15 py-1.5 text-sm text-hearth-ember hover:bg-hearth-ember/30 disabled:opacity-40"
            >
              Apply ({used.length}/6 assigned)
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-xs text-hearth-muted">
              27 points; scores 8–15. Spent:{' '}
              <span className={spent > 27 ? 'font-bold text-red-400' : spent === 27 ? 'font-bold text-emerald-300' : 'font-bold text-hearth-text'}>
                {spent}/27
              </span>
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {ABILITY_KEYS.map((k) => (
                <div key={k} className="flex items-center gap-1.5 text-xs text-hearth-muted">
                  <span className="w-20">{ABILITY_LABEL[k]}</span>
                  <button
                    onClick={() => setDraft((d) => ({ ...d, [k]: Math.max(8, d[k] - 1) }))}
                    className="rounded bg-hearth-panel2 px-1.5 text-sm hover:text-hearth-text"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm text-hearth-text">{draft[k]}</span>
                  <button
                    onClick={() => setDraft((d) => ({ ...d, [k]: Math.min(15, d[k] + 1) }))}
                    className="rounded bg-hearth-panel2 px-1.5 text-sm hover:text-hearth-text"
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                onApply(draft)
                onClose()
              }}
              disabled={spent > 27}
              className="mt-3 w-full rounded border border-hearth-ember bg-hearth-ember/15 py-1.5 text-sm text-hearth-ember hover:bg-hearth-ember/30 disabled:opacity-40"
            >
              Apply
            </button>
          </>
        )}
        <p className="mt-2 text-[10px] text-hearth-muted/70">
          2024 rules: afterwards add your background's +2/+1 (or +1/+1/+1) directly in the grid.
        </p>
      </div>
    </div>
  )
}

/** Sticky-armed ADV/DIS toggle + freeform tray + last-roll readout (D1). */
function RollBar({
  mode,
  setMode,
  lastRoll,
  onFreeRoll
}: {
  mode: RollMode
  setMode: (m: RollMode) => void
  lastRoll: RollEvent | null
  onFreeRoll: (expr: string) => boolean
}) {
  const [expr, setExpr] = useState('')
  const [bad, setBad] = useState(false)
  const fire = () => {
    if (!expr.trim()) return
    if (onFreeRoll(expr.trim())) {
      setExpr('')
      setBad(false)
    } else setBad(true)
  }
  const ModeBtn = ({ m, label, title }: { m: RollMode; label: string; title: string }) => (
    <button
      onClick={() => setMode(mode === m ? null : m)}
      title={title}
      className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors ${
        mode === m
          ? m === 'adv'
            ? 'bg-emerald-500/25 text-emerald-300'
            : 'bg-red-500/25 text-red-300'
          : 'text-hearth-muted hover:text-hearth-text'
      }`}
    >
      {label}
    </button>
  )
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-hearth-border bg-hearth-panel2/30 px-2 py-1.5">
      <span className="text-sm" title="Dice: click any number on the sheet to roll it">🎲</span>
      <span className="flex rounded border border-hearth-border">
        <ModeBtn m="adv" label="ADV" title="Arm Advantage for the next d20 roll (2d20, keep high)" />
        <ModeBtn m="dis" label="DIS" title="Arm Disadvantage for the next d20 roll (2d20, keep low)" />
      </span>
      {mode && <span className="text-[10px] text-hearth-muted">armed for next roll</span>}
      <input
        value={expr}
        onChange={(e) => {
          setExpr(e.target.value)
          setBad(false)
        }}
        onKeyDown={(e) => e.key === 'Enter' && fire()}
        placeholder="2d6+3…"
        className={`w-24 rounded border bg-hearth-bg px-1.5 py-0.5 text-xs text-hearth-text placeholder:text-hearth-muted/40 focus:outline-none ${
          bad ? 'border-red-500/60' : 'border-hearth-border focus:border-hearth-ember'
        }`}
        title="Freeform dice (damage, Bless d4, sneak attack…) — Enter rolls"
      />
      {lastRoll && (
        <span className="ml-auto flex items-baseline gap-1.5 text-xs">
          <span className="text-hearth-muted">{lastRoll.what}:</span>
          <span
            className={`text-base font-bold ${
              lastRoll.crit === 'crit' ? 'text-hearth-gold' : lastRoll.crit === 'fumble' ? 'text-red-300' : 'text-hearth-ember'
            }`}
          >
            {lastRoll.total}
          </span>
          <span className="text-[10px] text-hearth-muted/70">
            {lastRoll.groups.map(groupText).join(' + ')}
            {lastRoll.modifier !== 0 ? ` ${lastRoll.modifier > 0 ? '+' : ''}${lastRoll.modifier}` : ''}
          </span>
          {lastRoll.crit === 'crit' && <span className="text-[10px] font-bold text-hearth-gold">NAT 20!</span>}
          {lastRoll.crit === 'fumble' && <span className="text-[10px] font-bold text-red-300">nat 1</span>}
        </span>
      )}
    </div>
  )
}

/** 2024 standard conditions for the quick-pick. */
const STD_CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible',
  'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
  'Exhaustion 1', 'Exhaustion 2', 'Exhaustion 3', 'Exhaustion 4', 'Exhaustion 5', 'Exhaustion 6'
]

function ConditionsBox({ c, onPatch }: { c: Character; onPatch: (p: Partial<Character>) => void }) {
  const [draft, setDraft] = useState('')
  const add = (v: string) => {
    const clean = v.trim()
    if (!clean) return
    setDraft('')
    onPatch({ conditions: [...(c.conditions ?? []), clean] })
  }
  return (
    <div className="rounded-md border border-hearth-border bg-hearth-panel2/30 p-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">Conditions</div>
      <div className="flex flex-wrap items-center gap-1">
        {(c.conditions ?? []).map((x, i) => (
          <button
            key={`${x}:${i}`}
            onClick={() => onPatch({ conditions: (c.conditions ?? []).filter((_, j) => j !== i) })}
            className="rounded-full bg-purple-500/15 px-1.5 py-px text-[11px] text-purple-300 hover:bg-red-500/20 hover:text-red-300"
            title="Click to clear"
          >
            {x}
          </button>
        ))}
        <select
          value=""
          onChange={(e) => e.target.value && add(e.target.value)}
          className="rounded border border-transparent bg-transparent px-0.5 py-px text-[11px] text-hearth-muted focus:border-hearth-border focus:outline-none"
          title="Standard 2024 conditions (exhaustion by level)"
        >
          <option value="">＋</option>
          {STD_CONDITIONS.filter((x) => !(c.conditions ?? []).includes(x)).map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add(draft)}
          placeholder="custom…"
          className="w-20 rounded border border-transparent bg-transparent px-1 py-px text-[11px] text-hearth-muted placeholder:text-hearth-muted/40 focus:border-hearth-border focus:outline-none"
        />
      </div>
    </div>
  )
}

/** DDB's Limited Uses: user-defined pips (Focus Points, Channel Divinity…) reset by rests. */
function LimitedUsesBox({ c, onPatch }: { c: Character; onPatch: (p: Partial<Character>) => void }) {
  const [name, setName] = useState('')
  const [max, setMax] = useState(1)
  const [reset, setReset] = useState<'short' | 'long'>('long')
  const uses = c.limitedUses ?? []
  const add = () => {
    const clean = name.trim()
    if (!clean || uses.some((u) => u.name === clean)) return
    setName('')
    onPatch({ limitedUses: [...uses, { name: clean, max: Math.max(1, max), reset }] })
  }
  return (
    <div className="rounded-md border border-hearth-border bg-hearth-panel2/30 p-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
        Limited uses <span className="normal-case">(tick = spent; rests reset)</span>
      </div>
      {uses.map((u) => {
        const spent = c.usesSpent?.[u.name] ?? 0
        return (
          <div key={u.name} className="group/use flex items-center gap-1.5 py-0.5 text-xs text-hearth-muted">
            <span className="min-w-0 flex-1 truncate" title={`Resets on a ${u.reset} rest`}>
              {u.name} <span className="text-[9px] text-hearth-muted/60">{u.reset === 'short' ? '🌙' : '☀️'}</span>
            </span>
            {Array.from({ length: Math.min(12, u.max) }, (_, i) => (
              <input
                key={i}
                type="checkbox"
                checked={i < spent}
                onChange={(e) =>
                  onPatch({ usesSpent: { ...c.usesSpent, [u.name]: e.target.checked ? i + 1 : i } })
                }
                className="h-3.5 w-3.5 accent-hearth-gold"
              />
            ))}
            <button
              onClick={() => {
                const rest = { ...c.usesSpent }
                delete rest[u.name]
                onPatch({ limitedUses: uses.filter((x) => x.name !== u.name), usesSpent: rest })
              }}
              className="text-hearth-muted opacity-0 hover:text-red-400 group-hover/use:opacity-100"
              title="Remove this counter"
            >
              ×
            </button>
          </div>
        )
      })}
      <div className="mt-1 flex items-center gap-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="+ Focus Points…"
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-px text-[11px] text-hearth-muted placeholder:text-hearth-muted/40 focus:border-hearth-border focus:outline-none"
        />
        <input
          type="number"
          min={1}
          max={12}
          value={max}
          onChange={(e) => setMax(Number(e.target.value) || 1)}
          className="w-10 rounded border border-hearth-border bg-hearth-bg px-1 py-px text-center text-[11px] text-hearth-text"
          title="Uses per rest"
        />
        <select
          value={reset}
          onChange={(e) => setReset(e.target.value as 'short' | 'long')}
          className="rounded border border-hearth-border bg-hearth-bg px-0.5 py-px text-[11px] text-hearth-muted"
          title="Which rest resets it"
        >
          <option value="short">🌙 short</option>
          <option value="long">☀️ long</option>
        </select>
        <button onClick={add} className="rounded px-1 text-xs text-hearth-muted hover:text-hearth-ember" title="Add counter">
          ＋
        </button>
      </div>
    </div>
  )
}

function SpellsBox({
  c,
  onPatch,
  onOpenSpell,
  counts,
  slots
}: {
  c: Character
  onPatch: (p: Partial<Character>) => void
  onOpenSpell?: (key: string) => void
  /** DDB-style live counters vs the 2024 class tables (advisory). */
  counts?: { cantrips: number; leveled: number; exp: { cantrips: number; prepared: number } } | null
  /** Slot totals by level, for the ⚡ CAST menu. */
  slots?: Record<string, number>
}) {
  const [all, setAll] = useState<Spell[] | null>(null)
  const [query, setQuery] = useState('')
  const [castFor, setCastFor] = useState<string | null>(null)

  /** Spend a slot (0 = no slot: cantrip/ritual) and track concentration. */
  const cast = (s: Spell, slotLvl: number) => {
    setCastFor(null)
    const p: Partial<Character> = {}
    if (slotLvl > 0) p.slotsUsed = { ...c.slotsUsed, [String(slotLvl)]: (c.slotsUsed?.[String(slotLvl)] ?? 0) + 1 }
    if (s.concentration) p.concentratingOn = s.name
    onPatch(p)
  }

  /** Slot levels this spell can be cast at with a slot still open. */
  const castable = (s: Spell): number[] => {
    if (!slots) return []
    return Object.keys(slots)
      .map(Number)
      .filter((lvl) => lvl >= s.level && (c.slotsUsed?.[String(lvl)] ?? 0) < (slots[String(lvl)] ?? 0))
      .sort((a, b) => a - b)
  }
  useEffect(() => {
    loadSpells().then(setAll).catch(() => setAll([]))
  }, [])

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !all) return []
    return all
      .map((s) => ({ s, score: fuzzyScore(s.name, q) }))
      .filter((x) => x.score > 0 && !(c.spells ?? []).includes(x.s.key))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
  }, [query, all, c.spells])

  const known = (c.spells ?? [])
    .map((k) => all?.find((s) => s.key === k))
    .filter((s): s is Spell => !!s)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))

  const isCaster = [c.classKey, ...(c.multiclass ?? []).map((e) => e.classKey)].some((k) => k && k in CASTING_ABILITY)
  if ((c.spells ?? []).length === 0 && !isCaster) return null

  return (
    <div className="rounded-md border border-hearth-border bg-hearth-panel2/30 p-2">
      <div className="mb-1 flex items-baseline gap-2 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
        Spells <span className="normal-case">(search below to learn/swap; × forgets)</span>
        {counts && (
          <span
            className="ml-auto normal-case"
            title="Known/prepared vs the 2024 class table — a guide, not a limit (always-prepared domain/oath spells inflate the count)"
          >
            <span className={counts.cantrips < counts.exp.cantrips ? 'text-amber-300' : ''}>
              cantrips {counts.cantrips}/{counts.exp.cantrips}
            </span>
            {' · '}
            <span className={counts.leveled < counts.exp.prepared ? 'text-amber-300' : ''}>
              spells {counts.leveled}/{counts.exp.prepared}
            </span>
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {known.map((s) => {
          const lvls = s.level > 0 ? castable(s) : []
          const canCast = s.level > 0 ? lvls.length > 0 : s.concentration
          return (
            <span key={s.key} className="group/spell relative flex items-center gap-1 rounded-full border border-hearth-border bg-hearth-panel px-2 py-0.5 text-xs">
              <button onClick={() => onOpenSpell?.(s.key)} className="text-hearth-text hover:text-hearth-ember" title={`${SPELL_LEVEL_LABEL(s.level)} — open card (📖)`}>
                {s.name}
              </button>
              <span className="text-[9px] text-hearth-muted">{s.level === 0 ? 'c' : s.level}</span>
              {s.concentration && <span className="text-[9px] text-purple-300" title="Concentration">©</span>}
              {canCast && (
                <button
                  onClick={() => {
                    if (s.level === 0) cast(s, 0)
                    else if (lvls.length === 1) cast(s, lvls[0])
                    else setCastFor(castFor === s.key ? null : s.key)
                  }}
                  className="text-hearth-gold opacity-50 hover:opacity-100 group-hover/spell:opacity-100"
                  title={s.level === 0 ? 'Cast (concentration)' : 'Cast — spends a slot (pick the level when upcasting)'}
                >
                  ⚡
                </button>
              )}
              <button
                onClick={() => onPatch({ spells: (c.spells ?? []).filter((x) => x !== s.key) })}
                className="text-hearth-muted opacity-40 hover:text-red-400 group-hover/spell:opacity-100"
                title="Forget"
              >
                ×
              </button>
              {castFor === s.key && (
                <span className="absolute left-0 top-full z-30 mt-1 flex gap-1 rounded-md border border-hearth-border bg-hearth-panel2 p-1 shadow-2xl">
                  {lvls.map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => cast(s, lvl)}
                      className={`rounded px-1.5 py-0.5 text-[11px] ${
                        lvl === s.level ? 'bg-hearth-ember/20 text-hearth-ember' : 'text-hearth-muted hover:text-hearth-text'
                      }`}
                      title={`Cast at level ${lvl}${lvl > s.level ? ' (upcast)' : ''}`}
                    >
                      L{lvl}
                    </button>
                  ))}
                </span>
              )}
            </span>
          )
        })}
      </div>
      <div className="relative mt-1.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add spell (SRD search)…"
          className="w-full rounded border border-hearth-border bg-hearth-bg px-2 py-1 text-xs text-hearth-text placeholder:text-hearth-muted/40 focus:border-hearth-ember focus:outline-none"
        />
        {hits.length > 0 && (
          <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-hearth-border bg-hearth-panel2 shadow-2xl">
            {hits.map(({ s }) => (
              <button
                key={s.key}
                onClick={() => {
                  setQuery('')
                  onPatch({ spells: [...(c.spells ?? []), s.key] })
                }}
                className="flex w-full items-baseline gap-2 px-2.5 py-1 text-left text-xs text-hearth-text hover:bg-hearth-ember/15"
              >
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="flex-none text-[9px] text-hearth-muted">{SPELL_LEVEL_LABEL(s.level)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
