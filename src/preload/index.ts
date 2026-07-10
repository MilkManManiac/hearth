import { contextBridge, ipcRenderer } from 'electron'
import type {
  AssetKind,
  CampaignNote,
  CampaignState,
  Character,
  LibraryAsset,
  NoteKind,
  PlaylistPreset,
  RollEvent,
  Scene
} from '../shared/types'
import type { DiscordChannelInfo, DiscordGuildInfo, DiscordStatus } from '../main/discord'

export type { DiscordChannelInfo, DiscordGuildInfo, DiscordStatus }

/** Editable slice of a library entry (file/kind stay fixed). */
export type LibraryAssetPatch = Partial<
  Pick<LibraryAsset, 'name' | 'category' | 'tags' | 'trash' | 'description'>
>

export interface PresenterPayload {
  file: string | null
  caption?: string
  /** Fog-of-war map mode: `file` is the map image; strokes are the COMMITTED reveals. */
  map?: {
    strokes: import('../shared/types').FogStroke[]
    tokens?: import('../shared/types').MapToken[]
    grid?: number
    /** Baked at send: HP rings (PCs) + condition tags per token id. */
    decor?: Record<string, import('../shared/types').TokenDecor>
    /** Initiative strip: names in order + whose turn (-1 = not started). */
    initiative?: { names: string[]; turn: number }
  }
}

/** Result of creating/duplicating a scene: fresh state + the new scene's id. */
export interface SceneWriteResult {
  state: CampaignState
  sceneId: string
}

/** Result of creating a note: fresh state + the new note's id. */
export interface NoteWriteResult {
  state: CampaignState
  noteId: string
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
  saveNote: (note: CampaignNote): Promise<CampaignState> => ipcRenderer.invoke('note:save', note),
  createNote: (kind: NoteKind, title: string): Promise<NoteWriteResult> =>
    ipcRenderer.invoke('note:create', kind, title),
  deleteNote: (noteId: string): Promise<CampaignState> => ipcRenderer.invoke('note:delete', noteId),
  saveCharacter: (c: Character): Promise<CampaignState> => ipcRenderer.invoke('character:save', c),
  createCharacter: (name: string): Promise<{ state: CampaignState; characterId: string }> =>
    ipcRenderer.invoke('character:create', name),
  deleteCharacter: (characterId: string): Promise<CampaignState> =>
    ipcRenderer.invoke('character:delete', characterId),
  updateLibraryAsset: (file: string, patch: LibraryAssetPatch): Promise<CampaignState> =>
    ipcRenderer.invoke('library:update', file, patch),
  deleteLibraryAsset: (file: string): Promise<CampaignState> =>
    ipcRenderer.invoke('library:delete', file),
  savePlaylistPresets: (presets: PlaylistPreset[]): Promise<CampaignState> =>
    ipcRenderer.invoke('library:save-playlists', presets),
  purgeTrash: (): Promise<{ state: CampaignState; purged: number; skipped: string[] }> =>
    ipcRenderer.invoke('library:purge-trash'),
  pickTriageFolder: (): Promise<TriageScan | null> => ipcRenderer.invoke('triage:pick'),
  triageKeep: (req: TriageKeepRequest): Promise<CampaignState> =>
    ipcRenderer.invoke('triage:keep', req),
  /** Existence sweep for referenced assets — returns the missing files. */
  probeFiles: (files: string[]): Promise<string[]> => ipcRenderer.invoke('campaign:probe', files),
  /** Player portal (C5): players open their character in a browser. */
  portalStatus: (): Promise<{ running: boolean; url: string }> => ipcRenderer.invoke('portal:status'),
  portalToggle: (): Promise<{ running: boolean; url: string }> => ipcRenderer.invoke('portal:toggle'),
  /** Game Log (D1): send a roll to the campaign hub / read the session log. */
  sendRoll: (roll: RollEvent): Promise<void> => ipcRenderer.invoke('roll:send', roll),
  getRollLog: (): Promise<RollEvent[]> => ipcRenderer.invoke('roll:log'),
  onRoll: (cb: (roll: RollEvent) => void): (() => void) => {
    const listener = (_e: unknown, roll: RollEvent) => cb(roll)
    ipcRenderer.on('roll:new', listener)
    return () => ipcRenderer.removeListener('roll:new', listener)
  },
  /** Text channels for the Game Log → Discord feed. */
  discordTextChannels: (guildId: string): Promise<DiscordChannelInfo[]> =>
    ipcRenderer.invoke('discord:text-channels', guildId),
  discordRollChannel: (): Promise<string | undefined> => ipcRenderer.invoke('discord:roll-channel'),
  discordSetRollChannel: (channelId: string | undefined): Promise<void> =>
    ipcRenderer.invoke('discord:set-roll-channel', channelId),
  revealCampaign: (): Promise<void> => ipcRenderer.invoke('campaign:reveal'),
  openPresenter: (): Promise<void> => ipcRenderer.invoke('presenter:open'),
  presenterShow: (payload: PresenterPayload): Promise<void> => ipcRenderer.invoke('presenter:show', payload),
  /** Ephemeral map ping (D4) — never re-commits fog, just a pulse on the presenter. */
  presenterPing: (p: { x: number; y: number }): Promise<void> => ipcRenderer.invoke('presenter:ping', p),
  onPresenterPing: (cb: (p: { x: number; y: number; id: string }) => void): (() => void) => {
    const listener = (_e: unknown, p: { x: number; y: number; id: string }) => cb(p)
    ipcRenderer.on('presenter:ping', listener)
    return () => ipcRenderer.removeListener('presenter:ping', listener)
  },

  // --- Discord voice bridge (experimental) ---
  discordStatus: (): Promise<DiscordStatus> => ipcRenderer.invoke('discord:status'),
  discordSetToken: (token: string): Promise<void> => ipcRenderer.invoke('discord:set-token', token),
  discordConnect: (): Promise<void> => ipcRenderer.invoke('discord:connect'),
  discordDisconnect: (): Promise<void> => ipcRenderer.invoke('discord:disconnect'),
  discordGuilds: (): Promise<DiscordGuildInfo[]> => ipcRenderer.invoke('discord:guilds'),
  discordChannels: (guildId: string): Promise<DiscordChannelInfo[]> =>
    ipcRenderer.invoke('discord:channels', guildId),
  discordJoin: (guildId: string, channelId: string): Promise<void> =>
    ipcRenderer.invoke('discord:join', guildId, channelId),
  discordLeave: (): Promise<void> => ipcRenderer.invoke('discord:leave'),
  /** The Chronicler: start/stop per-speaker recording of the joined channel. */
  chronicleStart: (): Promise<void> => ipcRenderer.invoke('chronicle:start'),
  chronicleStop: (): Promise<void> => ipcRenderer.invoke('chronicle:stop'),
  /** High-rate raw PCM (s16le 48kHz stereo interleaved) — fire-and-forget. */
  discordSendPcm: (chunk: ArrayBuffer): void => ipcRenderer.send('discord:pcm', chunk),
  onDiscordStatus: (cb: (status: DiscordStatus) => void): (() => void) => {
    const listener = (_e: unknown, status: DiscordStatus) => cb(status)
    ipcRenderer.on('discord:status-changed', listener)
    return () => ipcRenderer.removeListener('discord:status-changed', listener)
  },

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
