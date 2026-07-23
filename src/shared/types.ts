// Shared types used by both the main and renderer processes.

export type AssetKind = 'music' | 'ambience' | 'sfx'

/** One entry in campaign/library.json — a known audio asset with tags. */
export interface LibraryAsset {
  /** Path relative to the campaign folder, e.g. "music/combat-drums.mp3". */
  file: string
  kind: AssetKind
  tags: string[]
  /**
   * Display-name override. The file on disk is never renamed (scene references
   * point at `file`), so renaming an asset is always safe.
   */
  name?: string
  /**
   * Coarse grouping for the library browser + drag tray, e.g. "creatures",
   * "combat", "town". Free-form; see LIBRARY_CATEGORIES for the recommended set.
   * Legacy single value — kept in sync as `categories[0]` when editing.
   */
  category?: string
  /**
   * Multi-category: a sound can live in several buckets at once ("combat" +
   * "tension" + "creatures"), so it surfaces from any search angle. The first
   * entry is the primary (used for grouping); `category` mirrors it for
   * back-compat. Read via `assetCategories()`, never directly.
   */
  categories?: string[]
  /** Free-text notes: what it sounds like, when to use it, source quirks. */
  description?: string
  /**
   * Mood words (multi-value) — the axis a DM reaches for live: "tense",
   * "calm", "epic". Suggested vocabulary in LIBRARY_MOODS; free-form values
   * still work. Kept separate from `tags` (provenance/content words) so mood
   * search stays clean.
   */
  moods?: string[]
  /**
   * Auditioned by ear. The bulk-import waves were filed by filename, not
   * listening — absent/false marks the "never actually heard" pile so the
   * browser can filter trusted sounds from blind imports. Triage keeps stamp
   * it; the Library row has a quick toggle.
   */
  heard?: boolean
  /**
   * Marked as junk: hidden from the cue tray and grouped under "Marked as
   * trash" in the Library, pending real deletion. A soft-delete staging flag.
   */
  trash?: boolean
  source?: string
  license?: string
}

/** Human-facing name for a library asset: the override, else the filename stem. */
export function assetDisplayName(a: Pick<LibraryAsset, 'file' | 'name'>): string {
  return a.name ?? (a.file.split('/').pop() ?? a.file).replace(/\.[^.]+$/, '')
}

/**
 * All categories on an asset, primary first. Handles both shapes: the
 * multi-value `categories` array and the legacy single `category`.
 */
export function assetCategories(a: Pick<LibraryAsset, 'category' | 'categories'>): string[] {
  if (a.categories && a.categories.length > 0) return a.categories
  return a.category ? [a.category] : []
}

