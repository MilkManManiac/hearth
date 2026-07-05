import { create } from 'zustand'
import type { CampaignState, Scene, ScriptNode } from '../shared/types'
import { AudioEngine, type EngineStatus } from './audio/AudioEngine'

/** One audio engine per session, shared across the UI. */
export const engine = new AudioEngine()

const EMPTY_CAMPAIGN: CampaignState = { path: null, scenes: [], library: { assets: [] }, errors: [] }

interface PresentingImage {
  file: string
  caption?: string
}

interface AppState {
  campaign: CampaignState
  currentSceneId: string | null
  status: EngineStatus
  presenting: PresentingImage | null

  bootstrap: () => Promise<void>
  setCampaign: (c: CampaignState) => void
  selectScene: (id: string) => Promise<void>

  fireCue: (node: Extract<ScriptNode, { type: 'cue' }>) => void
  switchMusic: (trackId: string) => void
  playSfx: (sfxId: string) => void
  showImage: (file: string, caption?: string) => void
  clearImage: () => void
  stopAll: () => void

  chooseCampaign: () => Promise<void>
  importAssets: (kind: 'music' | 'ambience' | 'sfx') => Promise<void>
  revealCampaign: () => void
  openPresenter: () => void
}

function currentScene(state: AppState): Scene | null {
  return state.campaign.scenes.find((s) => s.id === state.currentSceneId) ?? null
}

export const useStore = create<AppState>((set, get) => ({
  campaign: EMPTY_CAMPAIGN,
  currentSceneId: null,
  status: engine.status(),
  presenting: null,

  bootstrap: async () => {
    engine.subscribe((status) => set({ status }))
    window.hearth.onCampaignChanged((c) => get().setCampaign(c))
    const campaign = await window.hearth.getCampaign()
    get().setCampaign(campaign)
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
    await engine.loadScene(scene)
  },

  fireCue: (node) => {
    if (node.kind === 'music') get().switchMusic(node.ref)
    else if (node.kind === 'sfx') get().playSfx(node.ref)
    else if (node.kind === 'image') get().showImage(node.ref)
  },

  switchMusic: (trackId) => {
    const scene = currentScene(get())
    const track = scene?.music?.find((m) => m.id === trackId)
    if (track) engine.switchMusic(track, scene?.transition?.crossfadeMs)
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
