import type { RollDieGroup, RollEvent } from './types'

// Dice engine (DDB-MECHANICS D1). Parses "2d6+1d4+3"-style expressions and
// rolls them into RollEvents. DDB parity: adv/dis rolls two d20s and keeps
// one; crit doubles the DICE (not the modifier) of a damage roll. Nothing
// auto-applies anywhere — rolls are information, per the parity ceiling.

export interface DiceTerm {
  count: number
  /** 0 = a flat number stored in `count`. */
  die: number
  sign: 1 | -1
}

/** Parse "2d6 + 1d4 - 1" → terms. Returns null if the expression is invalid. */
export function parseDice(expr: string): DiceTerm[] | null {
  const cleaned = expr.toLowerCase().replace(/\s+/g, '')
  if (!cleaned) return null
  // Tokenize: optional sign, then NdM or a flat integer.
  const re = /([+-]?)(?:(\d*)d(\d+)|(\d+))/g
  const terms: DiceTerm[] = []
  let consumed = 0
  for (const m of cleaned.matchAll(re)) {
    if (m.index !== consumed) return null
    consumed += m[0].length
    const sign: 1 | -1 = m[1] === '-' ? -1 : 1
    if (m[3] !== undefined) {
      const count = m[2] === '' ? 1 : parseInt(m[2], 10)
      const die = parseInt(m[3], 10)
      if (count < 1 || count > 100 || die < 2 || die > 1000) return null
      terms.push({ count, die, sign })
    } else {
      terms.push({ count: parseInt(m[4], 10), die: 0, sign })
    }
  }
  if (consumed !== cleaned.length || terms.length === 0) return null
  return terms
}

const rollDie = (die: number) => Math.floor(Math.random() * die) + 1

export interface RollOptions {
  who: string
  what: string
  characterId?: string
  /** Advantage/disadvantage — meaningful when the expression's lead term is 1d20. */
  mode?: 'adv' | 'dis'
  /** Double all dice counts (damage crit). */
  crit?: boolean
  dmOnly?: boolean
}

/**
 * Roll an expression into a RollEvent. Returns null on a parse failure.
 * Adv/dis: when the FIRST term is exactly 1d20, two are rolled and the
 * higher/lower kept; the kept die drives the crit/fumble flag.
 */
export function rollExpr(expr: string, opts: RollOptions): RollEvent | null {
  const terms = parseDice(expr)
  if (!terms) return null
  const groups: RollDieGroup[] = []
  let total = 0
  let modifier = 0
  let crit: RollEvent['crit']
  const isD20 = terms[0].die === 20 && terms[0].count === 1 && terms[0].sign === 1
  terms.forEach((t, ti) => {
    if (t.die === 0) {
      modifier += t.sign * t.count
      total += t.sign * t.count
      return
    }
    const count = opts.crit ? t.count * 2 : t.count
    if (ti === 0 && isD20 && opts.mode) {
      const a = rollDie(20)
      const b = rollDie(20)
      const keepIdx = opts.mode === 'adv' ? (a >= b ? 0 : 1) : (a <= b ? 0 : 1)
      const keptVal = keepIdx === 0 ? a : b
      groups.push({ die: 20, results: [a, b], kept: [keepIdx] })
      total += keptVal
      if (keptVal === 20) crit = 'crit'
      if (keptVal === 1) crit = 'fumble'
      return
    }
    const results = Array.from({ length: count }, () => rollDie(t.die))
    groups.push({ die: t.die, results, kept: results.map((_, i) => i) })
    const sum = results.reduce((n, r) => n + r, 0)
    total += t.sign * sum
    if (ti === 0 && isD20 && !opts.mode) {
      if (results[0] === 20) crit = 'crit'
      if (results[0] === 1) crit = 'fumble'
    }
  })
  return {
    id: (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`) as string,
    ts: Date.now(),
    who: opts.who,
    characterId: opts.characterId,
    what: opts.what,
    expr: expr.replace(/\s+/g, '') + (opts.mode ? ` (${opts.mode})` : '') + (opts.crit ? ' (crit)' : ''),
    total,
    groups,
    modifier,
    mode: opts.mode,
    crit,
    dmOnly: opts.dmOnly
  }
}

/** "1d20+5" for a check/save/attack with a flat bonus. */
export const d20Expr = (bonus: number) => (bonus === 0 ? '1d20' : bonus > 0 ? `1d20+${bonus}` : `1d20${bonus}`)

/** Compact per-group text for log rendering: "d20 [14, ~3~] + d6 [4]". */
export function groupText(g: RollDieGroup): string {
  const parts = g.results.map((r, i) => (g.kept.includes(i) ? String(r) : `~${r}~`))
  return `d${g.die} [${parts.join(', ')}]`
}
