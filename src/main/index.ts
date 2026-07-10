import { app, BrowserWindow, protocol, ipcMain, shell } from 'electron'
import * as path from 'path'
import { readFile } from 'fs/promises'
import { CampaignManager } from './campaign'
import { DiscordBridge } from './discord'
import { PlayerPortal } from './playerServer'
import type {
  AssetKind,
  CampaignNote,
  Character,
  LibraryAsset,
  NoteKind,
  PlaylistPreset,
  Scene
} from '../shared/types'
import type { TriageKeepRequest } from '../preload/index'

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.webm': 'audio/webm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
}

// The renderer loads campaign audio/images through this scheme, e.g.
// asset:///music/combat-drums.mp3 -> <campaign>/music/combat-drums.mp3
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'asset',
    // corsEnabled is required so the renderer (served from http://localhost in
    // dev, file:// in prod) can `fetch()` asset:// cross-origin; without it,
    // and without the ACAO header the handler returns, every load fails with
    // "TypeError: Failed to fetch".
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true
    }
  }
])

// We are the browser here — a mixing console, not a web page. Chromium's
// autoplay gesture gate can otherwise leave the AudioContext suspended on the
// very first cue click (the async resume() chain loses the gesture). Removing
// the requirement makes first-click audio deterministic; resume() stays as a
// belt-and-braces fallback.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

let mainWindow: BrowserWindow | null = null
let presenterWindow: BrowserWindow | null = null
let campaign: CampaignManager
let discord: DiscordBridge
let portal: PlayerPortal

const isDev = !!process.env['ELECTRON_RENDERER_URL']
const preloadPath = path.join(__dirname, '../preload/index.js')
const rendererHtml = path.join(__dirname, '../renderer/index.html')

function loadRenderer(win: BrowserWindow, hash?: string): void {
  if (isDev) {
    const url = process.env['ELECTRON_RENDERER_URL']!
    win.loadURL(hash ? `${url}#${hash}` : url)
  } else {
    win.loadFile(rendererHtml, hash ? { hash } : undefined)
  }
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
  // Connected player-portal browsers refetch on any campaign change.
  if (channel === 'campaign:changed') portal?.notifyChange()
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#14110f',
    title: 'Hearth',
    webPreferences: { preload: preloadPath, sandbox: false }
  })
  loadRenderer(mainWindow)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function ensurePresenterWindow(): BrowserWindow {
  if (presenterWindow && !presenterWindow.isDestroyed()) {
    presenterWindow.focus()
    return presenterWindow
  }
  presenterWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#000000',
    title: 'Hearth — Presenter',
    autoHideMenuBar: true,
    webPreferences: { preload: preloadPath, sandbox: false }
  })
  loadRenderer(presenterWindow, 'presenter')
  presenterWindow.on('closed', () => {
    presenterWindow = null
  })
  return presenterWindow
}

