import { create } from 'zustand'
import { DEFAULT_CROSSFADE_MS, type CampaignState, type Scene, type ScriptNode } from '../shared/types'
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

interface AppState {
  campaign: CampaignState
  currentSceneId: string | null
  status: EngineStatus
  presenting: PresentingImage | null
  toasts: Toast[]
  libraryOpen: boolean
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
  openLibrary: () => void
  closeLibrary: () => void
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

  fireCue: (node: Extract<ScriptNode, { type: 'cue' }>) => void
  switchMusic: (trackId: string) => void
  playSfx: (sfxId: string) => void
  showImage: (file: string, caption?: string) => void
  clearImage: () => void
  stopAll: () => void

  updateScene: (sceneId: string, mutate: (s: Scene) => Scene) => Promise<void>

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

  openLibrary: () => set({ libraryOpen: true }),
  closeLibrary: () => {
    currentPreviewStop?.()
    currentPreviewStop = null
    set({ libraryOpen: false, previewingFile: null })
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
