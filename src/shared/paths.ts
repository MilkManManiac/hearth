// Tiny string helpers duplicated ~15× across the codebase before this file
// existed (see AUDIT-2026-07-10 P4). Import from here; don't re-declare.

/** "music/nox-rain.ogg" → "nox-rain.ogg" */
export function basename(file: string): string {
  return file.split('/').pop() ?? file
}

/** "music/nox-rain.ogg" → "nox-rain" */
export function stem(file: string): string {
  return basename(file).replace(/\.[^.]+$/, '')
}

/** Filesystem-safe slug: "Copy of The Tavern!" → "copy-of-the-tavern". */
export function slugify(name: string, fallback = 'item'): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || fallback
}

/** "kols-tower" / "nox_rain-strong" → "Kols Tower" / "Nox Rain Strong". */
export function prettyLabel(nameOrFile: string): string {
  return stem(nameOrFile)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase())
    .trim()
}
