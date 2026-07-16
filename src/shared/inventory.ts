import type { Character, Coins, InventoryItem } from './types'

// Inventory/equipment math (SURFACES-PLAN M4) — pure and process-agnostic:
// the renderer derives AC/coins at render, the main process reuses the same
// parsers for the one-time free-text → structured-rows migration. Derived
// values are never persisted (the Foundry lesson); the only stored choice is
// `acOverride`, which is itself a choice ("my AC is weird, trust me").

export const COIN_KEYS = ['pp', 'gp', 'ep', 'sp', 'cp'] as const
export type CoinKey = (typeof COIN_KEYS)[number]

/** Copper value of one coin of each denomination. */
export const COIN_CP: Record<CoinKey, number> = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 }

export const emptyCoins = (): Coins => ({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 })

export const coinsTotalCp = (c: Coins | undefined): number =>
  c ? COIN_KEYS.reduce((n, k) => n + (c[k] ?? 0) * COIN_CP[k], 0) : 0

/** "312 cp" → "3 gp 1 sp 2 cp" (display only — never rewrites the pouch). */
export function formatCp(cp: number): string {
  if (cp === 0) return '0 cp'
  const parts: string[] = []
  let rest = Math.abs(cp)
  for (const k of COIN_KEYS) {
    if (k === 'ep') continue // nobody thinks in electrum
    const n = Math.floor(rest / COIN_CP[k])
    if (n > 0) {
      parts.push(`${n} ${k}`)
      rest -= n * COIN_CP[k]
    }
  }
  return `${cp < 0 ? '−' : ''}${parts.join(' ')}`
}

/**
 * Spend `costCp` from a pouch with auto-make-change: pays with the smallest
 * coins first, then breaks ONE larger coin when short and keeps the change.
 * Returns the new pouch, or null if the pouch can't cover it.
 */
export function spendCoins(pouch: Coins, costCp: number): Coins | null {
  if (costCp <= 0) return { ...pouch }
  if (coinsTotalCp(pouch) < costCp) return null
  const out = { ...emptyCoins(), ...pouch }
  let owed = costCp
  // Small coins first (preserves big coins), ascending value.
  for (const k of [...COIN_KEYS].reverse()) {
    const pay = Math.min(out[k], Math.floor(owed / COIN_CP[k]))
    out[k] -= pay
    owed -= pay * COIN_CP[k]
  }
  if (owed > 0) {
    // Break the smallest single coin that covers the remainder; change → cp/sp/gp.
    for (const k of [...COIN_KEYS].reverse()) {
      if (COIN_CP[k] >= owed && out[k] > 0) {
        out[k] -= 1
        let change = COIN_CP[k] - owed
        owed = 0
        for (const ck of COIN_KEYS) {
          if (ck === 'ep') continue
          const n = Math.floor(change / COIN_CP[ck])
          out[ck] += n
          change -= n * COIN_CP[ck]
        }
        break
      }
    }
  }
  return owed > 0 ? null : out
}

/** Add coins of a single denomination (negative delta = remove, floored at 0 via make-change). */
export function addCoins(pouch: Coins | undefined, key: CoinKey, delta: number): Coins | null {
  const base = { ...emptyCoins(), ...(pouch ?? {}) }
  if (delta >= 0) return { ...base, [key]: base[key] + delta }
  return spendCoins(base, -delta * COIN_CP[key])
}

/** Catalog `cost` strings ("10 GP", "2 sp", "1,500 gp") → copper, or null. */
export function parseCostCp(cost: string | undefined): number | null {
  const m = /^([\d,]+)\s*(cp|sp|ep|gp|pp)\b/i.exec(String(cost ?? '').trim())
  if (!m) return null
  const n = parseInt(m[1].replace(/,/g, ''), 10)
  return Number.isFinite(n) ? n * COIN_CP[m[2].toLowerCase() as CoinKey] : null
}

// ---------------------------------------------------------------------------
// Auto-AC: the 13 SRD 5.2.1 armors, hand-tabled (the shipped equipment.json
// has no ac fields — see SURFACES-PLAN "codebase seams"). 2024 values.
// ---------------------------------------------------------------------------

