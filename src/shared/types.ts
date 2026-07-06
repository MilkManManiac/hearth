// Shared types used by both the main and renderer processes.

export type AssetKind = 'music' | 'ambience' | 'sfx'

/** One entry in campaign/library.json — a known audio asset with tags. */
export interface LibraryAsset {
  /** Path relative to the campaign folder, e.g. "music/combat-drums.mp3". */
  file: string
  kind: AssetKind
  tags: string[]
  /**
   * Coarse grouping for the library browser + drag tray, e.g. "creatures",
   * "combat", "town". Free-form; see LIBRARY_CATEGORIES for the recommended set.
   */
  category?: string
  source?: string
  license?: string
}

export interface LibraryCategoryMeta {
  label: string
  icon: string
}

/**
 * Recommended library categories with a display label + icon, in a sensible
 * grouping order. `LibraryAsset.category` is free-form — values outside this map
 * still display (with a default icon) and sort after these alphabetically.
 */
export const LIBRARY_CATEGORIES: Record<string, LibraryCategoryMeta> = {
  creatures: { label: 'Creatures', icon: '🐺' },
  combat: { label: 'Combat', icon: '⚔️' },
  magic: { label: 'Magic', icon: '✨' },
  weather: { label: 'Weather', icon: '🌧️' },
  water: { label: 'Water', icon: '💧' },
  fire: { label: 'Fire', icon: '🔥' },
  places: { label: 'Places', icon: '🏰' },
  objects: { label: 'Objects', icon: '📦' },
  horror: { label: 'Horror', icon: '💀' },
  ui: { label: 'UI / Table', icon: '🎲' },
  exploration: { label: 'Exploration', icon: '🧭' },
  town: { label: 'Town', icon: '🏘️' },
  tavern: { label: 'Tavern', icon: '🍺' },
  tension: { label: 'Tension', icon: '😨' },
  boss: { label: 'Boss', icon: '👹' },
  victory: { label: 'Victory', icon: '🏆' },
  somber: { label: 'Somber', icon: '🕯️' },
  mystery: { label: 'Mystery', icon: '🔮' },
  travel: { label: 'Travel', icon: '🐎' },
  seafaring: { label: 'Seafaring', icon: '⛵' }
}

/** Category ids in recommended display order. */
export const CATEGORY_ORDER = Object.keys(LIBRARY_CATEGORIES)

/** Display metadata for any category id, with a fallback for unknown/absent ones. */
export function categoryMeta(id: string | undefined): LibraryCategoryMeta {
  if (id && LIBRARY_CATEGORIES[id]) return LIBRARY_CATEGORIES[id]
  const label = id ? id[0].toUpperCase() + id.slice(1) : 'Uncategorized'
  return { label, icon: '📁' }
}

export interface Library {
  assets: LibraryAsset[]
}

export interface MusicTrack {
  id: string
  label: string
  file: string
  /** 0..1, default 0.7 */
  volume?: number
  /** If true, starts automatically when the scene is loaded. */
  default?: boolean
  /** Loop the track. Music defaults to true (ignored in playlist mode). */
  loop?: boolean
  /** Fade-in when this track starts (ms). Defaults to the crossfade in effect. */
  fadeInMs?: number
  /** Fade-out when this track is stopped/advanced away from (ms). Same default. */
  fadeOutMs?: number
}

/**
 * Playlist mode: play the scene's `music` array as an ordered queue with
 * auto-advance, instead of the tap-to-switch palette. Palette behavior is the
 * default; the DM can flip modes live (persisted on the scene).
 */
export interface PlaylistConfig {
  enabled?: boolean
  /** Play in random order (reshuffled per scene load / toggle). */
  shuffle?: boolean
  /** Wrap to the first track after the last. Default true. */
  loop?: boolean
  /** Crossfade between consecutive tracks (ms). Defaults to transition.crossfadeMs. */
  crossfadeMs?: number
}

export interface AmbienceLayer {
  file: string
  /** 0..1, default 0.4 */
  volume?: number
  /** Loop the bed. Default true (looping is the point of an ambience layer). */
  loop?: boolean
}

export interface SfxItem {
  id: string
  label: string
  file: string
  /** Single-character keyboard shortcut while the scene is active. */
  hotkey?: string
  /** 0..1, default 0.9 */
  volume?: number
  /** Dip the music bus while this plays. Default true. Ignored when looping. */
  duckMusic?: boolean
  /**
   * Play as a sustained loop instead of a one-shot: tap to start, tap again to
   * stop (e.g. a chant, a machine hum, a held wind). Looping SFX don't duck.
   */
  loop?: boolean
}

export interface SceneImage {
  file: string
  caption?: string
  /** Whether this is meant to be shown to players (vs. DM reference). */
  playerFacing?: boolean
}

// ---------------------------------------------------------------------------
// Read-aloud script: a rich-text document tree (blocks → inline runs + cues).
// This replaced the old flat `ScriptNode[]`; see EDITOR-REWRITE.md. The legacy
// flat shape is still accepted on load and up-converted (migrateLegacyScript).
// ---------------------------------------------------------------------------

