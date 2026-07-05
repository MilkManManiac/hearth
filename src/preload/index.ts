import { contextBridge, ipcRenderer } from 'electron'
import type { AssetKind, CampaignState } from '../shared/types'

export interface PresenterPayload {
  file: string | null
  caption?: string
}

const api = {
  getCampaign: (): Promise<CampaignState> => ipcRenderer.invoke('campaign:get'),
  reloadCampaign: (): Promise<CampaignState> => ipcRenderer.invoke('campaign:reload'),
  chooseCampaign: (): Promise<CampaignState> => ipcRenderer.invoke('campaign:choose'),
  importAssets: (kind: AssetKind): Promise<CampaignState> => ipcRenderer.invoke('campaign:import', kind),
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
