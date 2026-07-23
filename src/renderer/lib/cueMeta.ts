import type { CueKind } from '../../shared/types'

// One source of truth for how a cue KIND looks everywhere the DM reads —
// spelled-out text badges (the old ♪/🔊/🖼/〜 glyphs read as noise live; the
// Sound Console made this switch first, this extends it to chips/cues/tray).

export const CUE_TEXT: Record<CueKind, string> = {
  music: 'MUS',
  sfx: 'SFX',
  image: 'IMG',
  amb: 'AMB'
}

export const CUE_TITLE: Record<CueKind, string> = {
  music: 'Music cue — crossfades to this track',
  sfx: 'Sound effect cue — one-shot',
  image: 'Image cue — pushes to the presenter',
  amb: 'Atmosphere cue — toggles this bed on/off'
}

/** Chip container colors per kind (border/bg/text). */
export const CUE_CHIP_CLASS: Record<CueKind, string> = {
  music: 'border-hearth-ember/60 bg-hearth-ember/15 text-hearth-ember',
  sfx: 'border-hearth-gold/60 bg-hearth-gold/10 text-hearth-gold',
  image: 'border-sky-500/50 bg-sky-500/10 text-sky-300',
  amb: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
}

/** Extra hover shades for the read-only fire buttons. */
export const CUE_CHIP_HOVER: Record<CueKind, string> = {
  music: 'hover:bg-hearth-ember/30',
  sfx: 'hover:bg-hearth-gold/25',
  image: 'hover:bg-sky-500/25',
  amb: 'hover:bg-emerald-500/25'
}

/** Badge text colors (used inside an already-tinted chip). */
export const CUE_BADGE_CLASS = 'rounded-sm bg-black/25 px-1 py-px text-[8px] font-bold leading-none tracking-wider opacity-80'

const ICON_PREFIX = /^(?:▶|🔊|🖼|〜)\s*/u

/**
 * Stored cue labels historically embed a glyph prefix ("🔊 shriek") — the
 * compiler and old scenes still write them. Strip it at render so the text
 * badge doesn't double up with the glyph.
 */
export function cueDisplayLabel(label: string | undefined, ref: string): string {
  return (label ?? ref).replace(ICON_PREFIX, '') || ref
}

/** "music/Fireside Tales.mp3" → "Fireside Tales". */
export function fileStem(file: string): string {
  return (file.split('/').pop() ?? file).replace(/\.[^.]+$/, '')
}

/**
 * Deterministic cue id for a library file registered onto a scene by the
 * editor ("lib-fireside-tales") — tray drops and popover retargets must agree
 * so the same file never lands under two ids.
 */
export function libSlug(file: string): string {
  return `lib-${fileStem(file).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}
