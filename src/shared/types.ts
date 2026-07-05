// Shared types used by both the main and renderer processes.

export type AssetKind = 'music' | 'ambience' | 'sfx'

/** One entry in campaign/library.json — a known audio asset with tags. */
export interface LibraryAsset {
  /** Path relative to the campaign folder, e.g. "music/combat-drums.mp3". */
  file: string
  kind: AssetKind
  tags: string[]
  source?: string
  license?: string
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
  /** Loop the track. Music defaults to true. */
  loop?: boolean
}

export interface AmbienceLayer {
  file: string
  /** 0..1, default 0.4 */
  volume?: number
}

export interface SfxItem {
  id: string
  label: string
  file: string
  /** Single-character keyboard shortcut while the scene is active. */
  hotkey?: string
  /** 0..1, default 0.9 */
  volume?: number
  /** Dip the music bus while this plays. Default true. */
  duckMusic?: boolean
}

export interface SceneImage {
  file: string
  caption?: string
  /** Whether this is meant to be shown to players (vs. DM reference). */
  playerFacing?: boolean
}

export type ScriptNode =
  | { type: 'text'; text: string }
  | { type: 'cue'; kind: 'music' | 'sfx' | 'image'; ref: string; label?: string }

export interface Scene {
  id: string
  name: string
  dmNotes?: string
  music?: MusicTrack[]
  ambience?: AmbienceLayer[]
  sfx?: SfxItem[]
  images?: SceneImage[]
  /** Structured read-aloud script. If absent, compiled from `scriptText`. */
  script?: ScriptNode[]
  /**
   * Read-aloud prose with inline cue markers, e.g.
   * "Shapes drop from the branches {{sfx:shriek}} and a voice cries out."
   * Compiled into `script` at load time. Easiest path for Claude-authored scenes.
   */
  scriptText?: string
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