/** Primary category (grouping key), or undefined when uncategorized. */
export function assetPrimaryCategory(a: Pick<LibraryAsset, 'category' | 'categories'>): string | undefined {
  return assetCategories(a)[0]
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

/**
 * Suggested mood vocabulary for `LibraryAsset.moods` (free-form values still
 * work). Deliberately short — moods are for live retrieval, and a dozen words
 * you remember beat fifty you don't. Refine with the DM before bulk-tagging.
 */
export const LIBRARY_MOODS = [
  'calm',
  'tense',
  'eerie',
  'epic',
  'dark',
  'somber',
  'hopeful',
  'festive',
  'mysterious',
  'heroic',
  'playful',
  'triumphant'
]

/** Display metadata for any category id, with a fallback for unknown/absent ones. */
export function categoryMeta(id: string | undefined): LibraryCategoryMeta {
  if (id && LIBRARY_CATEGORIES[id]) return LIBRARY_CATEGORIES[id]
  const label = id ? id[0].toUpperCase() + id.slice(1) : 'Uncategorized'
  return { label, icon: '📁' }
}

/**
 * A campaign-wide named music playlist ("Tavern Nights", "Combat Bangers"),
 * playable from any scene. Stored in library.json alongside the assets.
 */
export interface PlaylistPreset {
  id: string
  name: string
  /** Campaign-relative music files, in play order. */
  files: string[]
}

export interface Library {
  assets: LibraryAsset[]
  playlists?: PlaylistPreset[]
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
  /**
   * Start automatically when the scene goes live. Default true. Script-driven
   * beds (toggled by an {{amb:...}} cue mid-read) set this false so they wait
   * for their moment instead of blasting on scene start.
   */
  autoplay?: boolean
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

/**
 * Cue kinds: music switches the track, sfx fires a one-shot, image pushes to
 * the presenter, amb toggles an ambience bed on/off (ref = layer file or its
 * filename stem).
 */
export type CueKind = 'music' | 'sfx' | 'image' | 'amb'

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
  // --- amb-cue lifecycle options (ignored on other kinds) -------------------
  /** Target volume the bed fades up to (0..1). Overrides the layer's volume. */
  volume?: number
  /** Fade-in duration when this cue starts the bed (ms). */
  fadeInMs?: number
  /** Fade-out duration when the bed stops — via this cue or a section end (ms). */
  fadeOutMs?: number
  /**
   * When the bed turns off. 'section': auto-fades out when the teleprompter
   * crosses the next heading. Default (absent/'manual'): plays until toggled
   * off by the cue, the console, or Stop All.
   */
  until?: 'section' | 'manual'
}

/**
 * An inline [[wiki-link]] to another campaign note. `ref` is the target note's
 * id; `label` is an explicit display override (authored as `[[ref|label]]`) —
 * absent means "render the target's live title", so renames propagate.
 */
export interface LinkInline {
  type: 'link'
  ref: string
  label?: string
}

/**
 * An atomic inline reference to a monster or trap stat block — renders as a
 * chip that opens a live, rollable card (authored as `{{monster:key}}` /
 * `{{trap:key}}`). `label` names this instance ("Mimic A") and keys its own
 * HP pool, so two chips with different labels track HP separately.
 */
export interface StatRefInline {
  type: 'statref'
  kind: 'monster' | 'trap'
  ref: string
  label?: string
}

/** A run of text (with optional marks), an atomic cue, a note link, or a stat-block ref. */
export type ScriptInline =
  | { type: 'text'; text: string; marks?: ScriptMark[] }
  | CueInline
  | LinkInline
  | StatRefInline

/** Block-level structure of the read-aloud doc. Callouts nest blocks. */
export type ScriptBlock =
  | { type: 'paragraph'; content: ScriptInline[] }
  | { type: 'heading'; level: 1 | 2 | 3; content: ScriptInline[] }
  | { type: 'callout'; content: ScriptBlock[] }
  | {
      /**
       * A checklist line ("- [ ] secret" in authoring markdown) — the Lazy-DM
       * secrets & clues unit: ticked off during play, unchecked items carry
       * forward into the next session's prep.
       */
      type: 'check'
      checked?: boolean
      content: ScriptInline[]
    }
  | {
      /**
       * One list line ("- item" / "1. item" in authoring markdown). Flat on
       * purpose — each line is its own block (like `check`), so every doc
       * walker's "content is inline" invariant holds. Consecutive bullets
       * render as one list; `ordered` items number themselves by run position.
       */
      type: 'bullet'
      ordered?: boolean
      content: ScriptInline[]
    }

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

// ---------------------------------------------------------------------------
// Encounters (ONESTOP-PLAN C2): a combatant wraps an optional compendium ref
// plus mutable table state — the Improved Initiative shape. Lives on the scene
// so prep and play stay together; persisted via the normal saveScene path.
// ---------------------------------------------------------------------------

export interface CombatantCondition {
  name: string
  /** Round on which it expires (checked when the round advances past it). */
  untilRound?: number
}

export interface Combatant {
  id: string
  name: string
  /** Compendium monster key (public/compendium/monsters.json), if any. */
  ref?: string
  /**
   * Linked party character (characters/*.json). When set, HP/AC live on the
   * CHARACTER — the tracker reads and writes the sheet, so the party
   * dashboard and the player portal stay in sync with combat.
   */
  characterId?: string
  side: 'foe' | 'ally' | 'pc'
  maxHp: number
  hp: number
  ac?: number
  /** d20 modifier used by the roll-initiative button. */
  initBonus?: number
  initiative?: number
  conditions?: CombatantCondition[]
  /** XP for budget math (from the compendium at add time). */
  xp?: number
  note?: string
}

export interface Encounter {
  combatants: Combatant[]
  round: number
  /** Index into the initiative-sorted order; -1 = not started. */
  turn: number
}

// ---------------------------------------------------------------------------
// Battle maps (ONESTOP-PLAN C3): an image + vector fog strokes. The DM paints
// reveals and explicitly SENDS the current state to the presenter window
// (dungeon-revealer's commit model) — players never see an uncommitted brush.
// Strokes live in image-pixel coordinates; no dynamic lighting, ever.
// ---------------------------------------------------------------------------

export interface FogStroke {
  /** Flat [x1,y1,x2,y2,…] polyline in image coordinates. */
  points: number[]
  /** Brush radius (image pixels). */
  radius: number
  /** reveal = punch a hole in the fog; hide = paint fog back. */
  mode: 'reveal' | 'hide'
  /** 'fill' covers the whole image (Reveal all / Hide all), ignoring points. */
  shape?: 'fill'
}

export interface MapToken {
  id: string
  /** Short label rendered in the disc (1–3 chars shown). */
  label: string
  x: number
  y: number
  /** Disc radius in image pixels. */
  r: number
  color: string
  /** Hidden tokens render only for the DM, never on the presenter. */
  hidden?: boolean
  /** Linked party character (HP ring + vitals from the sheet — D4). */
  characterId?: string
  /** Linked encounter combatant id (HP ring + conditions from the tracker). */
  combatantId?: string
  /** Compendium monster key (click → stat block). */
  ref?: string
}

/** AoE template (D4): a dumb shape with a damage tint — zero automation, like DDB. */
export interface MapOverlay {
  id: string
  kind: 'circle' | 'cone' | 'line'
  x: number
  y: number
  /** Radius / cone length / line length, in feet (grid maps ft → px). */
  sizeFt: number
  /** Aim direction in radians (cones/lines). */
  angle: number
  /** Fill tint (damage-type color). */
  color: string
}

export interface SceneMap {
  /** Campaign-relative image path (usually art/…). */
  image: string
  strokes: FogStroke[]
  tokens?: MapToken[]
  /** AoE templates — players see them too (sent with the map). */
  overlays?: MapOverlay[]
  /** Grid cell size in image pixels; 0/undefined = no grid. Tokens snap to cell centers. */
  grid?: number
}

/**
 * A named fog region (SURFACES-PLAN ⚔ Table): drawn as a polygon in prep,
 * toggled with one click at the table. hidden=true → players see black.
 */
export interface FogZone {
  id: string
  /** "Zone 3" by default; renamable ("Barracks"). */
  name: string
  /** Flat [x1,y1,x2,y2,…] polygon in image coordinates. */
  points: number[]
  hidden: boolean
}

/**
 * A first-class battle map (M1) — one JSON file in <campaign>/maps/. The DM
 * preps several like tabs; the LIVE one streams to players. Encounters live
 * on the map (the fight happens where the map is), not on scenes.
 */
export interface CampaignMap {
  id: string
  name: string
  /** Campaign-relative image path (usually art/…). */
  image: string
  /** Freehand fog layer (improv brush; reveal punches, hide repaints). */
  strokes: FogStroke[]
  /** Named one-click fog zones, composited over the strokes. */
  zones?: FogZone[]
  tokens?: MapToken[]
  overlays?: MapOverlay[]
  /** Grid cell size in image pixels; 0/undefined = no grid. */
  grid?: number
  encounter?: Encounter
  /** Populated by the loader. */
  _sourceFile?: string
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
  /**
   * Session-note id this scene belongs to (notes/ kind:"session"). Groups the
   * scene list — "Session 3" holding its scenes. Unset = Unfiled.
   */
  session?: string
  /** Prepped/live combat for this scene (ONESTOP-PLAN C2). */
  encounter?: Encounter
  /** Battle map + fog for this scene (ONESTOP-PLAN C3). */
  map?: SceneMap
  /** Optional playlist mode for this scene's music (palette stays the default). */
  playlist?: PlaylistConfig
  transition?: { crossfadeMs?: number }
  /** Populated by the loader: relative path of the source file within the campaign. */
  _sourceFile?: string
  /** Populated by the loader: subfolder under scenes/ this file lives in (rail grouping). */
  _folder?: string
}

// ---------------------------------------------------------------------------
// Campaign notes: the DM's knowledge base (see NOTES-PLAN.md). One JSON file
// per note in <campaign>/notes/. Flat + typed + linked — no folder hierarchy;
// the browser groups by kind. Bodies reuse the ScriptDoc rich-text tree.
// ---------------------------------------------------------------------------

export type NoteKind =
  | 'session'
  | 'npc'
  | 'pc'
  | 'location'
  | 'faction'
  | 'item'
  | 'thread'
  | 'note'

export interface NoteKindMeta {
  label: string
  /** Plural group header in the notes browser. */
  plural: string
  icon: string
}

/** Display metadata + browser grouping order for note kinds. */
export const NOTE_KINDS: Record<NoteKind, NoteKindMeta> = {
  session: { label: 'Session', plural: 'Sessions', icon: '📅' },
  npc: { label: 'NPC', plural: 'NPCs', icon: '🎭' },
  pc: { label: 'PC', plural: 'The Party', icon: '🛡️' },
  location: { label: 'Location', plural: 'Locations', icon: '🗺️' },
  faction: { label: 'Faction', plural: 'Factions', icon: '🏳️' },
  item: { label: 'Item', plural: 'Items', icon: '🗝️' },
  thread: { label: 'Thread', plural: 'Threads & Secrets', icon: '🧵' },
  note: { label: 'Note', plural: 'Notes', icon: '📝' }
}

export const NOTE_KIND_ORDER = Object.keys(NOTE_KINDS) as NoteKind[]

export interface CampaignNote {
  id: string
  kind: NoteKind
  title: string
  /** Rich-text body (same tree as scene scripts, minus sound cues). */
  body?: ScriptDoc
  /**
   * Markdown authoring path (same subset as scene scriptText, no cues needed).
   * Compiled into `body` at load; dropped once the note is edited in-app.
   */
  bodyText?: string
  tags?: string[]
  /** Threads: open (default) or resolved. */
  status?: 'open' | 'resolved'
  /** Sessions: when it was/will be played (ISO date, display-only). */
  date?: string
  createdAt?: string
  updatedAt?: string
  /** Populated by the loader: relative path within the campaign. */
  _sourceFile?: string
}

// ---------------------------------------------------------------------------
// Characters (ONESTOP-PLAN C4): the DDB-clone character home. One JSON per
// character in <campaign>/characters/. CHOICES are the source of truth
// (class/species/level/scores/profs/spells); the sheet derives everything else
// at render (proficiency bonus, mods, saves, passives, spell slots) — never
// persist computed values (the Foundry lesson). Table state (hp, slots used,
// conditions) is mutable and lives here too so the party dashboard is live.
// ---------------------------------------------------------------------------

export interface AbilityScores {
  str: number
  dex: number
  con: number
  int: number
  wis: number
  cha: number
}

// --- Inventory & equipment (SURFACES-PLAN M4): full DDB depth MINUS weight --

/** The coin pouch. No weight, no encumbrance, ever. */
export interface Coins {
  cp: number
  sp: number
  ep: number
  gp: number
  pp: number
}

/** One pouch transaction (quick-box / grants), newest last, capped at 50. */
export interface CoinTxn {
  ts: number
  /** Signed copper delta. */
  deltaCp: number
  note?: string
}

/**
 * One structured inventory row. `attuned` is deliberately DECOUPLED from
 * `equipped` (DDB's #1 inventory complaint) — the sheet shows an `n/3`
 * counter and warns, never blocks. Charges reuse the limited-uses pip idiom
 * but live on the row so the item travels with its state.
 */
export interface InventoryItem {
  /** Stable id — transfers and the stash log track rows by it. */
  id: string
  name: string
  /** Default 1. */
  qty?: number
  /** Worn/wielded — feeds auto-AC for armor/shields. */
  equipped?: boolean
  attuned?: boolean
  /** Item charges as pips ('none' = never auto-resets; 'long' covers dawn). */
  charges?: { max: number; used?: number; reset?: 'short' | 'long' | 'none' }
  /** Flat AC bonus while equipped (Ring of Protection, +1 armor as a field). */
  acBonus?: number
  notes?: string
  /** Set when added from the catalog — links back to the compendium card. */
  catalogKind?: 'equipment' | 'magic-item'
  catalogKey?: string
}

/**
 * The shared party stash (<campaign>/party.json): one pool of items + coins
 * any player can view and take from. Transfer-never-copy — moving an item
 * removes it from the source and appends to the activity log.
 */
export interface PartyStash {
  items: InventoryItem[]
  coins: Coins
  /** Activity log, newest first ("Cumb took the +1 Longsword"). */
  log: Array<{ ts: number; who: string; text: string }>
}

export interface Character {
  id: string
  name: string
  /** The human at the table. */
  player?: string
  // --- choices (compendium keys from public/compendium/) --------------------
  classKey?: string
  subclassKey?: string
  /** TOTAL character level (drives proficiency bonus). Primary-class level = this minus the `multiclass` levels. */
  level: number
  /** Extra classes for multiclass PCs, each with its own class level. */
  multiclass?: Array<{ classKey?: string; subclassKey?: string; level: number }>
  speciesKey?: string
  backgroundKey?: string
  /** Final scores (background bonuses already applied by the builder). */
  abilities: AbilityScores
  /** Skill proficiencies (snake_case skill ids) — expertise doubles via `expertise`. */
  skillProfs: string[]
  expertise?: string[]
  featKeys?: string[]
  /** Known/prepared spell keys (compendium). */
  spells?: string[]
  /**
   * LEGACY free-form gear lines — migrated into `inventory` on load (M4);
   * originals preserved in `legacyEquipment`. Only pre-M4 files still use it.
   */
  equipment?: string[]
  /** The original free-text lines, kept verbatim by the M4 migration. */
  legacyEquipment?: string[]
  /** Structured inventory rows (M4). Presence = migrated. */
  inventory?: InventoryItem[]
  /** Coin pouch (M4). */
  coins?: Coins
  /** Pouch transaction ledger (quick-box / grants), capped at 50. */
  coinLog?: CoinTxn[]
  /**
   * Manual AC override: when set, it beats the derived auto-AC (mage armor,
   * weird stacking, "trust me"). Cleared = back to auto. See effectiveAc().
   */
  acOverride?: number
  // --- manual base AC (used only when there's no structured inventory) ------
  ac: number
  maxHp: number
  speed?: number
  // --- mutable table state ---------------------------------------------------
  hp: number
  tempHp?: number
  hitDiceSpent?: number
  deathSaves?: { success: number; fail: number }
  conditions?: string[]
  /** Expended slots by spell level ("1".."9"). */
  slotsUsed?: Record<string, number>
  /** Per-feature uses ticked off (name → used count). */
  usesSpent?: Record<string, number>
  /** User-defined limited-use counters (Focus Points, Channel Divinity…). */
  limitedUses?: Array<{ name: string; max: number; reset: 'short' | 'long' }>
  /** Spell (name) currently concentrated on — one at a time (D3). */
  concentratingOn?: string
  /** Milestone flag set by the DM (D5) — badges the sheet/portal; cleared by leveling. */
  levelUpReady?: boolean
  inspiration?: boolean
  notes?: string
  /** Populated by the loader. */
  _sourceFile?: string
}

/** Per-token live dressing baked at 📤 Send time (D4): HP ring + condition tags. */
export interface TokenDecor {
  /** 0..1 — drawn as an arc ring (PCs only on the presenter). */
  hpFrac?: number
  /** Condition names shown as tags under the disc. */
  conds?: string[]
}

// ---------------------------------------------------------------------------
// Dice + Game Log (DDB-MECHANICS D1): every roll anywhere (DM app, player
// portal, monster stat blocks) becomes a RollEvent streamed to all surfaces.
// ---------------------------------------------------------------------------

export interface RollDieGroup {
  /** Die size (20 for d20, 6 for d6…). */
  die: number
  /** Every face rolled, in order. */
  results: number[]
  /** Indices into `results` that count toward the total (adv/dis drop one d20). */
  kept: number[]
}

export interface RollEvent {
  id: string
  /** Epoch ms. */
  ts: number
  /** Display name: character name or "DM". */
  who: string
  characterId?: string
  /** What was rolled: "Perception check", "Longsword — attack", "2d6+3". */
  what: string
  /** The expression as rolled, e.g. "1d20+5 (adv)". */
  expr: string
  total: number
  groups: RollDieGroup[]
  /** Flat modifier included in the total. */
  modifier: number
  mode?: 'adv' | 'dis'
  /** Natural 20 / natural 1 on a d20 roll. */
  crit?: 'crit' | 'fumble'
  /** DM-only rolls never reach the portal (DDB's "Self" visibility). */
  dmOnly?: boolean
}

export interface CampaignState {
  /** Absolute path of the active campaign folder, or null if none chosen. */
  path: string | null
  scenes: Scene[]
  /** Campaign-wide notes (sessions, NPCs, locations…), from notes/*.json. */
  notes: CampaignNote[]
  /** Player characters (ONESTOP-PLAN C4), from characters/*.json. */
  characters: Character[]
  /** Battle maps (SURFACES-PLAN M1), from maps/*.json. */
  maps: CampaignMap[]
  /** Which map the players see (table.json) — null = blackout/none. */
  liveMapId: string | null
  /** The shared party stash (party.json) — M4. */
  party: PartyStash
  library: Library
  /** Human-readable load errors (bad JSON, etc.) surfaced in the UI. */
  errors: string[]
}

// 4s (was 2.5s) at Wes's request 2026-07-23: "extend the fade in/out so it
// feels more natural" — one breath out, one breath in. Scenes can still
// override per-transition (transition.crossfadeMs) and tracks per-cue.
export const DEFAULT_CROSSFADE_MS = 4000
export const DUCK_LINEAR = 0.4 // ~ -8 dB
