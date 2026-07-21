import { app, BrowserWindow, protocol, ipcMain, shell } from 'electron'
import * as path from 'path'
import { readFile } from 'fs/promises'
import { CampaignManager } from './campaign'
import { DiscordBridge } from './discord'
import { PlayerPortal } from './playerServer'
import { WindowManager, type WindowRole } from './windows'
import type {
  AssetKind,
  CampaignMap,
  CampaignNote,
  Character,
  LibraryAsset,
  NoteKind,
  PartyStash,
  PlaylistPreset,
  RollEvent,
  Scene
} from '../shared/types'
import type { CoinKey } from '../shared/inventory'
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

// The voice bridge ships 20ms PCM chunks through the main window's renderer.
// backgroundThrottling:false (set per-window) stops TIMER throttling, but
// Chromium separately LOWERS THE WHOLE RENDERER PROCESS PRIORITY when a window
// is backgrounded — and on Windows, native occlusion detection treats a window
// that's merely covered by other windows (not minimized) as hidden. Either one
// starves the IPC pump and the Discord feed arrives in bursts (audible stutter
// whenever Hearth isn't the front window). Kill all of it at the process level.
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

let mainWindow: BrowserWindow | null = null
let presenterWindow: BrowserWindow | null = null
let windowManager: WindowManager
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

// --- Game Log hub (DDB-MECHANICS D1) ---------------------------------------
// Every roll from any surface lands here, then fans out: DM windows (all
// rolls), portal SSE (public rolls only), Discord (optional, later layer).
const ROLL_LOG_MAX = 300
const rollLog: RollEvent[] = []

