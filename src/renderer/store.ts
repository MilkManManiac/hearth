import { create } from 'zustand'
import {
  DEFAULT_CROSSFADE_MS,
  NOTE_KINDS,
  type AssetKind,
  type CampaignNote,
  type Character,
  type CampaignState,
  type CueInline,
  type NoteKind,
  type PartyStash,
  type Scene,
  type ScriptBlock
} from '../shared/types'
import type { CoinKey } from '../shared/inventory'
import { docUncheckedItems } from '../shared/scriptCompile'
import { prettyLabel, stem as assetStem } from '../shared/paths'
import { AudioEngine, type EngineStatus } from './audio/AudioEngine'
import type { DiscordStatus, LibraryAssetPatch, TriageScan } from '../preload/index'

/** One audio engine per session, shared across the UI. */
export const engine = new AudioEngine()

const EMPTY_CAMPAIGN: CampaignState = {
  path: null,
  scenes: [],
  notes: [],
  characters: [],
  maps: [],
  liveMapId: null,
  party: { items: [], coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, log: [] },
  library: { assets: [] },
  errors: []
}

interface PresentingImage {
  file: string
  caption?: string
}

export interface Toast {
  id: number
  message: string
  tone: 'error' | 'info'
}

let toastSeq = 0

/** Stop handle for the single in-flight library audition, if any. */
let currentPreviewStop: (() => void) | null = null

/** Debounced disk persistence for live mixer changes (keyed per item). */
const persistTimers = new Map<string, number>()
function debouncePersist(key: string, fn: () => void, ms = 400): void {
  const prev = persistTimers.get(key)
  if (prev) window.clearTimeout(prev)
  persistTimers.set(key, window.setTimeout(fn, ms))
}

function shuffled<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Crossfade to use between playlist tracks for this scene. */
function playlistFade(scene: Scene): number {
  return scene.playlist?.crossfadeMs ?? scene.transition?.crossfadeMs ?? DEFAULT_CROSSFADE_MS
}

