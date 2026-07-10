// Per-class progression tables (2024 PHB), hand-tabled for the 12 SRD classes
// (DDB-MECHANICS D2). These drive the builder's owed-choices chips and the
// level-up modal — advisory numbers, never hard blocks (warn-don't-block).
// Homebrew classes simply have no entry and get no counts.

export interface ClassProgression {
  /** Skill proficiency choices at level 1 in this class. */
  skills: { count: number; from: string[] | 'any' }
  /** Class levels that grant an ASI-or-feat. */
  asiLevels: number[]
  /** Cantrips known at class level 1..20 (absent = not a caster). */
  cantrips?: number[]
  /** Prepared/known spells at class level 1..20. */
  prepared?: number[]
}

const SK = {
  acrobatics: 'acrobatics',
  animal_handling: 'animal_handling',
  arcana: 'arcana',
  athletics: 'athletics',
  deception: 'deception',
  history: 'history',
  insight: 'insight',
  intimidation: 'intimidation',
  investigation: 'investigation',
  medicine: 'medicine',
  nature: 'nature',
  perception: 'perception',
  persuasion: 'persuasion',
  religion: 'religion',
  sleight_of_hand: 'sleight_of_hand',
  stealth: 'stealth',
  survival: 'survival'
}

/** All classes pick their subclass at level 3 in the 2024 rules. */
export const SUBCLASS_LEVEL = 3

const ASI_STD = [4, 8, 12, 16, 19]

// Shared 2024 prepared-spell tables.
const PREP_FULL = [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22]
const PREP_SORC = [2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22]
const PREP_HALF = [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15]
const PREP_LOCK = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15]

const cantrips = (l1: number, l4: number, l10: number): number[] =>
  Array.from({ length: 20 }, (_, i) => (i + 1 >= 10 ? l10 : i + 1 >= 4 ? l4 : l1))

export const PROGRESSION: Record<string, ClassProgression> = {
  barbarian: {
    skills: { count: 2, from: [SK.animal_handling, SK.athletics, SK.intimidation, SK.nature, SK.perception, SK.survival] },
    asiLevels: ASI_STD
  },
  bard: {
    skills: { count: 3, from: 'any' },
    asiLevels: ASI_STD,
    cantrips: cantrips(2, 3, 4),
    prepared: PREP_FULL
  },
  cleric: {
    skills: { count: 2, from: [SK.history, SK.insight, SK.medicine, SK.persuasion, SK.religion] },
    asiLevels: ASI_STD,
    cantrips: cantrips(3, 4, 5),
    prepared: PREP_FULL
  },
  druid: {
    skills: {
      count: 2,
      from: [SK.arcana, SK.animal_handling, SK.insight, SK.medicine, SK.nature, SK.perception, SK.religion, SK.survival]
    },
    asiLevels: ASI_STD,
    cantrips: cantrips(2, 3, 4),
    prepared: PREP_FULL
  },
  fighter: {
    skills: {
      count: 2,
      from: [SK.acrobatics, SK.animal_handling, SK.athletics, SK.history, SK.insight, SK.intimidation, SK.persuasion, SK.perception, SK.survival]
    },
    asiLevels: [4, 6, 8, 12, 14, 16, 19]
  },
  monk: {
    skills: { count: 2, from: [SK.acrobatics, SK.athletics, SK.history, SK.insight, SK.religion, SK.stealth] },
    asiLevels: ASI_STD
  },
  paladin: {
    skills: { count: 2, from: [SK.athletics, SK.insight, SK.intimidation, SK.medicine, SK.persuasion, SK.religion] },
    asiLevels: ASI_STD,
    prepared: PREP_HALF
  },
  ranger: {
    skills: {
      count: 3,
      from: [SK.animal_handling, SK.athletics, SK.insight, SK.investigation, SK.nature, SK.perception, SK.stealth, SK.survival]
    },
    asiLevels: ASI_STD,
    prepared: PREP_HALF
  },
  rogue: {
    skills: {
      count: 4,
      from: [SK.acrobatics, SK.athletics, SK.deception, SK.insight, SK.intimidation, SK.investigation, SK.perception, SK.persuasion, SK.sleight_of_hand, SK.stealth]
    },
    asiLevels: [4, 8, 10, 12, 16, 19]
  },
  sorcerer: {
    skills: { count: 2, from: [SK.arcana, SK.deception, SK.insight, SK.intimidation, SK.persuasion, SK.religion] },
    asiLevels: ASI_STD,
    cantrips: cantrips(4, 5, 6),
    prepared: PREP_SORC
  },
  warlock: {
    skills: {
      count: 2,
      from: [SK.arcana, SK.deception, SK.history, SK.intimidation, SK.investigation, SK.nature, SK.religion]
    },
    asiLevels: ASI_STD,
    cantrips: cantrips(2, 3, 4),
    prepared: PREP_LOCK
  },
  wizard: {
    skills: { count: 2, from: [SK.arcana, SK.history, SK.insight, SK.investigation, SK.medicine, SK.religion] },
    asiLevels: ASI_STD,
    cantrips: cantrips(3, 4, 5),
    prepared: PREP_FULL
  }
}

const at = (table: number[] | undefined, level: number): number =>
  table?.[Math.min(20, Math.max(1, level)) - 1] ?? 0

/** Total cantrips/prepared expected across all of a character's classes. */
export function expectedSpells(
  levels: { classKey?: string; level: number }[]
): { cantrips: number; prepared: number } {
  let c = 0
  let p = 0
  for (const { classKey, level } of levels) {
    const prog = classKey ? PROGRESSION[classKey] : undefined
    c += at(prog?.cantrips, level)
    p += at(prog?.prepared, level)
  }
  return { cantrips: c, prepared: p }
}

/** ASI-or-feat milestones reached across all classes. */
export function asiCount(levels: { classKey?: string; level: number }[]): number {
  let n = 0
  for (const { classKey, level } of levels) {
    const prog = classKey ? PROGRESSION[classKey] : undefined
    if (prog) n += prog.asiLevels.filter((l) => l <= level).length
  }
  return n
}
