// Clean the filename junk out of library.json tags.
//
// The bulk-import waves seeded tags by splitting filenames, so the "tags"
// index is dominated by tokens like wav/mono/nox/essentials/pack — noise that
// pollutes every search (in-app and Claude scene-authoring alike). This strips
// those, drops pure-number/version tokens, and migrates recognized mood words
// out of tags into the structured `moods` field.
//
//   node scripts/clean-library-tags.mjs "<campaign>/library.json"          (dry run — report only)
//   node scripts/clean-library-tags.mjs "<campaign>/library.json" --write  (backup, then apply)
//
// NEVER run --write while Hearth is mid-edit in the same campaign: the app
// rewrites library.json wholesale on any tag/trash edit and one side will win.
// Close Hearth (or at least the Library/Triage panels) first.

import fs from 'node:fs'
import path from 'node:path'

// Mirror of LIBRARY_MOODS in src/shared/types.ts (scripts stay dependency-free).
const MOOD_WORDS = new Set([
  'calm', 'tense', 'eerie', 'epic', 'dark', 'somber', 'hopeful', 'festive',
  'mysterious', 'heroic', 'playful', 'triumphant'
])

// Filename/pack garbage that carries zero retrieval value. Provenance tokens
// (nox/fap/km/blacis/mp1/oga) belong in `source`, not tags.
const JUNK = new Set([
  // file formats / tech
  'wav', 'ogg', 'mp3', 'm4a', 'flac', 'aiff', 'aif', 'mono', 'stereo', 'khz',
  'bit', '16bit', '24bit', 'audio', 'sound', 'sounds', 'sfx', 'fx',
  // pack / import tokens
  'pack', 'packs', 'essential', 'essentials', 'bundle', 'vol', 'volume',
  'nox', 'noxx', 'fap', 'fapx', 'mp1', 'km', 'blacis', 'oga', 'kmontesdev',
  // filler
  'the', 'and', 'of', 'for', 'with', 'file', 'files', 'track', 'final',
  'edit', 'mix', 'master', 'copy', 'version', 'ver', 'var', 'loopable'
])

const isJunk = (t) =>
  JUNK.has(t) || /^\d+$/.test(t) || /^v\d+$/.test(t) || t.length < 2

const [, , libPath, writeFlag] = process.argv
if (!libPath) {
  console.error('usage: node scripts/clean-library-tags.mjs <library.json> [--write]')
  process.exit(1)
}
const write = writeFlag === '--write'
const lib = JSON.parse(fs.readFileSync(libPath, 'utf-8'))

let touched = 0
let tagsRemoved = 0
let moodsMoved = 0
const removedCounts = new Map()

for (const a of lib.assets) {
  const before = a.tags ?? []
  const kept = []
  const foundMoods = new Set(a.moods ?? [])
  for (const t of before) {
    if (MOOD_WORDS.has(t)) {
      if (!foundMoods.has(t)) moodsMoved++
      foundMoods.add(t)
    } else if (isJunk(t)) {
      tagsRemoved++
      removedCounts.set(t, (removedCounts.get(t) ?? 0) + 1)
    } else {
      kept.push(t)
    }
  }
  const changed =
    kept.length !== before.length || foundMoods.size !== (a.moods?.length ?? 0)
  if (changed) {
    touched++
    a.tags = kept
    if (foundMoods.size > 0) a.moods = [...foundMoods]
  }
}

console.log(`${lib.assets.length} assets — ${touched} would change`)
console.log(`tags removed: ${tagsRemoved}; mood words moved to moods: ${moodsMoved}`)
console.log('top removed tokens:')
for (const [t, n] of [...removedCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`  ${t} ×${n}`)
}

if (write) {
  const stamp = new Date().toISOString().slice(0, 10)
  const backup = path.join(path.dirname(libPath), `library.backup-${stamp}.json`)
  fs.copyFileSync(libPath, backup)
  // Atomic-ish: temp + rename, same pattern as the app's writeJsonAtomic.
  const tmp = libPath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(lib, null, 2))
  fs.renameSync(tmp, libPath)
  console.log(`\nWritten. Backup at ${backup}`)
} else {
  console.log('\nDry run — re-run with --write to apply (close Hearth first).')
}
