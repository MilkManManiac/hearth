/**
 * Tiny localStorage-backed prefs: favorited + recently fired library assets.
 * Values are arrays of asset `file` paths (campaign-relative) — the stable id
 * shared by library.json and scene items. Deliberately not part of the Zustand
 * store or campaign JSON; this is per-machine DM convenience only.
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

let favorites = read(FAVORITES_KEY)
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

/** Reactive list of favorited asset files. */
export function useFavorites(): string[] {
  return useSyncExternalStore(subscribe, () => favorites)
}

/** Reactive list of recently fired asset files, most recent first. */
export function useRecents(): string[] {
  return useSyncExternalStore(subscribe, () => recents)
}

export function toggleFavorite(file: string): void {
  favorites = favorites.includes(file)
    ? favorites.filter((f) => f !== file)
    : [...favorites, file]
  write(FAVORITES_KEY, favorites)
}

/** Record an asset fired during play. Deduped, most-recent-first, capped. */
export function pushRecent(file: string): void {
  recents = [file, ...recents.filter((f) => f !== file)].slice(0, RECENTS_MAX)
  write(RECENTS_KEY, recents)
}
