import { create } from 'zustand'
import type { RollEvent } from '../../shared/types'

// Game Log state (D1) — kept out of the big app store on purpose: the portal
// bundle uses its own feed (SSE/HTTP), and Electron windows wire this store to
// the IPC hub via wireRollFeed().

interface RollState {
  rolls: RollEvent[]
  /** DM rolls default to hidden from players (DDB's "Self"); this flips the default. */
  dmPublic: boolean
  setDmPublic: (v: boolean) => void
  addRoll: (r: RollEvent) => void
  setRolls: (rs: RollEvent[]) => void
}

export const useRollStore = create<RollState>((set) => ({
  rolls: [],
  dmPublic: false,
  setDmPublic: (v) => set({ dmPublic: v }),
  addRoll: (r) =>
    set((s) => (s.rolls.some((x) => x.id === r.id) ? s : { rolls: [...s.rolls.slice(-299), r] })),
  setRolls: (rs) => set({ rolls: rs })
}))

let wired = false

/** Subscribe this window to the main-process roll hub (idempotent). */
export function wireRollFeed(): void {
  if (wired || typeof window === 'undefined' || !window.hearth?.onRoll) return
  wired = true
  void window.hearth.getRollLog().then((rs) => useRollStore.getState().setRolls(rs))
  window.hearth.onRoll((r) => useRollStore.getState().addRoll(r))
}

/** Send a roll to the campaign hub (it echoes back via the feed). */
export function submitRoll(roll: RollEvent): void {
  void window.hearth?.sendRoll(roll)
}
