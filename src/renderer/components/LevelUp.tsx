import { useMemo, useState } from 'react'
import type { Character } from '../../shared/types'
import { classLevels, mod, spellSlots } from '../lib/character'
import type { ClassEntry } from '../lib/compendium'
import { asiCount, expectedSpells, PROGRESSION, SUBCLASS_LEVEL } from '../lib/progression'

// Level-up modal (D2): bump a class, see exactly what the level grants, get
// average HP applied, end on a "what you gained" summary — the recap DDB
// forgot. Works for the DM panel and the player portal (pure props).

interface Gains {
  className: string
  newClassLevel: number
  newTotalLevel: number
  hpGain: number
  features: { name: string; desc: string }[]
  slotDiffs: string[]
  reminders: string[]
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
    if (newClassLevel === SUBCLASS_LEVEL && !subclassKey && classes.some((x) => x.subclassOf === classKey)) {
      reminders.push(`Choose your ${cls.name} subclass (the dropdown appears in the class row).`)
    }
    const prog = classKey ? PROGRESSION[classKey] : undefined
    if (prog?.asiLevels.includes(newClassLevel)) {
      reminders.push('Ability Score Improvement or a feat — bump scores in the grid or note the feat.')
    }
    const beforeSp = expectedSpells(levels)
    const afterSp = expectedSpells(classLevels(after))
    if (afterSp.cantrips > beforeSp.cantrips) reminders.push(`Learn ${afterSp.cantrips - beforeSp.cantrips} new cantrip(s).`)
    if (afterSp.prepared > beforeSp.prepared)
      reminders.push(`Your prepared/known spells rise to ${afterSp.prepared} — add ${afterSp.prepared - beforeSp.prepared} in the Spells box.`)

    return {
      className: cls.name,
      newClassLevel,
      newTotalLevel: c.level + 1,
      hpGain,
      features,
      slotDiffs,
      reminders
    }
  }, [target, c, classes, levels])

  const [hpGainEdit, setHpGainEdit] = useState<number | null>(null)
  const hpGain = hpGainEdit ?? gains?.hpGain ?? 0

  const apply = () => {
    if (!gains) return
    const patch: Partial<Character> = {
      level: c.level + 1,
      maxHp: c.maxHp + hpGain,
      hp: c.hp + hpGain,
      levelUpReady: undefined
    }
    if (target.startsWith('new:')) {
      patch.multiclass = [...(c.multiclass ?? []), { classKey: target.slice(4), level: 1 }]
    } else if (Number(target) > 0) {
      patch.multiclass = (c.multiclass ?? []).map((e, i) =>
        i === Number(target) - 1 ? { ...e, level: e.level + 1 } : e
      )
    }
    onApply(patch)
    setApplied({ ...gains, hpGain })
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
