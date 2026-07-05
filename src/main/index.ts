import { app, BrowserWindow, protocol, ipcMain, shell } from 'electron'
import * as path from 'path'
import { readFile } from 'fs/promises'
import { CampaignManager } from './campaign'
import type { AssetKind, Scene } from '../shared/types'

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
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
  }
])

let mainWindow: BrowserWindow | null = null
let presenterWindow: BrowserWindow | null = null
let campaign: CampaignManager

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
  protocol.handle('asset', async (request) => {
    const rel = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '')
    const root = path.resolve(campaign.path)
    const resolved = path.resolve(root, rel)
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      return new Response('Forbidden', { status: 403 })
    }
    try {
      const data = await readFile(resolved)
      const type = MIME[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream'
      return new Response(new Uint8Array(data), { headers: { 'Content-Type': type } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function registerIpc(): void {
  ipcMain.handle('campaign:get', async () => campaign.load())
  ipcMain.handle('campaign:reload', async () => campaign.load())
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
  ipcMain.handle('campaign:reveal', async () => {
    shell.openPath(campaign.path)
  })
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
  const initial = await campaign.init()
  console.log(
    `[hearth] campaign: ${campaign.path}\n[hearth] scenes: ${initial.scenes.length}, ` +
      `library assets: ${initial.library.assets.length}, errors: ${initial.errors.length}`
  )

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  campaign?.dispose()
  if (process.platform !== 'darwin') app.quit()
})
