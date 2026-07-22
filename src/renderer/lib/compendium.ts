// Compendium data layer: lazy-loads the normalized SRD 5.2.1 JSON that
// scripts/build-compendium.mjs emits into public/compendium/. CC-BY-4.0 —
// attribution in meta.json + LICENSE-SRD.md + the panel footer.

export interface MonsterAction {
  name: string
  desc: string
  type: string // ACTION | BONUS_ACTION | REACTION | LEGENDARY_ACTION | ...
  uses?: { type: string; param: number | null }
}

export interface Monster {
  key: string
  name: string
  size: string
  type: string
  subcategory?: string
  alignment: string
  ac: number
  acDetail?: string
  hp: number
  hitDice?: string
  initiative?: number
  speed: Record<string, number | boolean>
  abilities: { str: number; dex: number; con: number; int: number; wis: number; cha: number }
  saves: Record<string, number>
  skills: Record<string, number>
  senses: string[]
  passivePerception?: number
  immunities?: string
  resistances?: string
  vulnerabilities?: string
  conditionImmunities?: string
  languages?: string
  telepathy?: number
  cr: number
  xp?: number
  pb?: number
  environments?: string[]
  traits: { name: string; desc: string }[]
  actions: MonsterAction[]
}

/**
 * A trap card — homebrew-only (no SRD trap list), read from
 * <campaign>/homebrew/traps.json. Free-text fields render with dice
 * expressions clickable, so "4d10" in `damage`/`effect` rolls to the Game Log.
 */
export interface Trap {
  key: string
  name: string
  /** e.g. "Nuisance, levels 5–10" or "Deadly" (2024 DMG severity language). */
  severity?: string
  /** What sets it off, e.g. "Stepping on the pressure plate". */
  trigger?: string
  /** How it's noticed, e.g. "DC 15 Wisdom (Perception) — scuffed flagstone". */
  detect?: string
  /** How it's defused, e.g. "DC 12 Dexterity (Sleight of Hand) with thieves' tools". */
  disarm?: string
  /** Save line, e.g. "DC 15 Dexterity, half damage on success". */
  save?: string
  /** Attack bonus for attack-roll traps (rendered as a rollable +N). */
  attack?: number
  /** Damage dice, e.g. "4d10" (rollable). */
  damage?: string
  damageType?: string
  /** What happens — full effect text (dice inside are rollable too). */
  effect?: string
  homebrew?: boolean
}

export interface Spell {
  key: string
  name: string
  level: number
  school: string
  castingTime?: string
  reaction?: string
  range: string
  components: string
  material?: string
  duration: string
  concentration: boolean
  ritual: boolean
  desc: string
  higherLevel?: string
  classes: string[]
}

export interface NamedEntry {
  key: string
  name: string
  desc?: string
  section?: string
  /** True when merged from <campaign>/homebrew/ (🏠 badge). */
  homebrew?: boolean
  benefits?: { name: string; desc: string }[]
  traits?: { name: string; desc: string }[]
  [extra: string]: unknown
}

export interface ClassEntry extends NamedEntry {
  subclassOf?: string
  hitDice?: string
  casterType?: string
  primaryAbilities: string[]
  savingThrows: string[]
  features: { name: string; desc: string; levels: number[] }[]
}

export interface IndexEntry {
  k: CompendiumKind
  key: string
  name: string
}

export type CompendiumKind =
  | 'monster'
  | 'spell'
  | 'species'
  | 'class'
  | 'magic-item'
  | 'equipment'
  | 'feat'
  | 'background'
  | 'rule'
  | 'glossary'

export const KIND_META: Record<CompendiumKind, { label: string; plural: string; icon: string; file: string }> = {
  monster: { label: 'Monster', plural: 'Monsters', icon: '🐉', file: 'monsters.json' },
  spell: { label: 'Spell', plural: 'Spells', icon: '✨', file: 'spells.json' },
  species: { label: 'Species', plural: 'Species', icon: '🧝', file: 'species.json' },
  class: { label: 'Class', plural: 'Classes', icon: '⚔️', file: 'classes.json' },
  'magic-item': { label: 'Magic Item', plural: 'Magic Items', icon: '🗡️', file: 'magic-items.json' },
  equipment: { label: 'Equipment', plural: 'Equipment', icon: '🎒', file: 'equipment.json' },
  feat: { label: 'Feat', plural: 'Feats', icon: '💪', file: 'feats.json' },
  background: { label: 'Background', plural: 'Backgrounds', icon: '📜', file: 'backgrounds.json' },
  rule: { label: 'Rule', plural: 'Rules', icon: '⚖️', file: 'rules.json' },
  glossary: { label: 'Glossary', plural: 'Glossary', icon: '📖', file: 'glossary.json' }
}