function handleRoll(roll: RollEvent): void {
  rollLog.push(roll)
  if (rollLog.length > ROLL_LOG_MAX) rollLog.splice(0, rollLog.length - ROLL_LOG_MAX)
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('roll:new', roll)
  }
  if (!roll.dmOnly) portal?.pushRoll(roll)
  discord?.postRoll(roll)
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#14110f',
    title: 'Hearth',
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      // The audio engine + Discord tap run in this renderer. Minimizing the
      // window must not throttle the thread relaying PCM to the voice bridge
      // (throttled = bursty chunks = audible stutter in the Discord channel).
      backgroundThrottling: false
    }
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
  // --- Party stash (M4) ---
  ipcMain.handle('party:save', async (_e, p: PartyStash) => {
    const state = await campaign.saveParty(p)
    broadcast('campaign:changed', state)
    return state
  })
  ipcMain.handle(
    'party:transfer-item',
    async (_e, req: { itemId: string; from: string; to: string; qty?: number; who: string }) => {
      const state = await campaign.transferItem(req)
      broadcast('campaign:changed', state)
      return state
    }
  )
  ipcMain.handle(
    'party:transfer-coins',
    async (_e, req: { from: string; to: string; coin: CoinKey; amount: number; who: string }) => {
      const state = await campaign.transferCoins(req)
      broadcast('campaign:changed', state)
      return state
    }
  )
  // --- Battle maps (SURFACES-PLAN M1) ---
  ipcMain.handle('map:save', async (_e, m: CampaignMap) => {
    const state = await campaign.saveMap(m)
    broadcast('campaign:changed', state)
    return state
  })
  ipcMain.handle('map:create', async (_e, name: string, image: string) => {
    const result = await campaign.createMap(name, image)
    broadcast('campaign:changed', result.state)
    return result
  })
  ipcMain.handle('map:delete', async (_e, mapId: string) => {
    const state = await campaign.deleteMap(mapId)
    broadcast('campaign:changed', state)
    return state
  })
  ipcMain.handle('map:go-live', async (_e, mapId: string | null) => {
    const state = await campaign.setLiveMap(mapId)
    broadcast('campaign:changed', state)
    return state
  })
  // --- Game Log (D1) ---
  ipcMain.handle('roll:send', (_e, roll: RollEvent) => handleRoll(roll))
  ipcMain.handle('roll:log', () => rollLog)

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
  ipcMain.handle('discord:text-channels', (_e, guildId: string) => discord.listTextChannels(guildId))
  ipcMain.handle('discord:roll-channel', () => discord.getRollChannel())
  ipcMain.handle('discord:set-roll-channel', (_e, channelId: string | undefined) =>
    discord.setRollChannel(channelId)
  )
  // The Chronicler: per-speaker session recording into <campaign>/recordings/.
  ipcMain.handle('chronicle:start', () => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')
    return discord.startChronicle(path.join(campaign.path, 'recordings', `session-${stamp}`))
  })
  ipcMain.handle('chronicle:stop', () => discord.stopChronicle())
  // High-rate PCM sink — fire-and-forget send, not invoke.
  ipcMain.on('discord:pcm', (_e, chunk: ArrayBuffer) => discord.pushPcm(chunk))

  // --- M3 window split: Table + Party as real windows ---
  ipcMain.handle('window:open', async (_e, role: WindowRole, opts?: { mapId?: string }) => {
    const win = windowManager.open(role)
    // "Edit this map" from the console lands on the right map in the Table
    // window — delivered after load so a fresh window doesn't miss it.
    if (role === 'table' && opts?.mapId) {
      const send = () => win.webContents.send('table:select-map', opts.mapId)
      if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
      else send()
    }
  })

  ipcMain.handle('presenter:open', async () => {
    ensurePresenterWindow()
  })
  ipcMain.handle('presenter:ping', async (_e, p: { x: number; y: number }) => {
    const ping = { ...p, id: `${Date.now()}-${Math.random()}` }
    // Only if the presenter is already open — a ping never spawns the window.
    if (presenterWindow && !presenterWindow.isDestroyed()) {
      presenterWindow.webContents.send('presenter:ping', ping)
    }
    // Ember E2: the live map streams everything — DM pings pulse on player
    // phones too (portal browsers follow the live map by definition).
    portal?.pushPing(ping)
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

  windowManager = new WindowManager(preloadPath, loadRenderer)
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
    rendererDir: path.join(__dirname, '../renderer'),
    campaignDir: () => campaign.path,
    // Portal rolls join the same hub as DM rolls (never DM-only from players).
    onRoll: (roll) => handleRoll({ ...roll, dmOnly: false }),
    getRolls: () => rollLog.filter((r) => !r.dmOnly),
    createCharacter: async (name) => {
      const result = await campaign.createCharacter(name)
      broadcast('campaign:changed', result.state)
      return { characterId: result.characterId }
    },
    getLiveMap: async () => {
      const s = await campaign.load()
      return s.maps.find((m) => m.id === s.liveMapId) ?? null
    },
    // Party stash (M4): players view + transfer; edits broadcast like saves.
    getParty: () => campaign.loadParty(),
    transferItem: async (req) => {
      const state = await campaign.transferItem(req)
      broadcast('campaign:changed', state)
    },
    transferCoins: async (req) => {
      const state = await campaign.transferCoins(req)
      broadcast('campaign:changed', state)
    },
    // Ember E2: move-own-token on the LIVE map only. The characterId check is
    // the whole security model — a token without a matching characterId
    // (monsters, other PCs, unlinked markers) can never be moved from Ember.
    moveToken: async ({ tokenId, characterId, x, y }) => {
      const s = await campaign.load()
      const map = s.maps.find((m) => m.id === s.liveMapId)
      if (!map) return { ok: false, error: 'no live map' }
      const tk = (map.tokens ?? []).find((t) => t.id === tokenId)
      if (!tk) return { ok: false, error: 'no such token' }
      if (!tk.characterId || tk.characterId !== characterId) return { ok: false, error: 'not your token' }
      const next = { ...map, tokens: (map.tokens ?? []).map((t) => (t.id === tokenId ? { ...t, x, y } : t)) }
      const state = await campaign.saveMap(next)
      broadcast('campaign:changed', state)
      return { ok: true }
    },
    // Ember E2: player ping → every surface at the table (other browsers via
    // SSE, the presenter window, any open DM map editor). Ephemeral.
    playerPing: (p) => {
      portal.pushPing(p)
      if (presenterWindow && !presenterWindow.isDestroyed()) {
        presenterWindow.webContents.send('presenter:ping', p)
      }
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('table:ping', p)
      }
    }
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

  // Smoke-test hook (M3): HEARTH_SMOKE=windows opens the ⚔ Table and 🛡 Party
  // windows, screenshots every window into HEARTH_SMOKE_DIR (or cwd), and
  // quits — the agent-verifiable version of "do the new windows render".
  if (process.env.HEARTH_SMOKE === 'windows') {
    const outDir = process.env.HEARTH_SMOKE_DIR || process.cwd()
    const log: string[] = []
    setTimeout(() => {
      try {
        windowManager.open('table')
        windowManager.open('party')
        log.push('open(table)/open(party) ok')
      } catch (err) {
        log.push(`open failed: ${(err as Error).stack}`)
      }
    }, 1500)
    setTimeout(async () => {
      const { writeFile } = await import('fs/promises')
      for (const win of BrowserWindow.getAllWindows()) {
        const title = win.getTitle()
        log.push(`window "${title}" url=${win.webContents.getURL()} crashed=${win.webContents.isCrashed()}`)
        // Focus first — capturing an occluded window throws viz errors, and
        // the compositor needs a beat after focus. Retry a few times.
        let captured = false
        for (let attempt = 0; attempt < 4 && !captured; attempt++) {
          try {
            win.focus()
            await new Promise((r) => setTimeout(r, 900))
            const img = await win.webContents.capturePage()
            const name = `smoke-${title.replace(/[^\w]+/g, '-').toLowerCase()}.png`
            await writeFile(path.join(outDir, name), img.toPNG())
            captured = true
          } catch (err) {
            log.push(`  capture attempt ${attempt + 1} failed: ${(err as Error).message}`)
          }
        }
        if (!captured) process.exitCode = 1
      }
      await writeFile(path.join(outDir, 'smoke-log.txt'), log.join('\n'), 'utf8')
      app.quit()
    }, 6500)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  campaign?.dispose()
  if (process.platform !== 'darwin') app.quit()
})
