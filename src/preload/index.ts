import { contextBridge, ipcRenderer } from 'electron'
import type { AssetKind, CampaignState, LibraryAsset, Scene } from '../shared/types'

/** Editable slice of a library entry (file/kind stay fixed). */
export type LibraryAssetPatch = Partial<Pick<LibraryAsset, 'name' | 'category' | 'tags' | 'trash'>>

export interface PresenterPayload {
  file: string | null
  caption?: string
}

/** Result of creating/duplicating a scene: fresh state + the new scene's id. */
export interface SceneWriteResult {
  state: CampaignState
  sceneId: string
}

/** Result of importing images into a scene: fresh state + how many were added. */
export interface ImportImagesResult {
  state: CampaignState
  added: number
}

/** One audio candidate found in a triage drop folder. */
export interface TriageFile {
  /** Path relative to the drop folder, '/'-separated. */
  rel: string
  /** File size in bytes. */
  size: number
}

/** A picked + scanned triage drop folder. Audition via `asset:///.triage/<token>/<rel>`. */
export interface TriageScan {
  root: string
  token: string
  files: TriageFile[]
}

/** A kept candidate: copy into the campaign's <kind>/ folder and index in library.json. */
export interface TriageKeepRequest {
  rel: string
  kind: AssetKind
  /** Becomes the destination filename (slugified); falls back to the source name. */
  name: string
  category?: string
  tags: string[]
  source?: string
  license?: string
}

const api = {
  getCampaign: (): Promise<CampaignState> => ipcRenderer.invoke('campaign:get'),
  chooseCampaign: (): Promise<CampaignState> => ipcRenderer.invoke('campaign:choose'),
  importAssets: (kind: AssetKind): Promise<CampaignState> => ipcRenderer.invoke('campaign:import', kind),
  saveScene: (scene: Scene): Promise<CampaignState> => ipcRenderer.invoke('scene:save', scene),
  importSceneImages: (sceneId: string): Promise<ImportImagesResult | null> =>
    ipcRenderer.invoke('scene:import-images', sceneId),
  duplicateScene: (sceneId: string): Promise<SceneWriteResult> =>
    ipcRenderer.invoke('scene:duplicate', sceneId),
  createScene: (templateId: string): Promise<SceneWriteResult> =>
    ipcRenderer.invoke('scene:create', templateId),
  deleteScene: (sceneId: string): Promise<CampaignState> =>
    ipcRenderer.invoke('scene:delete', sceneId),
  updateLibraryAsset: (file: string, patch: LibraryAssetPatch): Promise<CampaignState> =>
    ipcRenderer.invoke('library:update', file, patch),
  deleteLibraryAsset: (file: string): Promise<CampaignState> =>
    ipcRenderer.invoke('library:delete', file),
  pickTriageFolder: (): Promise<TriageScan | null> => ipcRenderer.invoke('triage:pick'),
  triageKeep: (req: TriageKeepRequest): Promise<CampaignState> =>
    ipcRenderer.invoke('triage:keep', req),
  revealCampaign: (): Promise<void> => ipcRenderer.invoke('campaign:reveal'),
  openPresenter: (): Promise<void> => ipcRenderer.invoke('presenter:open'),
  presenterShow: (payload: PresenterPayload): Promise<void> => ipcRenderer.invoke('presenter:show', payload),

  onCampaignChanged: (cb: (state: CampaignState) => void): (() => void) => {
    const listener = (_e: unknown, state: CampaignState) => cb(state)
    ipcRenderer.on('campaign:changed', listener)
    return () => ipcRenderer.removeListener('campaign:changed', listener)
  },
  onPresenterShow: (cb: (payload: PresenterPayload) => void): (() => void) => {
    const listener = (_e: unknown, payload: PresenterPayload) => cb(payload)
    ipcRenderer.on('presenter:show', listener)
    return () => ipcRenderer.removeListener('presenter:show', listener)
  }
}

export type HearthApi = typeof api

contextBridge.exposeInMainWorld('hearth', api)
