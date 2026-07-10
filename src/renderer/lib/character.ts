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

/**
 * Spell slots per level ("1".."9" → count) for a character. Warlock uses Pact
 * Magic; HALF casters (paladin/ranger) use ceil(level/2) on the full table
 * (2024 rounds UP from level 1).
 */
export function spellSlots(c: Character, cls: ClassEntry | undefined): Record<string, number> {
  if (!cls?.casterType && cls?.key !== 'warlock') return {}
  const lvl = Math.min(20, Math.max(1, c.level))
  if (cls.key === 'warlock') {
    const [count, slotLvl] = PACT[lvl - 1]
    return { [String(slotLvl)]: count }
  }
  const effective = cls.casterType === 'HALF' ? Math.ceil(lvl / 2) : lvl
  const row = FULL_SLOTS[Math.min(20, Math.max(1, effective)) - 1] ?? []
  const out: Record<string, number> = {}
  row.forEach((n, i) => {
    if (n > 0) out[String(i + 1)] = n
  })
  return out
}

/** Suggested max HP: level-1 max die + (level-1) × (avg die + con). Advisory only. */
export function suggestedMaxHp(c: Character, hitDice: string | undefined): number | null {
  const m = /d(\d+)/i.exec(hitDice ?? '')
  if (!m) return null
  const die = parseInt(m[1], 10)
  const con = mod(c.abilities.con)
  return die + con + (c.level - 1) * (Math.ceil((die + 1) / 2) + con)
}

export const defaultAbilities: AbilityScores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }

/** 2024 standard array, for the builder hint. */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]
