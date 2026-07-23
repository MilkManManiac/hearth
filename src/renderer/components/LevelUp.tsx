import { useEffect, useMemo, useState } from 'react'
import type { AbilityScores, Character } from '../../shared/types'
import { classLevels, mod, spellSlots } from '../lib/character'
import { loadKind, type ClassEntry, type NamedEntry } from '../lib/compendium'
import { expectedSpells, PROGRESSION, SUBCLASS_LEVEL } from '../lib/progression'

// Level-up modal (D2, choosers 2026-07-23): bump a class, see exactly what
// the level grants, get average HP applied — and make the level's CHOICES in
// place: subclass at 3, ASI (actually bumps scores) or feat (writes featKeys)
// at ASI levels. Ends on a "what you gained" summary — the recap DDB forgot.
// Works for the DM panel and the player portal (pure props + lazy compendium).

interface Gains {
  className: string
  newClassLevel: number
  newTotalLevel: number
  hpGain: number
  features: { name: string; desc: string }[]
  slotDiffs: string[]
  reminders: string[]
  /** Subclass owed this level → pickable options. */
  subclassOptions: ClassEntry[]
  /** ASI-or-feat owed this level. */
  asiDue: boolean
  /** 2024 multiclass score gate not met (warn-don't-block). */
  prereqWarning?: string
  /** Human lines for choices actually made (summary screen). */
  choices?: string[]
}

const ABILITY_NAMES: Record<keyof AbilityScores, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA'
}

/** 2024 multiclass score gates (PHB): what the NEW class demands. */
const MULTICLASS_GATES: Record<string, { need: (keyof AbilityScores)[]; any?: boolean }> = {
  barbarian: { need: ['str'] },
  bard: { need: ['cha'] },
  cleric: { need: ['wis'] },
  druid: { need: ['wis'] },
  fighter: { need: ['str', 'dex'], any: true },
  monk: { need: ['dex', 'wis'] },
  paladin: { need: ['str', 'cha'] },
  ranger: { need: ['dex', 'wis'] },
  rogue: { need: ['dex'] },
  sorcerer: { need: ['cha'] },
  warlock: { need: ['cha'] },
  wizard: { need: ['int'] }
}

const dieOf = (hitDice?: string): number => {
  const m = /d(\d+)/i.exec(hitDice ?? '')
  return m ? parseInt(m[1], 10) : 8
}

