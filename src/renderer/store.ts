import { create } from 'zustand'
import {
  DEFAULT_CROSSFADE_MS,
  type AssetKind,
  type CampaignState,
  type CueInline,
  type Scene
} from '../shared/types'
import { AudioEngine, type EngineStatus } from './audio/AudioEngine'

/** One audio engine per session, shared across the UI. */
export const engine = new AudioEngine()

const EMPTY_CAMPAIGN: CampaignState = { path: null, scenes: [], library: { assets: [] }, errors: [] }

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

/** Filename without directory or extension, e.g. "music/old-tower-inn.mp3" → "old-tower-inn". */
function assetStem(file: string): string {
  return (file.split('/').pop() ?? file).replace(/\.[^.]+$/, '')
}

/** A readable label from a filename: "old-tower-inn" → "Old Tower Inn". */
function prettyLabel(file: string): string {
  return assetStem(file)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
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
  currentSceneId: string | null
  status: EngineStatus
  presenting: PresentingImage | null
  toasts: Toast[]
  libraryOpen: boolean
  /** Kind to preselect when the library browser opens (from a section's + Add). */
  libraryKind: AssetKind | 'all'
  /** Library asset file currently being auditioned, or null. */
  previewingFile: string | null
  /** Track-id play order for the current scene's playlist mode. */
  playlistOrder: string[]
  /** Index into playlistOrder of the current/last-started track. */
  playlistPos: number

  bootstrap: () => Promise<void>
  pushToast: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void
  probeAssets: () => Promise<void>
  openLibrary: (kind?: AssetKind) => void
  closeLibrary: () => void
  /** Add a library asset to the current scene's palette (by its kind). */
  addAssetToScene: (file: string) => void
  previewAsset: (file: string) => Promise<void>

  /** (Re)build the play order and start the scene's playlist from the top. */
  startPlaylist: () => void
  /** Advance by +1/-1 within the playlist (wraps per config.loop). */
  playlistStep: (dir: 1 | -1) => void
  setPlaylistEnabled: (enabled: boolean) => void
  setPlaylistShuffle: (shuffle: boolean) => void
  setPlaylistLoop: (loop: boolean) => void
  setCampaign: (c: CampaignState) => void
  selectScene: (id: string) => Promise<void>

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
  /** Tap an ambience bed on/off independently of the scene's auto-loaded set. */
  toggleAmbience: (file: string) => void
  showImage: (file: string, caption?: string) => void
  clearImage: () => void
  stopAll: () => void

  updateScene: (sceneId: string, mutate: (s: Scene) => Scene) => Promise<void>
  /** Duplicate a scene to a new file ("Copy of X") and select the copy. */
  duplicateScene: (sceneId: string) => Promise<void>
  /** Create a new scene from a built-in template id ('blank', 'tavern', …) and select it. */
  createScene: (templateId: string) => Promise<void>

  chooseCampaign: () => Promise<void>
  importAssets: (kind: 'music' | 'ambience' | 'sfx') => Promise<void>
  revealCampaign: () => void
  openPresenter: () => void
}

function currentScene(state: AppState): Scene | null {
  return state.campaign.scenes.find((s) => s.id === state.currentSceneId) ?? null
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
  status: engine.status(),
  presenting: null,
  toasts: [],
  libraryOpen: false,
  libraryKind: 'all',
  previewingFile: null,
  playlistOrder: [],
  playlistPos: 0,

  bootstrap: async () => {
    engine.subscribe((status) => set({ status }))
    engine.onError((message) => get().pushToast(message, 'error'))
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

  addAssetToScene: (file) => {
    const scene = currentScene(get())
    if (!scene) return
    const asset = get().campaign.library.assets.find((a) => a.file === file)
    // Fall back to the top-level folder as the kind for un-indexed files.
    const kind: AssetKind =
      asset?.kind ?? ((file.split('/')[0] as AssetKind) || 'sfx')
    get().updateScene(scene.id, (s) => {
      if (kind === 'music') {
        if ((s.music ?? []).some((m) => m.file === file)) return s
        const id = uniqueAssetId(s.music ?? [], file)
        return { ...s, music: [...(s.music ?? []), { id, label: prettyLabel(file), file }] }
      }
      if (kind === 'ambience') {
        if ((s.ambience ?? []).some((a) => a.file === file)) return s
        return { ...s, ambience: [...(s.ambience ?? []), { file }] }
      }
      if ((s.sfx ?? []).some((x) => x.file === file)) return s
      const id = uniqueAssetId(s.sfx ?? [], file)
      return { ...s, sfx: [...(s.sfx ?? []), { id, label: prettyLabel(file), file }] }
    })
    get().pushToast(`Added ${prettyLabel(file)} to ${scene.name}`, 'info')
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
    const failures = await engine.probe([...files])
    if (failures.length === 0) {
      get().pushToast(`All ${files.size} assets OK`, 'info')
    } else {
      get().pushToast(`${failures.length} missing: ${failures.slice(0, 3).join(', ')}${failures.length > 3 ? '…' : ''}`, 'error')
    }
  },

  setCampaign: (c) => {
    set({ campaign: c })
    // Keep a valid selection; default to first scene if none selected.
    const { currentSceneId } = get()
    const stillExists = c.scenes.some((s) => s.id === currentSceneId)
    if (!stillExists) {
      set({ currentSceneId: c.scenes[0]?.id ?? null })
    }
  },

  selectScene: async (id) => {
    const scene = get().campaign.scenes.find((s) => s.id === id)
    if (!scene) return
    set({ currentSceneId: id })
    engine.prewarm(scene)
    if (scene.playlist?.enabled && (scene.music?.length ?? 0) > 0) {
      // Playlist mode: the store drives music; the engine only handles ambience.
      await engine.setAmbience(scene.ambience ?? [], scene.transition?.crossfadeMs)
      get().startPlaylist()
    } else {
      await engine.loadScene(scene)
    }
  },

  fireCue: (node) => {
    if (node.kind === 'music') get().switchMusic(node.ref)
    else if (node.kind === 'sfx') get().playSfx(node.ref)
    else if (node.kind === 'image') get().showImage(node.ref)
  },

  switchMusic: (trackId) => {
    const scene = currentScene(get())
    const track = scene?.music?.find((m) => m.id === trackId)
    if (!track || !scene) return
    if (scene.playlist?.enabled) {
      // In playlist mode a palette/cue tap jumps the queue to that track.
      const pos = get().playlistOrder.indexOf(trackId)
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

  toggleAmbience: (file) => {
    const layer = currentScene(get())?.ambience?.find((a) => a.file === file)
    if (!layer) return
    if (get().status.ambienceFiles.includes(file)) engine.stopAmbienceLayer(file)
    else engine.startAmbienceLayer(layer)
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

  stopAll: () => engine.stopAll(),

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
      console.error('saveScene failed', err)
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

  revealCampaign: () => window.hearth.revealCampaign(),
  openPresenter: () => window.hearth.openPresenter()
}))
