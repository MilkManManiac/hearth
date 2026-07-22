import { create } from 'zustand'
import type { StatRefInline } from '../../shared/types'

// Shared look + live state for {{monster:...}} / {{trap:...}} stat-ref chips.
// Follows the cueMeta convention: text badges, tinted chip borders.

export const STAT_TEXT: Record<StatRefInline['kind'], string> = {
  monster: 'MON',
  trap: 'TRAP'
}

export const STAT_TITLE: Record<StatRefInline['kind'], string> = {
  monster: 'Monster stat block — click for the rollable card + HP tracker',
  trap: 'Trap card — click for detection, saves, and rollable damage'
}

/** Chip container colors per kind (border/bg/text) — distinct from audio cues. */
export const STAT_CHIP_CLASS: Record<StatRefInline['kind'], string> = {
  monster: 'border-red-500/60 bg-red-500/10 text-red-300',
  trap: 'border-amber-500/60 bg-amber-500/10 text-amber-300'
}

export const STAT_CHIP_HOVER: Record<StatRefInline['kind'], string> = {
  monster: 'hover:bg-red-500/25',
  trap: 'hover:bg-amber-500/25'
}

/**
 * HP-pool key. The chip's label distinguishes instances — `{{monster:mimic|A}}`
 * and `{{monster:mimic|B}}` damage separately; unlabeled chips of the same
 * monster in the same scene share one pool.
 */
export function hpKey(sceneId: string | undefined, ref: string, label: string | undefined): string {
  return `${sceneId ?? 'global'}::${ref}::${label ?? ''}`
}

interface StatRefState {
  /** Current HP by pool key. Absent = untouched (treat as max). Session memory only. */
  hp: Record<string, number>
  setHp: (key: string, value: number) => void
  clearHp: (key: string) => void
  /** How many stat-ref popups are open — the teleprompter yields Space while > 0. */
  openCount: number
  bumpOpen: (delta: number) => void
}

export const useStatRefStore = create<StatRefState>((set) => ({
  hp: {},
  setHp: (key, value) => set((s) => ({ hp: { ...s.hp, [key]: value } })),
  clearHp: (key) =>
    set((s) => {
      const next = { ...s.hp }
      delete next[key]
      return { hp: next }
    }),
  openCount: 0,
  bumpOpen: (delta) => set((s) => ({ openCount: Math.max(0, s.openCount + delta) }))
}))