function registerAssetProtocol(): void {
  // Allow the renderer to fetch these cross-origin (dev http://localhost, prod file://).
  const CORS = { 'Access-Control-Allow-Origin': '*' }
  protocol.handle('asset', async (request) => {
    // `asset` is a *standard* scheme, so Chromium parses the first path segment
    // as the URL host — `new URL(url).pathname` would drop it (asset://art/x.svg
    // -> "/x.svg", losing "art/"). Strip the scheme off the raw URL instead so
    // host+path survive; this also tolerates both asset:// and asset:/// forms.
    const rel = decodeURIComponent(request.url.replace(/^asset:\/\//, '').split(/[?#]/)[0]).replace(
      /^\/+/,
      ''
    )
    // Triage auditions live *outside* the campaign: `.triage/<token>/<rel>` is
    // served (read-only) from the current triage drop folder; the token must
    // match the live session so stale URLs die instead of hitting old paths.
    const triageMatch = rel.match(/^\.triage\/([^/]+)\/(.+)$/)
    let root: string
    let sub: string
    if (triageMatch) {
      const t = campaign.triage
      if (!t || triageMatch[1] !== t.token) {
        return new Response('No triage session', { status: 404, headers: CORS })
      }
      root = path.resolve(t.root)
      sub = triageMatch[2]
    } else {
      root = path.resolve(campaign.path)
      sub = rel
    }
    const resolved = path.resolve(root, sub)
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      return new Response('Forbidden', { status: 403, headers: CORS })
    }
    try {
      const data = await readFile(resolved)
      const type = MIME[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream'
      return new Response(new Uint8Array(data), { headers: { 'Content-Type': type, ...CORS } })
    } catch (err) {
      console.error(`[audio] 404 url=${request.url} root=${root} resolved=${resolved} err=${(err as Error).message}`)
      return new Response('Not found', { status: 404, headers: CORS })
    }
  })
}

function registerIpc(): void {
  ipcMain.handle('campaign:get', async () => campaign.load())
  ipcMain.handle('campaign:choose', async () => {
    const state = await campaign.choose()
    if (state) broadcast('campaign:changed', state)
    return state ?? campaign.load()
  })
  ipcMain.handle('campaign:import', async (_e, kind: AssetKind) => {
    const state = await campaign.importAssets(kind)
    broadcast('campaign:changed', state)
    return state
  })
  ipcMain.handle('scene:save', async (_e, scene: Scene) => {
    const state = await campaign.saveScene(scene)
    broadcast('campaign:changed', state)
    return state
  })
  ipcMain.handle('scene:import-images', async (_e, sceneId: string) => {
    const result = await campaign.importSceneImages(sceneId)
    if (result) broadcast('campaign:changed', result.state)
    return result
  })
  ipcMain.handle('scene:duplicate', async (_e, sceneId: string) => {
    const result = await campaign.duplicateScene(sceneId)
    broadcast('campaign:changed', result.state)
    return result
  })
  ipcMain.handle('scene:create', async (_e, templateId: string) => {
    const result = await campaign.createScene(templateId)
    broadcast('campaign:changed', result.state)
    return result
  })
  ipcMain.handle('scene:delete', async (_e, sceneId: string) => {
    const state = await campaign.deleteScene(sceneId)
    broadcast('campaign:changed', state)
    return state
  })
  ipcMain.handle('note:save', async (_e, note: CampaignNote) => {
    const state = await campaign.saveNote(note)
    broadcast('campaign:changed', state)
    return state
  })
  ipcMain.handle('note:create', async (_e, kind: NoteKind, title: string) => {
    const result = await campaign.createNote(kind, title)
    broadcast('campaign:changed', result.state)
    return result
  })
  ipcMain.handle('note:delete', async (_e, noteId: string) => {
    const state = await campaign.deleteNote(noteId)
    broadcast('campaign:changed', state)
    return state
  })
  ipcMain.handle('character:save', async (_e, c: Character) => {
    const state = await campaign.saveCharacter(c)
    broadcast('campaign:changed', state)
    return state
  })
  ipcMain.handle('character:create', async (_e, name: string) => {
    const result = await campaign.createCharacter(name)
    broadcast('campaign:changed', result.state)
    return result
  })
  ipcMain.handle('character:delete', async (_e, characterId: string) => {
    const state = await campaign.deleteCharacter(characterId)
    broadcast('campaign:changed', state)
    return state
  })
  ipcMain.handle('portal:status', () => portal.status())
  ipcMain.handle('portal:toggle', async () => {
    const status = portal.status().running ? await portal.stop() : await portal.start()
    // Player saves come back through the campaign manager → rebroadcast so the
    // DM's windows see them; the watcher also covers this, belt-and-braces.
    return status
  })
  ipcMain.handle('library:update', async (_e, file: string, patch: Partial<LibraryAsset>) => {
    const state = await campaign.updateLibraryAsset(file, patch)
    broadcast('campaign:changed', state)
    return state
  })
  ipcMain.handle('library:delete', async (_e, file: string) => {
    const state = await campaign.deleteLibraryAsset(file)
    broadcast('campaign:changed', state)
    return state
  })
  ipcMain.handle('library:save-playlists', async (_e, presets: PlaylistPreset[]) => {
    const state = await campaign.savePlaylistPresets(presets)
    broadcast('campaign:changed', state)
    return state
  })
  ipcMain.handle('library:purge-trash', async () => {
    const result = await campaign.purgeTrash()
    broadcast('campaign:changed', result.state)
    return result
  })
  ipcMain.handle('triage:pick', async () => campaign.triagePick())
  ipcMain.handle('triage:keep', async (_e, req: TriageKeepRequest) => {
    const state = await campaign.triageKeep(req)
    broadcast('campaign:changed', state)
    return state
  })
  ipcMain.handle('campaign:probe', async (_e, files: string[]) => campaign.probeFiles(files))
  ipcMain.handle('campaign:reveal', async () => {
    // openPath resolves to a non-empty string on failure (not a rejection).
    const err = await shell.openPath(campaign.path)
    if (err) throw new Error(err)
  })
  // --- Discord voice bridge (experimental — see DISCORD-BRIDGE.md) ---
  ipcMain.handle('discord:status', () => discord.getStatus())
  ipcMain.handle('discord:set-token', (_e, token: string) => discord.setToken(token))
  ipcMain.handle('discord:connect', () => discord.connect())
  ipcMain.handle('discord:disconnect', () => discord.disconnect())
  ipcMain.handle('discord:guilds', () => discord.listGuilds())
  ipcMain.handle('discord:channels', (_e, guildId: string) => discord.listChannels(guildId))
  ipcMain.handle('discord:join', (_e, guildId: string, channelId: string) =>
    discord.join(guildId, channelId)
  )
  ipcMain.handle('discord:leave', () => discord.leave())
  // The Chronicler: per-speaker session recording into <campaign>/recordings/.
  ipcMain.handle('chronicle:start', () => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')
    return discord.startChronicle(path.join(campaign.path, 'recordings', `session-${stamp}`))
  })
  ipcMain.handle('chronicle:stop', () => discord.stopChronicle())
  // High-rate PCM sink — fire-and-forget send, not invoke.
  ipcMain.on('discord:pcm', (_e, chunk: ArrayBuffer) => discord.pushPcm(chunk))

  ipcMain.handle('presenter:open', async () => {
    ensurePresenterWindow()
  })
  ipcMain.handle('presenter:show', async (_e, payload) => {
    ensurePresenterWindow()
    // Deliver after the window is ready to receive.
    const target = presenterWindow!
    if (target.webContents.isLoading()) {
      target.webContents.once('did-finish-load', () => target.webContents.send('presenter:show', payload))
    } else {
      target.webContents.send('presenter:show', payload)
    }
  })
}

app.whenReady().then(async () => {
  registerAssetProtocol()
  registerIpc()

  campaign = new CampaignManager((state) => broadcast('campaign:changed', state))
  discord = new DiscordBridge((status) => broadcast('discord:status-changed', status))
  portal = new PlayerPortal({
    getCharacters: async () => (await campaign.load()).characters,
    // Player saves broadcast immediately so the DM's windows update live
    // (the folder watcher would also catch it, just ~1.5s later).
    saveCharacter: async (c) => {
      const state = await campaign.saveCharacter(c)
      broadcast('campaign:changed', state)
      return state
    },
    rendererDir: path.join(__dirname, '../renderer')
  })
  const initial = await campaign.init()
  console.log(
    `[hearth] campaign: ${campaign.path}\n[hearth] scenes: ${initial.scenes.length}, ` +
      `library assets: ${initial.library.assets.length}, errors: ${initial.errors.length}`
  )
  // Headless/testing hook: auto-start the player portal.
  if (process.env.HEARTH_PORTAL === '1') {
    const s = await portal.start()
    console.log(`[hearth] player portal: ${s.url}`)
  }

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  campaign?.dispose()
  if (process.platform !== 'darwin') app.quit()
})