export interface ArmorStat {
  /** Word-boundary name fragment that identifies this armor. */
  match: string
  base: number
  /** Max dex bonus added: null = unlimited (light), 2 = medium, 0 = heavy. */
  dexCap: number | null
  kind: 'light' | 'medium' | 'heavy'
}

/** Longest match first so "studded leather" beats "leather", "half plate"/"breastplate" beat "plate". */
export const ARMOR_TABLE: ArmorStat[] = [
  { match: 'studded leather', base: 12, dexCap: null, kind: 'light' },
  { match: 'chain shirt', base: 13, dexCap: 2, kind: 'medium' },
  { match: 'breastplate', base: 14, dexCap: 2, kind: 'medium' },
  { match: 'scale mail', base: 14, dexCap: 2, kind: 'medium' },
  { match: 'half plate', base: 15, dexCap: 2, kind: 'medium' },
  { match: 'chain mail', base: 16, dexCap: 0, kind: 'heavy' },
  { match: 'ring mail', base: 14, dexCap: 0, kind: 'heavy' },
  { match: 'padded', base: 11, dexCap: null, kind: 'light' },
  { match: 'leather', base: 11, dexCap: null, kind: 'light' },
  { match: 'splint', base: 17, dexCap: 0, kind: 'heavy' },
  { match: 'plate', base: 18, dexCap: 0, kind: 'heavy' },
  { match: 'hide', base: 12, dexCap: 2, kind: 'medium' }
]

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim()

/** "+1 Chain Mail" / "Warhammer, +1" → 1; no bonus → 0. */
export const nameBonus = (name: string): number => {
  const m = /\+\s*(\d)/.exec(name)
  return m ? parseInt(m[1], 10) : 0
}

/** Identify a body-armor item by name (word-boundary, longest fragment wins). */
export function armorStats(name: string): ArmorStat | null {
  const n = norm(name)
  for (const a of ARMOR_TABLE) {
    if (new RegExp(`\\b${a.match}\\b`).test(n)) return a
  }
  return null
}

export const isShield = (name: string): boolean => /\bshield\b/.test(norm(name))

const abilityMod = (score: number) => Math.floor((score - 10) / 2)

const hasClass = (c: Character, key: string): boolean =>
  c.classKey === key || (c.multiclass ?? []).some((e) => e.classKey === key && e.level > 0)

/**
 * Derived AC from the structured inventory (2024 formulas). Returns null when
 * the character has no structured inventory yet — legacy sheets keep their
 * manual `ac`. `acBonus` on any equipped item stacks (rings, cloaks…).
 */
export function autoAc(c: Character): { value: number; label: string } | null {
  if (!c.inventory) return null
  const equipped = c.inventory.filter((i) => i.equipped)
  const armor = equipped
    .map((i) => ({ i, stat: armorStats(i.name) }))
    .filter((x): x is { i: InventoryItem; stat: ArmorStat } => !!x.stat)
    .sort((a, b) => b.stat.base - a.stat.base)[0]
  const shield = equipped.find((i) => isShield(i.name) && !armorStats(i.name))
  const dex = abilityMod(c.abilities.dex)
  const misc = equipped
    .filter((i) => i !== armor?.i && i !== shield)
    .reduce((n, i) => n + (i.acBonus ?? 0), 0)

  let value: number
  let label: string
  if (armor) {
    const dexPart = armor.stat.dexCap == null ? dex : Math.min(dex, armor.stat.dexCap)
    value = armor.stat.base + dexPart + nameBonus(armor.i.name) + (armor.i.acBonus ?? 0)
    label = armor.i.name
  } else if (hasClass(c, 'monk') && !shield) {
    value = 10 + dex + abilityMod(c.abilities.wis)
    label = 'Unarmored Defense (Monk)'
  } else if (hasClass(c, 'barbarian')) {
    value = 10 + dex + abilityMod(c.abilities.con)
    label = 'Unarmored Defense (Barbarian)'
  } else {
    value = 10 + dex
    label = 'Unarmored'
  }
  if (shield) {
    value += 2 + nameBonus(shield.name) + (shield.acBonus ?? 0)
    label += ' + shield'
  }
  return { value: value + misc, label }
}

