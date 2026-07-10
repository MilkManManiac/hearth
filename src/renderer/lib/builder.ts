import type { Character } from '../../shared/types'
import { classLevels } from './character'
import type { ClassEntry, Spell } from './compendium'
import { asiCount, expectedSpells, PROGRESSION, SUBCLASS_LEVEL } from './progression'

// Owed-choices engine (D2) — DDB's blue "you owe a decision here" flags as
// amber chips on the sheet. Advisory counts, never hard blocks: homebrew and
// table rulings are allowed to disagree with the tables.

export interface BuildChip {
  id: string
  label: string
  detail: string
}

export function pendingChoices(c: Character, classes: ClassEntry[], spells: Spell[] | null): BuildChip[] {
  const chips: BuildChip[] = []
  const levels = classLevels(c)

  if (!c.classKey) {
    chips.push({ id: 'class', label: 'Pick a class', detail: 'Everything else derives from this — start here.' })
  }
  if (!c.speciesKey) {
    chips.push({ id: 'species', label: 'Pick a species', detail: 'Speed, size, darkvision, and traits come from it.' })
  }
  if (!c.backgroundKey) {
    chips.push({ id: 'background', label: 'Pick a background', detail: '2024 rules: your +2/+1 ability bonuses and origin feat live here.' })
  }

  // Subclass owed at level 3 per class (only when the data actually has options).
  for (const { classKey, subclassKey, level } of levels) {
    if (!classKey || subclassKey || level < SUBCLASS_LEVEL) continue
    const cls = classes.find((x) => x.key === classKey)
    if (!cls) continue
    if (classes.some((x) => x.subclassOf === classKey)) {
      chips.push({
        id: `subclass:${classKey}`,
        label: `Choose a ${cls.name} subclass`,
        detail: `Subclasses arrive at ${cls.name} level ${SUBCLASS_LEVEL} (2024 rules) — pick one in the class row.`
      })
    }
  }

  // Ability scores untouched (all 10s) reads as "not set yet".
  const abilityVals = Object.values(c.abilities)
  if (abilityVals.length > 0 && abilityVals.every((v) => v === 10)) {
    chips.push({
      id: 'abilities',
      label: 'Set ability scores',
      detail: 'Use ⚙ Scores in the ability grid — standard array, point buy, or type rolled stats.'
    })
  }

  // Skills: class choice count + 2 from the background (2024).
  const prog = c.classKey ? PROGRESSION[c.classKey] : undefined
  if (prog) {
    const expected = prog.skills.count + (c.backgroundKey ? 2 : 0)
    if (c.skillProfs.length < expected) {
      const fromText =
        prog.skills.from === 'any' ? 'any skills' : prog.skills.from.map((s) => s.replace(/_/g, ' ')).join(', ')
      chips.push({
        id: 'skills',
        label: `Skills: ${c.skillProfs.length} of ~${expected} picked`,
        detail: `Class grants ${prog.skills.count} (from: ${fromText}); the background adds 2. Click ○ in the skills list.`
      })
    }
  }

  // Spell counts (casters with a table). Needs the spell list for levels.
  if (spells) {
    const expect = expectedSpells(levels)
    if (expect.cantrips > 0 || expect.prepared > 0) {
      const byKey = new Map(spells.map((s) => [s.key, s]))
      let haveCantrips = 0
      let haveLeveled = 0
      for (const key of c.spells ?? []) {
        const s = byKey.get(key)
        if (!s) continue
        if (s.level === 0) haveCantrips++
        else haveLeveled++
      }
      if (expect.cantrips > haveCantrips) {
        chips.push({
          id: 'cantrips',
          label: `Cantrips: ${haveCantrips}/${expect.cantrips}`,
          detail: 'Add cantrips in the Spells box (search below the chips).'
        })
      }
      if (expect.prepared > haveLeveled) {
        chips.push({
          id: 'spells',
          label: `Spells: ${haveLeveled}/${expect.prepared}`,
          detail:
            'Prepared/known spells per the 2024 class table (always-prepared domain/oath spells count too — treat the number as a guide).'
        })
      }
    }
  }

  // Feat milestones: origin feat (background) + ASI-or-feat levels reached.
  const expectFeats = (c.backgroundKey ? 1 : 0) + asiCount(levels)
  const haveFeats = c.featKeys?.length ?? 0
  if (expectFeats > haveFeats) {
    chips.push({
      id: 'feats',
      label: `Feats/ASI: ${haveFeats} of ${expectFeats} milestones`,
      detail:
        'One origin feat from the background, plus an ASI-or-feat at class levels 4/8/12/16/19 (Fighter and Rogue get extras). An ASI "spent" as +2/+1 still counts — this is a reminder, not an error.'
    })
  }

  // HP never set.
  if (c.maxHp <= 1) {
    chips.push({ id: 'hp', label: 'Set max HP', detail: 'Type it in the vitals row — the suggested fixed-average appears next to it.' })
  }

  return chips
}
