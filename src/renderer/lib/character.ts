import type { AbilityScores, Character } from '../../shared/types'
import type { ClassEntry } from './compendium'

// Character math (2024 rules) — derived at render, never persisted.

export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
export type AbilityKey = (typeof ABILITY_KEYS)[number]

export const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma'
}

/** Skill → governing ability (2024 list, snake_case ids match the SRD data). */
export const SKILL_ABILITY: Record<string, AbilityKey> = {
  acrobatics: 'dex',
  animal_handling: 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  sleight_of_hand: 'dex',
  stealth: 'dex',
  survival: 'wis'
}

export const mod = (score: number) => Math.floor((score - 10) / 2)
export const fmtMod = (m: number) => (m >= 0 ? `+${m}` : String(m))
export const profBonus = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4)

export function saveBonus(c: Character, ability: AbilityKey, saveProfs: string[]): number {
  return mod(c.abilities[ability]) + (saveProfs.includes(ability) ? profBonus(c.level) : 0)
}

export function skillBonus(c: Character, skill: string): number {
  const base = mod(c.abilities[SKILL_ABILITY[skill] ?? 'str'])
  if (c.expertise?.includes(skill)) return base + 2 * profBonus(c.level)
  if (c.skillProfs.includes(skill)) return base + profBonus(c.level)
  return base
}

export const passive = (c: Character, skill: string) => 10 + skillBonus(c, skill)

/** Full-caster spell slots by class level (PHB table, unchanged in 2024). */
const FULL_SLOTS: number[][] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1]
]

/** Warlock Pact Magic: [slotCount, slotLevel] by class level. */
const PACT: [number, number][] = [
  [1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5],
  [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5]
]

/** One class the character has levels in (primary first; its level is derived from the total). */
export interface ClassLevel {
  classKey?: string
  subclassKey?: string
  level: number
}

/** Resolve `level` (total) + `multiclass` into per-class levels, primary first. */
export function classLevels(c: Character): ClassLevel[] {
  const extra = (c.multiclass ?? []).filter((e) => e.level > 0)
  const extraLvls = extra.reduce((n, e) => n + e.level, 0)
  return [
    { classKey: c.classKey, subclassKey: c.subclassKey, level: Math.max(1, c.level - extraLvls) },
    ...extra
  ]
}

/**
 * Spell slots per level ("1".."9" → count). Single class: warlock uses Pact
 * Magic; HALF casters (paladin/ranger) use ceil(level/2) on the full table
 * (2024 rounds UP from level 1). Multiclass: combined caster level = full
 * levels + ceil(half levels / 2); warlock pact slots are added on top.
 */
export function spellSlots(c: Character, classes: ClassEntry[]): Record<string, number> {
  const out: Record<string, number> = {}
  let combined = 0
  for (const { classKey, level } of classLevels(c)) {
    const cls = classes.find((x) => x.key === classKey)
    if (!cls) continue
    const lvl = Math.min(20, Math.max(1, level))
    if (cls.key === 'warlock') {
      const [count, slotLvl] = PACT[lvl - 1]
      out[String(slotLvl)] = (out[String(slotLvl)] ?? 0) + count
    } else if (cls.casterType) {
      combined += cls.casterType === 'HALF' ? Math.ceil(lvl / 2) : lvl
    }
  }
  if (combined > 0) {
    const row = FULL_SLOTS[Math.min(20, combined) - 1] ?? []
    row.forEach((n, i) => {
      if (n > 0) out[String(i + 1)] = (out[String(i + 1)] ?? 0) + n
    })
  }
  return out
}

/** Suggested max HP: level-1 max die + (level-1) × (avg die + con). Advisory only; skipped for multiclass (mixed dice). */
export function suggestedMaxHp(c: Character, hitDice: string | undefined): number | null {
  if (c.multiclass?.some((e) => e.level > 0)) return null
  const m = /d(\d+)/i.exec(hitDice ?? '')
  if (!m) return null
  const die = parseInt(m[1], 10)
  const con = mod(c.abilities.con)
  return die + con + (c.level - 1) * (Math.ceil((die + 1) / 2) + con)
}

export const defaultAbilities: AbilityScores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }

/** 2024 standard array, for the builder hint. */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]