export default function LevelUpModal({
  c,
  classes,
  onApply,
  onClose
}: {
  c: Character
  classes: ClassEntry[]
  onApply: (patch: Partial<Character>) => void
  onClose: () => void
}) {
  const levels = classLevels(c)
  // Target: index into `levels`, or 'new:<classKey>' for a fresh multiclass.
  const [target, setTarget] = useState('0')
  const [applied, setApplied] = useState<Gains | null>(null)
  // The level's choices, made in place (D2 choosers):
  const [subclassPick, setSubclassPick] = useState('')
  const [asiMode, setAsiMode] = useState<'asi' | 'feat'>('asi')
  // ability → +1/+2 (total ≤ 2, the 2024 ASI budget).
  const [asiPicks, setAsiPicks] = useState<Partial<Record<keyof AbilityScores, number>>>({})
  const [featPick, setFeatPick] = useState('')
  const [feats, setFeats] = useState<NamedEntry[]>([])
  useEffect(() => {
    loadKind('feat').then(setFeats)
  }, [])
  // Changing the target class resets the per-level choices.
  useEffect(() => {
    setSubclassPick('')
    setAsiPicks({})
    setFeatPick('')
  }, [target])

  const gains = useMemo<Gains | null>(() => {
    let classKey: string | undefined
    let subclassKey: string | undefined
    let newClassLevel: number
    if (target.startsWith('new:')) {
      classKey = target.slice(4)
      newClassLevel = 1
    } else {
      const entry = levels[Number(target)]
      if (!entry) return null
      classKey = entry.classKey
      subclassKey = entry.subclassKey
      newClassLevel = entry.level + 1
    }
    const cls = classes.find((x) => x.key === classKey)
    if (!cls) return null
    const sub = classes.find((x) => x.key === subclassKey)
    const die = dieOf(cls.hitDice)
    const hpGain = Math.max(1, Math.ceil((die + 1) / 2) + mod(c.abilities.con))

    const features = [...(cls.features ?? []), ...(sub?.features ?? [])]
      .filter((f) => f.levels.includes(newClassLevel))
      .map((f) => ({ name: f.name, desc: f.desc }))

    // Spell-slot changes at the new level.
    const after: Character = {
      ...c,
      level: c.level + 1,
      multiclass: target.startsWith('new:')
        ? [...(c.multiclass ?? []), { classKey, level: 1 }]
        : Number(target) > 0
          ? (c.multiclass ?? []).map((e, i) => (i === Number(target) - 1 ? { ...e, level: e.level + 1 } : e))
          : c.multiclass
    }
    const before = spellSlots(c, classes)
    const now = spellSlots(after, classes)
    const slotDiffs: string[] = []
    for (const lvl of Object.keys(now)) {
      const delta = now[lvl] - (before[lvl] ?? 0)
      if (delta > 0) slotDiffs.push(`+${delta} level-${lvl} slot${delta > 1 ? 's' : ''}`)
    }

    const reminders: string[] = []
    const subclassOptions =
      newClassLevel === SUBCLASS_LEVEL && !subclassKey
        ? classes.filter((x) => x.subclassOf === classKey)
        : []
    const prog = classKey ? PROGRESSION[classKey] : undefined
    const asiDue = !!prog?.asiLevels.includes(newClassLevel)
    const beforeSp = expectedSpells(levels)
    const afterSp = expectedSpells(classLevels(after))
    if (afterSp.cantrips > beforeSp.cantrips) reminders.push(`Learn ${afterSp.cantrips - beforeSp.cantrips} new cantrip(s).`)
    if (afterSp.prepared > beforeSp.prepared)
      reminders.push(`Your prepared/known spells rise to ${afterSp.prepared} — add ${afterSp.prepared - beforeSp.prepared} in the Spells box.`)

    // 2024 multiclass gate — advisory, never a block.
    let prereqWarning: string | undefined
    if (target.startsWith('new:')) {
      const gate = MULTICLASS_GATES[target.slice(4)]
      if (gate) {
        const met = gate.any
          ? gate.need.some((a) => c.abilities[a] >= 13)
          : gate.need.every((a) => c.abilities[a] >= 13)
        if (!met) {
          const names = gate.need.map((a) => ABILITY_NAMES[a]).join(gate.any ? ' or ' : ' and ')
          prereqWarning = `2024 multiclass rule wants ${names} 13+ to take ${cls.name} levels — your table's call.`
        }
      }
    }

    return {
      className: cls.name,
      newClassLevel,
      newTotalLevel: c.level + 1,
      hpGain,
      features,
      slotDiffs,
      reminders,
      subclassOptions,
      asiDue,
      prereqWarning
    }
  }, [target, c, classes, levels])

  const [hpGainEdit, setHpGainEdit] = useState<number | null>(null)
  const hpGain = hpGainEdit ?? gains?.hpGain ?? 0

  const asiTotal = Object.values(asiPicks).reduce((a, b) => a + (b ?? 0), 0)

  const apply = () => {
    if (!gains) return
    const patch: Partial<Character> = {
      level: c.level + 1,
      maxHp: c.maxHp + hpGain,
      hp: c.hp + hpGain,
      levelUpReady: undefined
    }
    const stillTodo = [...gains.reminders]
    const choices: string[] = []
    if (target.startsWith('new:')) {
      patch.multiclass = [...(c.multiclass ?? []), { classKey: target.slice(4), level: 1 }]
    } else if (Number(target) > 0) {
      patch.multiclass = (c.multiclass ?? []).map((e, i) =>
        i === Number(target) - 1
          ? { ...e, level: e.level + 1, ...(subclassPick ? { subclassKey: subclassPick } : {}) }
          : e
      )
    } else if (subclassPick) {
      patch.subclassKey = subclassPick
    }
    if (subclassPick) {
      choices.push(`Subclass: ${classes.find((x) => x.key === subclassPick)?.name ?? subclassPick}`)
    } else if (gains.subclassOptions.length > 0) {
      stillTodo.unshift(`Choose your ${gains.className} subclass (dropdown in the class row).`)
    }
    if (gains.asiDue) {
      if (asiMode === 'asi' && asiTotal === 2) {
        const ab = { ...c.abilities }
        for (const [k, v] of Object.entries(asiPicks)) {
          const key = k as keyof AbilityScores
          if (v) ab[key] = Math.min(20, ab[key] + v)
        }
        patch.abilities = ab
        choices.push(
          Object.entries(asiPicks)
            .filter(([, v]) => v)
            .map(([k, v]) => `+${v} ${ABILITY_NAMES[k as keyof AbilityScores]}`)
            .join(', ') + ' (ASI)'
        )
      } else if (asiMode === 'feat' && featPick) {
        patch.featKeys = [...(c.featKeys ?? []), featPick]
        choices.push(`Feat: ${feats.find((f) => f.key === featPick)?.name ?? featPick}`)
      } else {
        stillTodo.unshift('ASI or feat still owed for this level — reopen ⬆ Level up or use ⚙ scores.')
      }
    }
    onApply(patch)
    setApplied({ ...gains, hpGain, reminders: stillTodo, choices })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-hearth-border bg-hearth-panel p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!applied ? (
          <>
            <h3 className="font-display text-lg font-semibold text-hearth-text">
              ⬆ Level up — to level {c.level + 1}
            </h3>

            <label className="mt-3 block text-xs text-hearth-muted">
              Which class gains the level?
              <select
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value)
                  setHpGainEdit(null)
                }}
                className="mt-1 w-full rounded border border-hearth-border bg-hearth-panel2 px-2 py-1 text-sm text-hearth-text"
              >
                {levels.map((e, i) => {
                  const cls = classes.find((x) => x.key === e.classKey)
                  return cls ? (
                    <option key={i} value={String(i)}>
                      {cls.name} {e.level} → {e.level + 1}
                    </option>
                  ) : null
                })}
                {classes
                  .filter((x) => !x.subclassOf && !levels.some((e) => e.classKey === x.key))
                  .map((x) => (
                    <option key={x.key} value={`new:${x.key}`}>
                      ＋ Multiclass into {x.name} (level 1)
                    </option>
                  ))}
              </select>
            </label>

            {gains && (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center gap-2 rounded border border-hearth-border bg-hearth-panel2/40 px-2 py-1.5 text-xs text-hearth-muted">
                  <span className="font-semibold text-hearth-text">HP</span>
                  +
                  <input
                    type="number"
                    min={1}
                    value={hpGain}
                    onChange={(e) => setHpGainEdit(Math.max(1, Number(e.target.value) || 1))}
                    className="w-14 rounded border border-hearth-border bg-hearth-bg px-1 py-0.5 text-center text-sm text-hearth-text"
                    title="Fixed average (die/2+1 + CON) — overwrite with your roll if your table rolls HP"
                  />
                  <span>fixed average for {gains.className}; type your roll instead if you roll HP</span>
                </div>
                {gains.features.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
                      {gains.className} {gains.newClassLevel} grants
                    </div>
                    {gains.features.map((f) => (
                      <p key={f.name} className="my-1 text-xs leading-snug text-hearth-muted">
                        <span className="font-semibold text-hearth-text">{f.name}. </span>
                        {f.desc.length > 220 ? `${f.desc.slice(0, 220)}…` : f.desc}
                      </p>
                    ))}
                  </div>
                )}
                {gains.prereqWarning && (
                  <p className="rounded border border-hearth-gold/40 bg-hearth-gold/10 px-2 py-1.5 text-xs text-hearth-gold">
                    ⚠ {gains.prereqWarning}
                  </p>
                )}
                {gains.subclassOptions.length > 0 && (
                  <div className="rounded border border-hearth-ember/40 bg-hearth-ember/5 px-2 py-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-hearth-ember">
                      Choose your subclass
                    </div>
                    <select
                      value={subclassPick}
                      onChange={(e) => setSubclassPick(e.target.value)}
                      className="mt-1 w-full rounded border border-hearth-border bg-hearth-panel2 px-2 py-1 text-sm text-hearth-text"
                    >
                      <option value="">— pick at the table —</option>
                      {gains.subclassOptions.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {gains.asiDue && (
                  <div className="rounded border border-hearth-ember/40 bg-hearth-ember/5 px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-hearth-ember">
                        This level's big choice
                      </span>
                      <div className="flex overflow-hidden rounded-full border border-hearth-border text-xs">
                        {(['asi', 'feat'] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => setAsiMode(m)}
                            className={`px-2 py-0.5 ${
                              asiMode === m ? 'bg-hearth-ember/20 text-hearth-ember' : 'text-hearth-muted hover:text-hearth-text'
                            }`}
                          >
                            {m === 'asi' ? '+2 scores' : 'Feat'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {asiMode === 'asi' ? (
                      <>
                        <p className="mt-1 text-[11px] text-hearth-muted">
                          Spend 2 points: +2 one score or +1 to two (max 20). Click to add, right-click to remove.
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(Object.keys(ABILITY_NAMES) as (keyof AbilityScores)[]).map((k) => {
                            const pick = asiPicks[k] ?? 0
                            const capped = c.abilities[k] + pick >= 20
                            return (
                              <button
                                key={k}
                                onClick={() => {
                                  if (asiTotal >= 2 || capped) return
                                  setAsiPicks((p) => ({ ...p, [k]: (p[k] ?? 0) + 1 }))
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault()
                                  setAsiPicks((p) => ({ ...p, [k]: Math.max(0, (p[k] ?? 0) - 1) }))
                                }}
                                title={capped ? 'At the 20 cap' : `${ABILITY_NAMES[k]} ${c.abilities[k]} → ${c.abilities[k] + pick + 1}`}
                                className={`rounded border px-2 py-1 text-xs transition-colors ${
                                  pick > 0
                                    ? 'border-hearth-ember bg-hearth-ember/15 text-hearth-ember'
                                    : 'border-hearth-border bg-hearth-panel2 text-hearth-muted hover:text-hearth-text'
                                } ${capped && !pick ? 'opacity-40' : ''}`}
                              >
                                {ABILITY_NAMES[k]} {c.abilities[k]}
                                {pick > 0 ? ` +${pick}` : ''}
                              </button>
                            )
                          })}
                          <span className="self-center text-[11px] text-hearth-muted">{asiTotal}/2 spent</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <select
                          value={featPick}
                          onChange={(e) => setFeatPick(e.target.value)}
                          className="mt-1 w-full rounded border border-hearth-border bg-hearth-panel2 px-2 py-1 text-sm text-hearth-text"
                        >
                          <option value="">— pick a feat —</option>
                          {feats
                            .filter((f) => !(c.featKeys ?? []).includes(f.key))
                            .map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.homebrew ? '🏠 ' : ''}
                                {f.name}
                              </option>
                            ))}
                        </select>
                        {featPick && (
                          <p className="mt-1 max-h-24 overflow-y-auto text-[11px] leading-snug text-hearth-muted">
                            {String(feats.find((f) => f.key === featPick)?.desc ?? '')}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
                {gains.slotDiffs.length > 0 && (
                  <p className="text-xs text-hearth-muted">
                    <span className="font-semibold text-hearth-text">Spell slots: </span>
                    {gains.slotDiffs.join(', ')}
                  </p>
                )}
                {gains.reminders.length > 0 && (
                  <div className="rounded border border-hearth-gold/40 bg-hearth-gold/10 px-2 py-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-hearth-gold">
                      Choices this level
                    </div>
                    {gains.reminders.map((r) => (
                      <p key={r} className="my-0.5 text-xs text-hearth-muted">
                        • {r}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={apply}
                disabled={!gains}
                className="rounded border border-hearth-ember bg-hearth-ember/15 px-3 py-1.5 text-sm text-hearth-ember hover:bg-hearth-ember/30 disabled:opacity-40"
              >
                ⬆ Take the level
              </button>
              <button onClick={onClose} className="rounded border border-hearth-border px-3 py-1.5 text-sm text-hearth-muted hover:text-hearth-text">
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="font-display text-lg font-semibold text-hearth-gold">
              🎉 {c.name} is now level {applied.newTotalLevel}
            </h3>
            <div className="mt-2 space-y-1 text-sm text-hearth-muted">
              <p>
                <span className="font-semibold text-hearth-text">
                  {applied.className} {applied.newClassLevel}
                </span>{' '}
                · +{applied.hpGain} max HP
              </p>
              {(applied.choices ?? []).map((line) => (
                <p key={line} className="text-xs text-hearth-gold">
                  ✦ {line}
                </p>
              ))}
              {applied.features.map((f) => (
                <p key={f.name} className="text-xs">
                  ✦ <span className="font-semibold text-hearth-text">{f.name}</span>
                </p>
              ))}
              {applied.slotDiffs.length > 0 && <p className="text-xs">✦ {applied.slotDiffs.join(', ')}</p>}
              {applied.reminders.length > 0 && (
                <div className="mt-2 rounded border border-hearth-gold/40 bg-hearth-gold/10 px-2 py-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-hearth-gold">Still to do</div>
                  {applied.reminders.map((r) => (
                    <p key={r} className="my-0.5 text-xs">
                      • {r}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="mt-4 w-full rounded border border-hearth-border bg-hearth-panel2 py-1.5 text-sm text-hearth-muted hover:text-hearth-text"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  )
}