/** The AC every surface should show: override > auto > legacy manual. */
export function effectiveAc(c: Character): { value: number; source: 'override' | 'auto' | 'manual'; label?: string } {
  if (c.acOverride != null) return { value: c.acOverride, source: 'override' }
  const auto = autoAc(c)
  if (auto) return { value: auto.value, source: 'auto', label: auto.label }
  return { value: c.ac, source: 'manual' }
}

export const attunedCount = (c: Character): number =>
  (c.inventory ?? []).filter((i) => i.attuned).length

let itemSeq = 0
export const newItemId = (): string =>
  `i${Date.now().toString(36)}${(itemSeq++ % 1296).toString(36).padStart(2, '0')}`

// ---------------------------------------------------------------------------
// Free-text equipment → structured rows (the one-time character migration).
// ---------------------------------------------------------------------------

export interface MigratedInventory {
  items: InventoryItem[]
  /** Total copper found in bare coin lines ("80 gp"). */
  coinsCp: number
}

const COIN_LINE = /^([\d,]+)\s*(cp|sp|ep|gp|pp)\.?$/i
const QTY_SUFFIX = /\s*[×x]\s*([\d,]+)\s*$/i

/** One free-text gear line → one item row (qty/attuned/notes parsed out). */
function parseLine(line: string): InventoryItem | null {
  let s = line.trim()
  if (!s) return null
  let attuned = false
  if (s.startsWith('*')) {
    attuned = true
    s = s.slice(1).trim()
  }
  // "(Nick mastery)" style trailing parenthetical → notes.
  let notes: string | undefined
  const paren = /^(.*\S)\s*\(([^()]+)\)$/.exec(s)
  if (paren) {
    s = paren[1]
    notes = paren[2].trim()
  }
  let qty = 1
  const q = QTY_SUFFIX.exec(s)
  if (q) {
    qty = parseInt(q[1].replace(/,/g, ''), 10) || 1
    s = s.slice(0, q.index).trim()
  }
  // Attuned convention also lived mid-word in some imports ("(attuned — …)").
  if (notes && /^attuned\b/i.test(notes)) attuned = true
  const item: InventoryItem = { id: newItemId(), name: s }
  if (qty !== 1) item.qty = qty
  if (attuned) item.attuned = true
  if (notes) item.notes = notes
  return item
}

/**
 * Convert legacy free-text equipment lines into structured rows. Kit lines
 * with 3+ commas and no parenthetical ("Backpack, bedroll, mess kit, …")
 * split into one row each; "Warhammer, +1" style lines stay whole. Bare coin
 * lines fund the pouch. Armor + shield rows come back `equipped` so auto-AC
 * has something to chew on (the caller reconciles against the old manual AC).
 */
export function migrateEquipmentLines(lines: string[]): MigratedInventory {
  const items: InventoryItem[] = []
  let coinsCp = 0
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const coin = COIN_LINE.exec(line)
    if (coin) {
      coinsCp += parseInt(coin[1].replace(/,/g, ''), 10) * COIN_CP[coin[2].toLowerCase() as CoinKey]
      continue
    }
    const pieces =
      line.split(',').length >= 4 && !line.includes('(')
        ? line.split(',').map((p) => p.trim()).filter(Boolean)
        : [line]
    for (const piece of pieces) {
      const item = parseLine(piece)
      if (!item) continue
      if (armorStats(item.name) || isShield(item.name)) item.equipped = true
      items.push(item)
    }
  }
  return { items, coinsCp }
}

/** Copper total → a sensible pouch (gp-heavy, matching how tables think). */
export function cpToCoins(cp: number): Coins {
  const out = emptyCoins()
  out.gp = Math.floor(cp / 100)
  cp -= out.gp * 100
  out.sp = Math.floor(cp / 10)
  out.cp = cp - out.sp * 10
  return out
}