/** A scene-unique id for a newly added asset, based on its filename. */
function uniqueAssetId(existing: { id: string }[], file: string): string {
  const base = `lib-${assetStem(file).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
  if (!existing.some((e) => e.id === base)) return base
  let n = 2
  while (existing.some((e) => e.id === `${base}-${n}`)) n++
  return `${base}-${n}`
}

interface AppState {
  campaign: CampaignState
  /** Scene shown on the board (armed). Selecting is silent — see goLive. */
  currentSceneId: string | null
  /** Scene whose atmosphere was last started with goLive, or null. */
  liveSceneId: string | null
  /** Selected campaign note (notes tab / right panel). */
  currentNoteId: string | null
  /** Left-rail tab: the scene list or the campaign notes browser. */
  leftTab: 'scenes' | 'notes'
  status: EngineStatus
  presenting: PresentingImage | null
  toasts: Toast[]
  libraryOpen: boolean
  /** Kind to preselect when the library browser opens (from a section's + Add). */
  libraryKind: AssetKind | 'all'
  /** Library asset file currently being auditioned, or null. */
  previewingFile: string | null
  /** Active sound-triage session (drop-folder review inbox), or null. */
  triage: TriageScan | null
  /** Discord bridge panel visibility + last known bridge status. */
  discordOpen: boolean
  discordStatus: DiscordStatus | null
  /**
   * Build = full authoring chrome. Run = the at-the-table view: read-aloud +
   * fire controls only, no add/edit/remove affordances. Persisted.
   */
  uiMode: 'build' | 'run'
  /** Track-id play order for the current scene's playlist mode. */
  playlistOrder: string[]
  /** Index into playlistOrder of the current/last-started track. */
  playlistPos: number

  bootstrap: () => Promise<void>
  /**
   * M3 window split: campaign data + change feed ONLY — no audio-engine or
   * Discord wiring. The ⚔ Table / 🛡 Party windows use this; wiring the full
   * bootstrap there would start a SECOND Discord PCM tap and double the
   * stream. All sound stays in the console window.
   */
  bootstrapData: () => Promise<void>
  pushToast: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void
  probeAssets: () => Promise<void>
  openLibrary: (kind?: AssetKind) => void
  closeLibrary: () => void
  /** Pick a drop folder via the OS dialog and open the triage review inbox. */
  openTriage: () => Promise<void>
  closeTriage: () => void
  openDiscord: () => void
  closeDiscord: () => void
  setUiMode: (mode: 'build' | 'run') => void
  /** Fire a favorited library asset from any scene (music/bed toggle, sfx one-shot). */
  fireFavorite: (file: string) => void

  // Campaign-wide playlist presets (stored in library.json), playable anywhere.
  /** Id of the preset currently driving music, or null. */
  activePresetId: string | null
  presetPos: number
  savePlaylistPreset: (name: string, files: string[]) => Promise<void>
  deletePlaylistPreset: (id: string) => Promise<void>
  /** Start a preset from the top (or stop it if it's the active one). */
  togglePresetPlaylist: (id: string) => void
  /** Advance the active preset by ±1 (wraps). */
  presetStep: (dir: 1 | -1) => void
  /** Jump the active preset straight to a specific track index (crossfades). */
  presetJump: (pos: number) => void
  /** Add a library asset to the current scene's palette (by its kind). */
  addAssetToScene: (file: string) => void
  /** Edit a library entry (rename / recategorize / retag / trash-flag). */
  updateLibraryAsset: (file: string, patch: LibraryAssetPatch) => Promise<void>
  /** Delete an asset for real: file → recycle bin, entry dropped. Blocked while scenes use it. */
  deleteLibraryAsset: (file: string) => Promise<void>
  /** Batch-delete everything marked as trash (scene-referenced items are skipped). */
  purgeTrash: () => Promise<void>
  previewAsset: (file: string) => Promise<void>

  /** (Re)build the play order and start the scene's playlist from the top. */
  startPlaylist: () => void
  /** Advance by +1/-1 within the playlist (wraps per config.loop). */
  playlistStep: (dir: 1 | -1) => void
  setPlaylistEnabled: (enabled: boolean) => void
  setPlaylistShuffle: (shuffle: boolean) => void
  setPlaylistLoop: (loop: boolean) => void
  setCampaign: (c: CampaignState) => void
  /** Arm a scene: show its board and prewarm its assets. Plays nothing. */
  selectScene: (id: string) => Promise<void>
  /**
   * Take the armed scene live: stop held SFX loops from the previous scene,
   * crossfade to the default track, and start its autoplay ambience beds.
   */
  goLive: () => Promise<void>

  fireCue: (node: CueInline) => void
  switchMusic: (trackId: string) => void
  playSfx: (sfxId: string) => void

  // Live "mini mixer": adjust a single item's volume/loop, live if it's
  // playing, and persist (debounced) to the scene JSON.
  setTrackVolume: (trackId: string, v: number) => void
  setTrackLoop: (trackId: string, loop: boolean) => void
  setSfxItemVolume: (sfxId: string, v: number) => void
  setSfxItemLoop: (sfxId: string, loop: boolean) => void
  setAmbienceLayerVolume: (file: string, v: number) => void
  setAmbienceLayerLoop: (file: string, loop: boolean) => void
  /**
   * Tap an ambience bed on/off independently of the scene's auto-loaded set.
   * `opts` (from an amb cue) overrides the layer's volume / fade durations.
   */
  toggleAmbience: (file: string, opts?: AmbCueOpts) => void
  /** Flip whether a bed starts automatically on go-live (persisted). */
  setAmbienceAutoplay: (file: string, autoplay: boolean) => void
  showImage: (file: string, caption?: string) => void
  clearImage: () => void
  stopAll: () => void

  // Palette housekeeping: pull an item off the scene (the file stays in the
  // campaign/library; only the scene's reference is removed).
  removeTrack: (trackId: string) => void
  removeSfxItem: (sfxId: string) => void
  removeAmbienceLayer: (file: string) => void
  removeImage: (file: string) => void
  setImageCaption: (file: string, caption: string) => void
  renameScene: (sceneId: string, name: string) => void
  /** Move the scene's JSON file to the OS trash. */
  deleteScene: (sceneId: string) => Promise<void>

  updateScene: (sceneId: string, mutate: (s: Scene) => Scene) => Promise<void>

  // Campaign notes (see NOTES-PLAN.md).
  /** Quick switcher (Ctrl+K) open? Owns the keyboard while true. */
  switcherOpen: boolean
  setSwitcherOpen: (open: boolean) => void
  /** Quick capture (Ctrl+J) open? Owns the keyboard while true. */
  captureOpen: boolean
  setCaptureOpen: (open: boolean) => void
  /** Shortcut cheat-sheet (?) open? Owns the keyboard while true. */
  helpOpen: boolean
  setHelpOpen: (open: boolean) => void
  /** 📖 SRD compendium browser open? Owns the keyboard while true. */
  compendiumOpen: boolean
  /** Deep-link target (from Ctrl+K): open at this kind+entry. */
  compendiumTarget: { kind: import('./lib/compendium').CompendiumKind; key: string } | null
  openCompendium: (target?: { kind: import('./lib/compendium').CompendiumKind; key: string }) => void
  closeCompendium: () => void
  /** 🗺 Fog-of-war map editor open? Owns the keyboard while true. */
  mapEditorOpen: boolean
  setMapEditorOpen: (open: boolean) => void
  // --- Battle maps (SURFACES-PLAN M1) ---
  /** Which library map the editor / ⚔ tab is looking at. */
  currentMapId: string | null
  selectMap: (id: string | null) => void
  updateMap: (mapId: string, mutate: (m: import('../shared/types').CampaignMap) => import('../shared/types').CampaignMap) => Promise<void>
  createMap: (name: string, image: string) => Promise<string | null>
  deleteMap: (mapId: string) => Promise<void>
  /** Point the players' table at a map (null = blackout). */
  goLiveMap: (mapId: string | null) => Promise<void>
  /** 🗺 Map library browser open? Owns the keyboard while true. */
  mapsOpen: boolean
  setMapsOpen: (open: boolean) => void
  /** 🛡 Party dashboard / character sheets open? Owns the keyboard while true. */
  partyOpen: boolean
  setPartyOpen: (open: boolean) => void
  /** Player portal (C5): local web server where players open their sheets. */
  portalStatus: { running: boolean; url: string } | null
  togglePortal: () => Promise<void>
  updateCharacter: (characterId: string, mutate: (c: Character) => Character) => Promise<void>
  createCharacter: (name: string) => Promise<string | null>
  deleteCharacter: (characterId: string) => Promise<void>
  /** Party stash (M4): full save (DM edits) + transfer-never-copy moves. */
  saveParty: (p: PartyStash) => Promise<void>
  transferItem: (req: { itemId: string; from: string; to: string; qty?: number; who: string }) => Promise<void>
  transferCoins: (req: { from: string; to: string; coin: CoinKey; amount: number; who: string }) => Promise<void>
  /**
   * Append a timestamped line to the active session note's log (the current
   * scene's session, else the newest session note, else a new one) — the
   * "player just made a promise, write it down" key.
   */
  captureToSession: (text: string) => Promise<void>
  selectNote: (id: string | null) => void
  /** Note-navigation history (browser-style): ids you came from / went past. */
  noteBack: string[]
  noteForward: string[]
  goNoteBack: () => void
  goNoteForward: () => void
  setLeftTab: (tab: 'scenes' | 'notes') => void
  updateNote: (noteId: string, mutate: (n: CampaignNote) => CampaignNote) => Promise<void>
  createNote: (kind: NoteKind, title: string) => Promise<void>
  /**
   * Create a note WITHOUT navigating to it (create-on-first-use from a [[link
   * autocomplete): returns the new note's id, or null on failure.
   */
  createNoteInline: (kind: NoteKind, title: string) => Promise<string | null>
  /** Move the note's JSON to the OS trash. */
  deleteNote: (noteId: string) => Promise<void>
  /** Duplicate a scene to a new file ("Copy of X") and select the copy. */
  duplicateScene: (sceneId: string) => Promise<void>
  /** Create a new scene from a built-in template id ('blank', 'tavern', …) and select it. */
  createScene: (templateId: string) => Promise<void>

  chooseCampaign: () => Promise<void>
  importAssets: (kind: 'music' | 'ambience' | 'sfx') => Promise<void>
  /** Pick image files via the OS dialog; they're copied into art/ and added to the current scene. */
  importSceneImages: () => Promise<void>
  revealCampaign: () => void
  openPresenter: () => void
}

function currentScene(state: AppState): Scene | null {
  return state.campaign.scenes.find((s) => s.id === state.currentSceneId) ?? null
}

/** Lifecycle overrides carried by an `{{amb:...}}` cue (see CueInline). */
export interface AmbCueOpts {
  volume?: number
  fadeInMs?: number
  fadeOutMs?: number
}

/** Match an amb-cue ref to a scene layer by exact file, else by filename stem. */
export function resolveAmbLayer(scene: Scene | null, ref: string) {
  const layers = scene?.ambience ?? []
  const stem = assetStem(ref).toLowerCase()
  return layers.find((a) => a.file === ref) ?? layers.find((a) => assetStem(a.file).toLowerCase() === stem)
}

/** Start the preset-playlist track at `pos` (wrapping), wiring auto-advance. */
function playPresetTrack(get: () => AppState, pos: number): void {
  const st = get()
  const preset = st.campaign.library.playlists?.find((p) => p.id === st.activePresetId)
  if (!preset || preset.files.length === 0) {
    engine.stopMusic()
    return
  }
  const len = preset.files.length
  const file = preset.files[((pos % len) + len) % len]
  const asset = st.campaign.library.assets.find((a) => a.file === file)
  // Same-track wrap: switchMusic no-ops on an identical id, so force a restart.
  if (engine.status().activeMusicId === file) engine.stopMusic(DEFAULT_CROSSFADE_MS)
  engine.switchMusic(
    { id: file, label: asset?.name ?? prettyLabel(file), file, volume: 0.6 },
    DEFAULT_CROSSFADE_MS,
    { loop: false, onEnding: () => get().presetStep(1) }
  )
}

/** Start the playlist track at `pos`, wiring auto-advance into the engine. */
function playPlaylistTrack(get: () => AppState, pos: number): void {
  const state = get()
  const scene = currentScene(state)
  const trackId = state.playlistOrder[pos]
  const track = scene?.music?.find((m) => m.id === trackId)
  if (!scene || !track) {
    // Track vanished (scene edited on disk mid-play) — stop rather than guess.
    engine.stopMusic()
    return
  }
  const fade = playlistFade(scene)
  // Single-track playlist wrap: switchMusic is a no-op on the same id, so stop
  // first to force a fresh (crossfaded) restart.
  if (engine.status().activeMusicId === track.id) engine.stopMusic(fade)
  engine.switchMusic(track, fade, {
    loop: false,
    onEnding: () => get().playlistStep(1)
  })
}

export const useStore = create<AppState>((set, get) => ({
  campaign: EMPTY_CAMPAIGN,
  currentSceneId: null,
  liveSceneId: null,
  currentNoteId: null,
  leftTab: (localStorage.getItem('hearth:leftTab') as 'scenes' | 'notes') ?? 'scenes',
  status: engine.status(),
  presenting: null,
  toasts: [],
  libraryOpen: false,
  libraryKind: 'all',
  previewingFile: null,
  triage: null,
  discordOpen: false,
  discordStatus: null,
  uiMode: (localStorage.getItem('hearth:uiMode') as 'build' | 'run') ?? 'build',
  activePresetId: null,
  presetPos: 0,
  playlistOrder: [],
  playlistPos: 0,

  bootstrap: async () => {
    // Restore the bus faders from the last session before wiring subscribers.
    try {
      const saved = JSON.parse(localStorage.getItem('hearth:mixer') ?? 'null')
      if (saved) {
        engine.setMasterVolume(saved.master ?? 0.9)
        engine.setMusicVolume(saved.music ?? 1)
        engine.setAmbienceVolume(saved.ambience ?? 1)
        engine.setSfxVolume(saved.sfx ?? 1)
      }
    } catch {
      /* corrupt prefs — fall back to defaults */
    }
    engine.subscribe((status) => {
      set({ status })
      debouncePersist('busvol', () =>
        localStorage.setItem(
          'hearth:mixer',
          JSON.stringify({
            master: status.masterVolume,
            music: status.musicVolume,
            ambience: status.ambienceVolume,
            sfx: status.sfxVolume
          })
        )
      )
    })
    engine.onError((message) => get().pushToast(message, 'error'))
    window.hearth.onCampaignChanged((c) => get().setCampaign(c))
    // Discord bridge: mirror status; the tap streams only while in a channel.
    const syncDiscord = (status: DiscordStatus) => {
      set({ discordStatus: status })
      if (status.state === 'joined') {
        void engine.startTap((chunk) => window.hearth.discordSendPcm(chunk))
      } else {
        engine.stopTap()
        // Local-mute exists to avoid hearing the bot twice — once the stream
        // ends, silence would just look broken. Restore the room audio.
        if (engine.status().monitorMuted) engine.setMonitorMuted(false)
      }
    }
    window.hearth.onDiscordStatus(syncDiscord)
    window.hearth.discordStatus().then(syncDiscord)
    const campaign = await window.hearth.getCampaign()
    get().setCampaign(campaign)
  },

  bootstrapData: async () => {
    window.hearth.onCampaignChanged((c) => get().setCampaign(c))
    const campaign = await window.hearth.getCampaign()
    get().setCampaign(campaign)
  },

  pushToast: (message, tone = 'info') => {
    const id = ++toastSeq
    set((state) => ({ toasts: [...state.toasts, { id, message, tone }] }))
    // Auto-dismiss; errors linger a little longer than info.
    window.setTimeout(() => get().dismissToast(id), tone === 'error' ? 6000 : 3500)
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  openLibrary: (kind) => set({ libraryOpen: true, libraryKind: kind ?? 'all' }),
  closeLibrary: () => {
    currentPreviewStop?.()
    currentPreviewStop = null
    set({ libraryOpen: false, previewingFile: null })
  },

  openTriage: async () => {
    try {
      const scan = await window.hearth.pickTriageFolder()
      if (!scan) return // dialog canceled
      if (scan.files.length === 0) {
        get().pushToast('No audio files found in that folder', 'info')
        return
      }
      set({ triage: scan })
    } catch (err) {
      get().pushToast(`Triage failed: ${(err as Error).message}`, 'error')
    }
  },

  closeTriage: () => {
    currentPreviewStop?.()
    currentPreviewStop = null
    set({ triage: null, previewingFile: null })
  },

  openDiscord: () => set({ discordOpen: true }),
  closeDiscord: () => set({ discordOpen: false }),

  setUiMode: (mode) => {
    localStorage.setItem('hearth:uiMode', mode)
    set({ uiMode: mode })
  },

  fireFavorite: (file) => {
    const asset = get().campaign.library.assets.find((a) => a.file === file)
    const kind: AssetKind = asset?.kind ?? ((file.split('/')[0] as AssetKind) || 'sfx')
    const label = asset?.name ?? prettyLabel(file)
    if (kind === 'music') {
      set({ activePresetId: null }) // manual music supersedes a preset run
      // Toggle semantics: tapping the playing staple stops the music.
      if (get().status.activeMusicId === file) engine.stopMusic()
      else engine.switchMusic({ id: file, label, file, volume: 0.6 })
    } else if (kind === 'ambience') {
      if (get().status.ambienceFiles.includes(file)) engine.stopAmbienceLayer(file)
      else engine.startAmbienceLayer({ file, volume: 0.4 })
    } else {
      engine.playSfx({ id: `fav:${file}`, label, file })
    }
  },

  savePlaylistPreset: async (name, files) => {
    const presets = [...(get().campaign.library.playlists ?? [])]
    const base =
      name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'playlist'
    let id = base
    for (let n = 2; presets.some((p) => p.id === id); n++) id = `${base}-${n}`
    presets.push({ id, name: name.trim() || id, files })
    try {
      const state = await window.hearth.savePlaylistPresets(presets)
      get().setCampaign(state)
      get().pushToast(`Playlist "${name.trim() || id}" saved — play it from the dock`, 'info')
    } catch (err) {
      get().pushToast(`Save failed: ${(err as Error).message}`, 'error')
    }
  },

  deletePlaylistPreset: async (id) => {
    const presets = (get().campaign.library.playlists ?? []).filter((p) => p.id !== id)
    if (get().activePresetId === id) set({ activePresetId: null })
    try {
      const state = await window.hearth.savePlaylistPresets(presets)
      get().setCampaign(state)
    } catch (err) {
      get().pushToast(`Delete failed: ${(err as Error).message}`, 'error')
    }
  },

  togglePresetPlaylist: (id) => {
    if (get().activePresetId === id) {
      set({ activePresetId: null })
      engine.stopMusic()
      return
    }
    set({ activePresetId: id, presetPos: 0 })
    playPresetTrack(get, 0)
  },

  presetStep: (dir) => {
    const st = get()
    if (!st.activePresetId) return
    const preset = st.campaign.library.playlists?.find((p) => p.id === st.activePresetId)
    const len = preset?.files.length ?? 0
    if (!preset || len === 0) {
      set({ activePresetId: null })
      return
    }
    const next = (((st.presetPos + dir) % len) + len) % len
    set({ presetPos: next })
    playPresetTrack(get, next)
  },

  presetJump: (pos) => {
    const st = get()
    if (!st.activePresetId) return
    const preset = st.campaign.library.playlists?.find((p) => p.id === st.activePresetId)
    const len = preset?.files.length ?? 0
    if (!preset || len === 0) {
      set({ activePresetId: null })
      return
    }
    const target = ((pos % len) + len) % len
    set({ presetPos: target })
    playPresetTrack(get, target)
  },

  addAssetToScene: (file) => {
    const scene = currentScene(get())
    if (!scene) return
    const asset = get().campaign.library.assets.find((a) => a.file === file)
    // Fall back to the top-level folder as the kind for un-indexed files.
    const kind: AssetKind =
      asset?.kind ?? ((file.split('/')[0] as AssetKind) || 'sfx')
    const label = asset?.name ?? prettyLabel(file)
    get().updateScene(scene.id, (s) => {
      if (kind === 'music') {
        if ((s.music ?? []).some((m) => m.file === file)) return s
        const id = uniqueAssetId(s.music ?? [], file)
        return { ...s, music: [...(s.music ?? []), { id, label, file }] }
      }
      if (kind === 'ambience') {
        if ((s.ambience ?? []).some((a) => a.file === file)) return s
        return { ...s, ambience: [...(s.ambience ?? []), { file }] }
      }
      if ((s.sfx ?? []).some((x) => x.file === file)) return s
      const id = uniqueAssetId(s.sfx ?? [], file)
      return { ...s, sfx: [...(s.sfx ?? []), { id, label, file }] }
    })
    get().pushToast(`Added ${prettyLabel(file)} to ${scene.name}`, 'info')
  },

  updateLibraryAsset: async (file, patch) => {
    try {
      const state = await window.hearth.updateLibraryAsset(file, patch)
      get().setCampaign(state)
    } catch (err) {
      get().pushToast(`Library update failed: ${(err as Error).message}`, 'error')
    }
  },

  deleteLibraryAsset: async (file) => {
    try {
      const state = await window.hearth.deleteLibraryAsset(file)
      get().setCampaign(state)
      get().pushToast('Sound moved to the recycle bin (and blocklisted)', 'info')
    } catch (err) {
      get().pushToast(`Delete failed: ${(err as Error).message}`, 'error')
    }
  },

  purgeTrash: async () => {
    try {
      const { state, purged, skipped } = await window.hearth.purgeTrash()
      get().setCampaign(state)
      get().pushToast(
        `Purged ${purged} sound${purged === 1 ? '' : 's'} (recycle bin + blocklist)` +
          (skipped.length ? ` — ${skipped.length} kept, still used by scenes` : ''),
        'info'
      )
    } catch (err) {
      get().pushToast(`Purge failed: ${(err as Error).message}`, 'error')
    }
  },

  startPlaylist: () => {
    const scene = currentScene(get())
    const tracks = scene?.music ?? []
    if (!scene || tracks.length === 0) return
    const ids = tracks.map((m) => m.id)
    const order = scene.playlist?.shuffle ? shuffled(ids) : ids
    set({ playlistOrder: order, playlistPos: 0 })
    playPlaylistTrack(get, 0)
  },

  playlistStep: (dir) => {
    const scene = currentScene(get())
    const { playlistOrder, playlistPos } = get()
    if (!scene || playlistOrder.length === 0) return
    let next = playlistPos + dir
    if (next >= playlistOrder.length || next < 0) {
      if (scene.playlist?.loop === false) {
        engine.stopMusic(playlistFade(scene))
        return
      }
      next = (next + playlistOrder.length) % playlistOrder.length
    }
    set({ playlistPos: next })
    playPlaylistTrack(get, next)
  },

  setPlaylistEnabled: async (enabled) => {
    const scene = currentScene(get())
    if (!scene) return
    await get().updateScene(scene.id, (s) => ({ ...s, playlist: { ...s.playlist, enabled } }))
    if (enabled) get().startPlaylist()
    // Turning playlist off leaves the current track playing; it just stops
    // auto-advancing (its end timer dies with the next switch/stop).
  },

  setPlaylistShuffle: async (shuffle) => {
    const scene = currentScene(get())
    if (!scene) return
    await get().updateScene(scene.id, (s) => ({ ...s, playlist: { ...s.playlist, shuffle } }))
    // Re-order the remaining queue without restarting the current track.
    const { playlistOrder, playlistPos } = get()
    const current = playlistOrder[playlistPos]
    const ids = (currentScene(get())?.music ?? []).map((m) => m.id)
    const rest = ids.filter((id) => id !== current)
    const order = current
      ? [current, ...(shuffle ? shuffled(rest) : rest)]
      : shuffle
        ? shuffled(ids)
        : ids
    set({ playlistOrder: order, playlistPos: current ? 0 : get().playlistPos })
  },

  setPlaylistLoop: async (loop) => {
    const scene = currentScene(get())
    if (!scene) return
    await get().updateScene(scene.id, (s) => ({ ...s, playlist: { ...s.playlist, loop } }))
  },

  previewAsset: async (file) => {
    // Toggle: clicking the currently-playing asset stops it.
    const wasPlaying = get().previewingFile === file
    currentPreviewStop?.()
    currentPreviewStop = null
    set({ previewingFile: null })
    if (wasPlaying) return
    set({ previewingFile: file })
    const stop = await engine.preview(file, () => {
      currentPreviewStop = null
      // Only clear if this audition is still the active one.
      if (get().previewingFile === file) set({ previewingFile: null })
    })
    // A newer audition may have started while we awaited the decode.
    if (get().previewingFile === file) currentPreviewStop = stop
    else stop()
  },

  probeAssets: async () => {
    const { campaign } = get()
    // Every file the campaign references: library assets + everything each scene points at.
    const files = new Set<string>(campaign.library.assets.map((a) => a.file))
    for (const scene of campaign.scenes) {
      scene.music?.forEach((m) => files.add(m.file))
      scene.ambience?.forEach((a) => files.add(a.file))
      scene.sfx?.forEach((s) => files.add(s.file))
      scene.images?.forEach((i) => files.add(i.file))
    }
    const failures = await window.hearth.probeFiles([...files])
    if (failures.length === 0) {
      get().pushToast(`All ${files.size} assets OK`, 'info')
    } else {
      get().pushToast(`${failures.length} missing: ${failures.slice(0, 3).join(', ')}${failures.length > 3 ? '…' : ''}`, 'error')
    }
  },

  setCampaign: (c) => {
    set({ campaign: c })
    // Keep a valid selection; default to first scene if none selected.
    const { currentSceneId, currentNoteId, currentMapId } = get()
    const stillExists = c.scenes.some((s) => s.id === currentSceneId)
    if (!stillExists) {
      set({ currentSceneId: c.scenes[0]?.id ?? null })
    }
    if (currentNoteId && !c.notes.some((n) => n.id === currentNoteId)) {
      set({ currentNoteId: null })
    }
    if (currentMapId && !c.maps.some((m) => m.id === currentMapId)) {
      set({ currentMapId: null, mapEditorOpen: false })
    }
  },

  selectScene: async (id) => {
    const scene = get().campaign.scenes.find((s) => s.id === id)
    if (!scene) return
    // Arm only: the DM can read the script and prep the board in silence while
    // the previous scene's atmosphere keeps playing. goLive() starts the audio.
    set({ currentSceneId: id })
    engine.prewarm(scene)
  },

  goLive: async () => {
    const scene = currentScene(get())
    if (!scene) return
    // Held loops belong to the outgoing atmosphere — never carry them across.
    engine.stopAllSfxLoops()
    set({ liveSceneId: scene.id, activePresetId: null })
    if (scene.playlist?.enabled && (scene.music?.length ?? 0) > 0) {
      // Playlist mode: the store drives music; the engine only handles ambience.
      await engine.setAmbience(
        (scene.ambience ?? []).filter((a) => a.autoplay !== false),
        scene.transition?.crossfadeMs
      )
      get().startPlaylist()
    } else {
      await engine.loadScene(scene)
    }
  },

  fireCue: (node) => {
    if (node.kind === 'music') get().switchMusic(node.ref)
    else if (node.kind === 'sfx') get().playSfx(node.ref)
    else if (node.kind === 'image') get().showImage(node.ref)
    else if (node.kind === 'amb') {
      const layer = resolveAmbLayer(currentScene(get()), node.ref)
      if (layer)
        get().toggleAmbience(layer.file, {
          volume: node.volume,
          fadeInMs: node.fadeInMs,
          fadeOutMs: node.fadeOutMs
        })
      else get().pushToast(`No ambience bed matches "${node.ref}" on this scene`, 'error')
    }
  },

  switchMusic: (trackId) => {
    const scene = currentScene(get())
    const track = scene?.music?.find((m) => m.id === trackId)
    if (!track || !scene) return
    set({ activePresetId: null }) // manual music supersedes a preset run
    if (scene.playlist?.enabled) {
      // In playlist mode a palette/cue tap jumps the queue to that track. If
      // the track isn't in the order (added after the playlist started),
      // rebuild the order so auto-advance keeps working instead of silently
      // falling out of playlist mode.
      let pos = get().playlistOrder.indexOf(trackId)
      if (pos === -1) {
        const ids = (scene.music ?? []).map((m) => m.id)
        const order = scene.playlist.shuffle ? shuffled(ids) : ids
        pos = order.indexOf(trackId)
        set({ playlistOrder: order })
      }
      if (pos !== -1) {
        set({ playlistPos: pos })
        playPlaylistTrack(get, pos)
        return
      }
    }
    engine.switchMusic(track, scene.transition?.crossfadeMs)
  },

  playSfx: (sfxId) => {
    const scene = currentScene(get())
    const sfx = scene?.sfx?.find((s) => s.id === sfxId)
    if (sfx) engine.playSfx(sfx)
  },

  setTrackVolume: (trackId, v) => {
    const scene = currentScene(get())
    if (!scene) return
    if (get().status.activeMusicId === trackId) engine.setActiveMusicVolume(v)
    debouncePersist(`vol:m:${scene.id}:${trackId}`, () =>
      get().updateScene(scene.id, (s) => ({
        ...s,
        music: (s.music ?? []).map((m) => (m.id === trackId ? { ...m, volume: v } : m))
      }))
    )
  },

  setTrackLoop: (trackId, loop) => {
    const scene = currentScene(get())
    if (!scene) return
    if (get().status.activeMusicId === trackId) engine.setActiveMusicLoop(loop)
    get().updateScene(scene.id, (s) => ({
      ...s,
      music: (s.music ?? []).map((m) => (m.id === trackId ? { ...m, loop } : m))
    }))
  },

  setSfxItemVolume: (sfxId, v) => {
    const scene = currentScene(get())
    if (!scene) return
    engine.setSfxLoopVolume(sfxId, v) // live only if this sfx is currently looping
    debouncePersist(`vol:s:${scene.id}:${sfxId}`, () =>
      get().updateScene(scene.id, (s) => ({
        ...s,
        sfx: (s.sfx ?? []).map((x) => (x.id === sfxId ? { ...x, volume: v } : x))
      }))
    )
  },

  setSfxItemLoop: (sfxId, loop) => {
    const scene = currentScene(get())
    if (!scene) return
    if (!loop) engine.stopSfxLoop(sfxId) // stop any live loop when disabling
    get().updateScene(scene.id, (s) => ({
      ...s,
      sfx: (s.sfx ?? []).map((x) => (x.id === sfxId ? { ...x, loop } : x))
    }))
  },

  setAmbienceLayerVolume: (file, v) => {
    const scene = currentScene(get())
    if (!scene) return
    engine.setAmbienceLayerVolume(file, v)
    debouncePersist(`vol:a:${scene.id}:${file}`, () =>
      get().updateScene(scene.id, (s) => ({
        ...s,
        ambience: (s.ambience ?? []).map((a) => (a.file === file ? { ...a, volume: v } : a))
      }))
    )
  },

  setAmbienceLayerLoop: (file, loop) => {
    const scene = currentScene(get())
    if (!scene) return
    engine.setAmbienceLayerLoop(file, loop)
    get().updateScene(scene.id, (s) => ({
      ...s,
      ambience: (s.ambience ?? []).map((a) => (a.file === file ? { ...a, loop } : a))
    }))
  },

  toggleAmbience: (file, opts) => {
    const layer = currentScene(get())?.ambience?.find((a) => a.file === file)
    if (!layer) return
    if (get().status.ambienceFiles.includes(file)) {
      engine.stopAmbienceLayer(file, opts?.fadeOutMs)
      return
    }
    // The cue's target volume wins over the layer's authored one.
    const volume = opts?.volume ?? layer.volume
    // A zero-volume bed "plays" silently — indistinguishable from broken. Bump
    // it to the default level (and persist) so a tap is always audible.
    if ((volume ?? 0.4) <= 0.001) {
      engine.startAmbienceLayer({ ...layer, volume: 0.4 }, opts?.fadeInMs)
      get().setAmbienceLayerVolume(file, 0.4)
    } else {
      engine.startAmbienceLayer({ ...layer, volume }, opts?.fadeInMs)
    }
  },

  setAmbienceAutoplay: (file, autoplay) => {
    const scene = currentScene(get())
    if (!scene) return
    get().updateScene(scene.id, (s) => ({
      ...s,
      ambience: (s.ambience ?? []).map((a) => (a.file === file ? { ...a, autoplay } : a))
    }))
  },

  showImage: (file, caption) => {
    const scene = currentScene(get())
    const img = scene?.images?.find((i) => i.file === file)
    const finalCaption = caption ?? img?.caption
    set({ presenting: { file, caption: finalCaption } })
    window.hearth.presenterShow({ file, caption: finalCaption })
  },

  clearImage: () => {
    set({ presenting: null })
    window.hearth.presenterShow({ file: null })
  },

  stopAll: () => {
    set({ activePresetId: null })
    engine.stopAll()
  },

  removeTrack: (trackId) => {
    const scene = currentScene(get())
    if (!scene) return
    if (get().status.activeMusicId === trackId) engine.stopMusic()
    get().updateScene(scene.id, (s) => ({
      ...s,
      music: (s.music ?? []).filter((m) => m.id !== trackId)
    }))
  },

  removeSfxItem: (sfxId) => {
    const scene = currentScene(get())
    if (!scene) return
    engine.stopSfxLoop(sfxId)
    get().updateScene(scene.id, (s) => ({
      ...s,
      sfx: (s.sfx ?? []).filter((x) => x.id !== sfxId)
    }))
  },

  removeAmbienceLayer: (file) => {
    const scene = currentScene(get())
    if (!scene) return
    engine.stopAmbienceLayer(file)
    get().updateScene(scene.id, (s) => ({
      ...s,
      ambience: (s.ambience ?? []).filter((a) => a.file !== file)
    }))
  },

  removeImage: (file) => {
    const scene = currentScene(get())
    if (!scene) return
    if (get().presenting?.file === file) get().clearImage()
    get().updateScene(scene.id, (s) => ({
      ...s,
      images: (s.images ?? []).filter((i) => i.file !== file)
    }))
  },

  setImageCaption: (file, caption) => {
    const scene = currentScene(get())
    if (!scene) return
    get().updateScene(scene.id, (s) => ({
      ...s,
      images: (s.images ?? []).map((i) =>
        i.file === file ? { ...i, caption: caption.trim() || undefined } : i
      )
    }))
  },

  renameScene: (sceneId, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    get().updateScene(sceneId, (s) => ({ ...s, name: trimmed }))
  },

  deleteScene: async (sceneId) => {
    try {
      const state = await window.hearth.deleteScene(sceneId)
      if (get().liveSceneId === sceneId) set({ liveSceneId: null })
      get().setCampaign(state)
      get().pushToast('Scene moved to the recycle bin', 'info')
    } catch (err) {
      get().pushToast(`Delete failed: ${(err as Error).message}`, 'error')
    }
  },

  updateScene: async (sceneId, mutate) => {
    const scene = get().campaign.scenes.find((s) => s.id === sceneId)
    if (!scene) return
    const updated = mutate(scene)
    // Optimistic: reflect immediately, then persist to disk.
    set((state) => ({
      campaign: {
        ...state.campaign,
        scenes: state.campaign.scenes.map((s) => (s.id === sceneId ? updated : s))
      }
    }))
    try {
      const fresh = await window.hearth.saveScene(updated)
      get().setCampaign(fresh)
    } catch (err) {
      // The optimistic update already showed success — the DM must hear about
      // a failed persist or the prep is silently gone next launch.
      console.error('saveScene failed', err)
      get().pushToast(`Scene save failed: ${(err as Error).message}`, 'error')
    }
  },

  // --- Battle maps (SURFACES-PLAN M1): the ⚔ Table's map library -------------
  currentMapId: null,
  selectMap: (id) => set({ currentMapId: id }),
  updateMap: async (mapId, mutate) => {
    const m = get().campaign.maps.find((x) => x.id === mapId)
    if (!m) return
    const updated = mutate(m)
    // Optimistic: reflect immediately, then persist to disk.
    set((state) => ({
      campaign: {
        ...state.campaign,
        maps: state.campaign.maps.map((x) => (x.id === mapId ? updated : x))
      }
    }))
    try {
      const fresh = await window.hearth.saveMap(updated)
      get().setCampaign(fresh)
    } catch (err) {
      console.error('saveMap failed', err)
      get().pushToast(`Map save failed: ${(err as Error).message}`, 'error')
    }
  },
  createMap: async (name, image) => {
    try {
      const { state, mapId } = await window.hearth.createMap(name, image)
      get().setCampaign(state)
      set({ currentMapId: mapId })
      return mapId
    } catch (err) {
      get().pushToast(`Create map failed: ${(err as Error).message}`, 'error')
      return null
    }
  },
  deleteMap: async (mapId) => {
    try {
      const fresh = await window.hearth.deleteMap(mapId)
      get().setCampaign(fresh)
      get().pushToast('Map moved to the recycle bin', 'info')
    } catch (err) {
      get().pushToast(`Delete failed: ${(err as Error).message}`, 'error')
    }
  },
  goLiveMap: async (mapId) => {
    try {
      const fresh = await window.hearth.goLiveMap(mapId)
      get().setCampaign(fresh)
      get().pushToast(mapId ? 'Map is LIVE — players see it' : 'Table blacked out', 'info')
    } catch (err) {
      get().pushToast(`Go live failed: ${(err as Error).message}`, 'error')
    }
  },
  mapsOpen: false,
  setMapsOpen: (open) => set({ mapsOpen: open }),

  switcherOpen: false,
  setSwitcherOpen: (open) => set({ switcherOpen: open }),
  captureOpen: false,
  setCaptureOpen: (open) => set({ captureOpen: open }),

  helpOpen: false,
  setHelpOpen: (open) => set({ helpOpen: open }),

  compendiumOpen: false,
  compendiumTarget: null,
  openCompendium: (target) => set({ compendiumOpen: true, compendiumTarget: target ?? null }),
  closeCompendium: () => set({ compendiumOpen: false, compendiumTarget: null }),

  mapEditorOpen: false,
  setMapEditorOpen: (open) => set({ mapEditorOpen: open }),

  partyOpen: false,
  setPartyOpen: (open) => {
    set({ partyOpen: open })
    // Refresh the portal indicator whenever the panel opens.
    if (open) void window.hearth.portalStatus().then((s) => set({ portalStatus: s }))
  },

  portalStatus: null,
  togglePortal: async () => {
    try {
      const s = await window.hearth.portalToggle()
      set({ portalStatus: s })
      get().pushToast(
        s.running ? `Player portal ON — send your players ${s.url}` : 'Player portal stopped',
        'info'
      )
    } catch (err) {
      get().pushToast(`Portal failed: ${(err as Error).message}`, 'error')
    }
  },

  updateCharacter: async (characterId, mutate) => {
    const c = get().campaign.characters.find((x) => x.id === characterId)
    if (!c) return
    const updated = mutate(c)
    // Optimistic: reflect immediately, then persist to disk.
    set((state) => ({
      campaign: {
        ...state.campaign,
        characters: state.campaign.characters.map((x) => (x.id === characterId ? updated : x))
      }
    }))
    try {
      const fresh = await window.hearth.saveCharacter(updated)
      get().setCampaign(fresh)
    } catch (err) {
      console.error('saveCharacter failed', err)
      get().pushToast(`Character save failed: ${(err as Error).message}`, 'error')
    }
  },

  createCharacter: async (name) => {
    try {
      const { state, characterId } = await window.hearth.createCharacter(name)
      get().setCampaign(state)
      return characterId
    } catch (err) {
      get().pushToast(`New character failed: ${(err as Error).message}`, 'error')
      return null
    }
  },

  deleteCharacter: async (characterId) => {
    try {
      const state = await window.hearth.deleteCharacter(characterId)
      get().setCampaign(state)
    } catch (err) {
      get().pushToast(`Delete failed: ${(err as Error).message}`, 'error')
    }
  },

  saveParty: async (p) => {
    // Optimistic, like updateCharacter — the stash edits feel instant.
    set((state) => ({ campaign: { ...state.campaign, party: p } }))
    try {
      const fresh = await window.hearth.saveParty(p)
      get().setCampaign(fresh)
    } catch (err) {
      get().pushToast(`Stash save failed: ${(err as Error).message}`, 'error')
    }
  },

  transferItem: async (req) => {
    try {
      const fresh = await window.hearth.transferItem(req)
      get().setCampaign(fresh)
    } catch (err) {
      get().pushToast(`Transfer failed: ${(err as Error).message}`, 'error')
    }
  },

  transferCoins: async (req) => {
    try {
      const fresh = await window.hearth.transferCoins(req)
      get().setCampaign(fresh)
    } catch (err) {
      get().pushToast(`Transfer failed: ${(err as Error).message}`, 'error')
    }
  },

  captureToSession: async (text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const st = get()
    // Target: the armed scene's session, else the newest session note.
    const sessions = st.campaign.notes.filter((n) => n.kind === 'session')
    const sceneSession = currentScene(st)?.session
    let target: CampaignNote | undefined =
      sessions.find((n) => n.id === sceneSession) ??
      [...sessions].sort((a, b) =>
        (b.date ?? b.createdAt ?? '').localeCompare(a.date ?? a.createdAt ?? '')
      )[0]
    if (!target) {
      // First capture of the campaign: make the session log exist.
      try {
        const { state, noteId } = await window.hearth.createNote('session', 'Session Log')
        get().setCampaign(state)
        target = state.notes.find((n) => n.id === noteId)
      } catch (err) {
        get().pushToast(`Capture failed: ${(err as Error).message}`, 'error')
        return
      }
      if (!target) return
    }
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const line: ScriptBlock = {
      type: 'paragraph',
      content: [
        { type: 'text', text: `${hh}:${mm} — `, marks: [{ type: 'color', value: 'whisper' }] },
        { type: 'text', text: trimmed }
      ]
    }
    await get().updateNote(target.id, (n) => ({ ...n, body: [...(n.body ?? []), line] }))
    get().pushToast(`Logged to ${target.title}`, 'info')
  },

  selectNote: (id) =>
    set((s) => {
      if (id === s.currentNoteId) return {}
      // Only real note→note jumps build history; deselects don't.
      const noteBack =
        id && s.currentNoteId ? [...s.noteBack, s.currentNoteId].slice(-50) : s.noteBack
      return { currentNoteId: id, noteBack, noteForward: id ? [] : s.noteForward }
    }),

  noteBack: [],
  noteForward: [],

  goNoteBack: () =>
    set((s) => {
      const prev = s.noteBack[s.noteBack.length - 1]
      if (!prev) return {}
      return {
        currentNoteId: prev,
        noteBack: s.noteBack.slice(0, -1),
        noteForward: s.currentNoteId ? [s.currentNoteId, ...s.noteForward].slice(0, 50) : s.noteForward
      }
    }),

  goNoteForward: () =>
    set((s) => {
      const next = s.noteForward[0]
      if (!next) return {}
      return {
        currentNoteId: next,
        noteForward: s.noteForward.slice(1),
        noteBack: s.currentNoteId ? [...s.noteBack, s.currentNoteId].slice(-50) : s.noteBack
      }
    }),

  setLeftTab: (tab) => {
    localStorage.setItem('hearth:leftTab', tab)
    set({ leftTab: tab })
  },

  updateNote: async (noteId, mutate) => {
    const note = get().campaign.notes.find((n) => n.id === noteId)
    if (!note) return
    const updated = mutate(note)
    // Optimistic: reflect immediately, then persist to disk.
    set((state) => ({
      campaign: {
        ...state.campaign,
        notes: state.campaign.notes.map((n) => (n.id === noteId ? updated : n))
      }
    }))
    try {
      const fresh = await window.hearth.saveNote(updated)
      get().setCampaign(fresh)
    } catch (err) {
      console.error('saveNote failed', err)
      get().pushToast(`Note save failed: ${(err as Error).message}`, 'error')
    }
  },

  createNote: async (kind, title) => {
    try {
      const { state, noteId } = await window.hearth.createNote(kind, title)
      get().setCampaign(state)
      set({ currentNoteId: noteId, leftTab: 'notes' })
      // Lazy-DM carry-forward: a new session inherits the previous session's
      // unchecked secrets & clues — unfinished business rolls forward.
      if (kind === 'session') {
        const prev = state.notes
          .filter((n) => n.kind === 'session' && n.id !== noteId)
          .sort((a, b) =>
            (b.date ?? b.createdAt ?? '').localeCompare(a.date ?? a.createdAt ?? '')
          )[0]
        const carried = docUncheckedItems(prev?.body)
        if (prev && carried.length > 0) {
          const blocks: ScriptBlock[] = [
            {
              type: 'heading',
              level: 2,
              content: [{ type: 'text', text: `Carried forward (from ${prev.title})` }]
            },
            ...carried.map((c) => ({ ...c, checked: undefined }) as ScriptBlock)
          ]
          await get().updateNote(noteId, (n) => ({ ...n, body: [...(n.body ?? []), ...blocks] }))
          get().pushToast(
            `Carried ${carried.length} unchecked item${carried.length === 1 ? '' : 's'} from "${prev.title}"`,
            'info'
          )
        }
      }
    } catch (err) {
      get().pushToast(`New note failed: ${(err as Error).message}`, 'error')
    }
  },

  createNoteInline: async (kind, title) => {
    try {
      const { state, noteId } = await window.hearth.createNote(kind, title)
      get().setCampaign(state)
      const label = NOTE_KINDS[kind]?.label ?? 'note'
      get().pushToast(
        kind === 'note'
          ? `Created note "${title}" — retype its kind on its page`
          : `Created ${label} note "${title}"`,
        'info'
      )
      return noteId
    } catch (err) {
      get().pushToast(`New note failed: ${(err as Error).message}`, 'error')
      return null
    }
  },

  deleteNote: async (noteId) => {
    try {
      if (get().currentNoteId === noteId) set({ currentNoteId: null })
      const state = await window.hearth.deleteNote(noteId)
      get().setCampaign(state)
    } catch (err) {
      get().pushToast(`Delete failed: ${(err as Error).message}`, 'error')
    }
  },

  duplicateScene: async (sceneId) => {
    try {
      const { state, sceneId: newId } = await window.hearth.duplicateScene(sceneId)
      get().setCampaign(state)
      await get().selectScene(newId)
    } catch (err) {
      get().pushToast(`Duplicate failed: ${(err as Error).message}`, 'error')
    }
  },

  createScene: async (templateId) => {
    try {
      const { state, sceneId } = await window.hearth.createScene(templateId)
      get().setCampaign(state)
      await get().selectScene(sceneId)
    } catch (err) {
      get().pushToast(`New scene failed: ${(err as Error).message}`, 'error')
    }
  },

  chooseCampaign: async () => {
    const c = await window.hearth.chooseCampaign()
    get().setCampaign(c)
  },

  importAssets: async (kind) => {
    const c = await window.hearth.importAssets(kind)
    get().setCampaign(c)
  },

  importSceneImages: async () => {
    const scene = currentScene(get())
    if (!scene) return
    try {
      const result = await window.hearth.importSceneImages(scene.id)
      if (!result) return // dialog canceled
      get().setCampaign(result.state)
      get().pushToast(`Added ${result.added} image${result.added === 1 ? '' : 's'} to ${scene.name}`, 'info')
    } catch (err) {
      get().pushToast(`Image import failed: ${(err as Error).message}`, 'error')
    }
  },

  revealCampaign: () => window.hearth.revealCampaign(),
  openPresenter: () => window.hearth.openPresenter()
}))
