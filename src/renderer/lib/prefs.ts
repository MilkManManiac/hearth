/**
 * Tiny localStorage-backed prefs: recently fired library assets. Values are
 * arrays of asset `file` paths (campaign-relative) — the stable id shared by
 * library.json and scene items. Deliberately not part of the Zustand store or
 * campaign JSON; this is per-machine DM convenience only.
 *
 * Favorites USED to live here too — they're now `favorite: true` in
 * library.json (per-campaign, greppable by authoring sessions); the legacy
 * key sticks around only for the one-time migration below.
 */
import { useSyncExternalStore } from 'react'

const FAVORITES_KEY = 'hearth:favorites'
const RECENTS_KEY = 'hearth:recents'
const RECENTS_MAX = 10

function read(key: string): string[] {
  try {
    const val = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(val) ? val.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

let recents = read(RECENTS_KEY)
const listeners = new Set<() => void>()

function write(key: string, value: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota / private mode — keep the in-memory copy for this session
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Reactive list of recently fired asset files, most recent first. */
export function useRecents(): string[] {
  return useSyncExternalStore(subscribe, () => recents)
}

/**
 * One-time migration: pull the legacy localStorage favorites that exist in
 * the CURRENT library (multi-campaign machines keep the rest for whichever
 * campaign owns them). Caller patches them into library.json; entries handed
 * out are removed from the key so this never double-fires.
 */
export function takeLegacyFavorites(inLibrary: (file: string) => boolean): string[] {
  const all = read(FAVORITES_KEY)
  if (all.length === 0) return []
  const mine = all.filter(inLibrary)
  if (mine.length === 0) return []
  const rest = all.filter((f) => !inLibrary(f))
  if (rest.length > 0) write(FAVORITES_KEY, rest)
  else localStorage.removeItem(FAVORITES_KEY)
  return mine
}

/** Record an asset fired during play. Deduped, most-recent-first, capped. */
export function pushRecent(file: string): void {
  recents = [file, ...recents.filter((f) => f !== file)].slice(0, RECENTS_MAX)
  write(RECENTS_KEY, recents)
}