export const KIND_ORDER = Object.keys(KIND_META) as CompendiumKind[]

const cache = new Map<string, Promise<unknown>>()

async function fetchJson<T>(file: string): Promise<T> {
  if (!cache.has(file)) {
    cache.set(
      file,
      fetch(`compendium/${file}`).then((r) => {
        if (!r.ok) throw new Error(`compendium/${file}: HTTP ${r.status}`)
        return r.json()
      })
    )
  }
  return cache.get(file) as Promise<T>
}

/**
 * Campaign homebrew: <campaign>/homebrew/<kind file> in the SAME schema as
 * the bundled data merges on top of the SRD — any monster, spell, species,
 * or subclass, no forms, no gates. The Electron renderer reads it over
 * asset://; the player portal serves it at /homebrew/. Entries are tagged
 * `homebrew: true` for the 🏠 badge. Requires a reload after edits (the
 * compendium caches for the session).
 */
async function fetchHomebrew(kind: CompendiumKind): Promise<NamedEntry[]> {
  const file = KIND_META[kind].file
  const key = `hb:${file}`
  if (!cache.has(key)) {
    const url =
      typeof window !== 'undefined' && (window as { hearth?: unknown }).hearth
        ? `asset:///homebrew/${file}`
        : `/homebrew/${file}`
    cache.set(
      key,
      fetch(url)
        .then(async (r) => {
          if (!r.ok) return []
          const rows = (await r.json()) as NamedEntry[]
          return Array.isArray(rows) ? rows.map((e) => ({ ...e, homebrew: true })) : []
        })
        .catch(() => [])
    )
  }
  return cache.get(key) as Promise<NamedEntry[]>
}

export const loadKind = (kind: CompendiumKind): Promise<NamedEntry[]> =>
  Promise.all([fetchJson<NamedEntry[]>(KIND_META[kind].file), fetchHomebrew(kind)]).then(
    ([base, hb]) => (hb.length ? [...base, ...hb] : base)
  )
export const loadMonsters = () => loadKind('monster') as unknown as Promise<Monster[]>

/**
 * Traps live outside the SRD compendium kinds — homebrew-only, same
 * homebrew-folder mechanics (asset:// in Electron, /homebrew/ on the portal,
 * cached for the session).
 */
export function loadTraps(): Promise<Trap[]> {
  const key = 'hb:traps.json'
  if (!cache.has(key)) {
    const url =
      typeof window !== 'undefined' && (window as { hearth?: unknown }).hearth
        ? 'asset:///homebrew/traps.json'
        : '/homebrew/traps.json'
    cache.set(
      key,
      fetch(url)
        .then(async (r) => {
          if (!r.ok) return []
          const rows = (await r.json()) as Trap[]
          return Array.isArray(rows) ? rows.map((t) => ({ ...t, homebrew: true })) : []
        })
        .catch(() => [])
    )
  }
  return cache.get(key) as Promise<Trap[]>
}
export const loadSpells = () => loadKind('spell') as unknown as Promise<Spell[]>
export const loadIndex = (): Promise<IndexEntry[]> =>
  Promise.all([
    fetchJson<IndexEntry[]>('index.json'),
    ...KIND_ORDER.map((k) =>
      fetchHomebrew(k).then((rows) => rows.map((e) => ({ k, key: e.key, name: e.name }) as IndexEntry))
    )
  ]).then((lists) => lists.flat())
export const loadMeta = () =>
  fetchJson<{ attribution: string; counts: Record<string, number> }>('meta.json')

/** 0.25 → "1/4", 5 → "5". */
export function formatCR(cr: number): string {
  if (cr === 0.125) return '1/8'
  if (cr === 0.25) return '1/4'
  if (cr === 0.5) return '1/2'
  return String(cr)
}

export function abilityMod(score: number): string {
  const m = Math.floor((score - 10) / 2)
  return m >= 0 ? `+${m}` : String(m)
}

export const SPELL_LEVEL_LABEL = (l: number) => (l === 0 ? 'Cantrip' : `Level ${l}`)