export type CueKind = 'music' | 'sfx' | 'image'

/** Inline emphasis on a text run. Color/highlight use named palette ids. */
export type ScriptMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'color'; value: string }
  | { type: 'highlight'; value: string }

/** An atomic inline sound/image cue chip. */
export interface CueInline {
  type: 'cue'
  kind: CueKind
  ref: string
  label?: string
}

/** A run of text (with optional marks) or an atomic cue. */
export type ScriptInline = { type: 'text'; text: string; marks?: ScriptMark[] } | CueInline

/** Block-level structure of the read-aloud doc. Callouts nest blocks. */
export type ScriptBlock =
  | { type: 'paragraph'; content: ScriptInline[] }
  | { type: 'heading'; level: 1 | 2 | 3; content: ScriptInline[] }
  | { type: 'callout'; content: ScriptBlock[] }

/** The structured read-aloud document. */
export type ScriptDoc = ScriptBlock[]

/** Legacy flat script shape (pre-rewrite). Accepted on load, then migrated. */
export type LegacyScriptNode =
  | { type: 'text'; text: string }
  | { type: 'cue'; kind: CueKind; ref: string; label?: string }

export interface ScriptColorMeta {
  label: string
  /** CSS color (text color for `color` marks, background for `highlight`). */
  color: string
}

/** Named text colors for `color` marks — theme-tuned, dark-mode-safe. */
export const SCRIPT_TEXT_COLORS: Record<string, ScriptColorMeta> = {
  danger: { label: 'Danger', color: '#e8613c' },
  emphasis: { label: 'Emphasis', color: '#e0b341' },
  arcane: { label: 'Arcane', color: '#9d86e6' },
  nature: { label: 'Nature', color: '#5faf6b' },
  whisper: { label: 'Whisper', color: '#8a8f98' }
}

/** Named highlight (background) colors for `highlight` marks. */
export const SCRIPT_HIGHLIGHTS: Record<string, ScriptColorMeta> = {
  read: { label: 'Read slowly', color: 'rgba(224, 179, 65, 0.22)' },
  pause: { label: 'Pause', color: 'rgba(90, 164, 105, 0.22)' },
  alert: { label: 'Alert', color: 'rgba(232, 97, 60, 0.22)' }
}

/** Resolve a named text-color id to its CSS value (fallback: treat as raw CSS). */
export function scriptTextColor(id: string): string {
  return SCRIPT_TEXT_COLORS[id]?.color ?? id
}

/** Resolve a named highlight id to its CSS background value. */
export function scriptHighlightColor(id: string): string {
  return SCRIPT_HIGHLIGHTS[id]?.color ?? id
}

/** A note/idea in the scene's brainstorm list; check off as used. */
export interface SceneIdea {
  id: string
  text: string
  done?: boolean
}

export type EntityType = 'npc' | 'monster' | 'item' | 'location' | 'hook'

/**
 * Something in (or available to) the scene: an NPC, monster, findable item,
 * location, or plot hook. `status` distinguishes what's definitely present from
 * what could be dropped in; `used` is the DM's live "we did this" checkbox.
 */
export interface SceneEntity {
  id: string
  type: EntityType
  name: string
  note?: string
  /** Optional link — stat block, wiki page, image, etc. */
  ref?: string
  status?: 'present' | 'optional'
  used?: boolean
}

export interface Scene {
  id: string
  name: string
  dmNotes?: string
  music?: MusicTrack[]
  ambience?: AmbienceLayer[]
  sfx?: SfxItem[]
  images?: SceneImage[]
  /**
   * Structured read-aloud document (rich-text tree). If absent, compiled from
   * `scriptText`. A legacy flat `LegacyScriptNode[]` here is migrated on load.
   */
  script?: ScriptDoc
  /**
   * Read-aloud prose with inline cue markers, e.g.
   * "Shapes drop from the branches {{sfx:shriek}} and a voice cries out."
   * Compiled into `script` at load time. Easiest path for Claude-authored scenes.
   * Once a scene is edited in-app, it is persisted as structured `script` instead.
   */
  scriptText?: string
  /** Brainstorm list — things you might do in this scene. */
  ideas?: SceneIdea[]
  /** Cast & loot — NPCs, monsters, findable items, hooks. */
  entities?: SceneEntity[]
  /** Optional playlist mode for this scene's music (palette stays the default). */
  playlist?: PlaylistConfig
  transition?: { crossfadeMs?: number }
  /** Populated by the loader: relative path of the source file within the campaign. */
  _sourceFile?: string
}

export interface CampaignState {
  /** Absolute path of the active campaign folder, or null if none chosen. */
  path: string | null
  scenes: Scene[]
  library: Library
  /** Human-readable load errors (bad JSON, etc.) surfaced in the UI. */
  errors: string[]
}

export const DEFAULT_CROSSFADE_MS = 2500
export const DUCK_LINEAR = 0.4 // ~ -8 dB
