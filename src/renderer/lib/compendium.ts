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

export const loadKind = (kind: CompendiumKind) => fetchJson<NamedEntry[]>(KIND_META[kind].file)
export const loadMonsters = () => fetchJson<Monster[]>('monsters.json')
export const loadSpells = () => fetchJson<Spell[]>('spells.json')
export const loadIndex = () => fetchJson<IndexEntry[]>('index.json')
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
