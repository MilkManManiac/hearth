import crypto from 'crypto'
import http from 'http'
import os from 'os'
import * as path from 'path'
import { promises as fs } from 'fs'
import type { CampaignMap, Character, PartyStash, RollEvent } from '../shared/types'
import type { CoinKey } from '../shared/inventory'
import { sanitizePlayerMap } from '../shared/mapView'

// ONESTOP-PLAN C5 — the player portal: Hearth hosts a small HTTP server so
// each PLAYER opens their character in any browser (phone/laptop) — build,
// level up, swap spells, manage inventory — and every save lands in the
// campaign's characters/*.json, which the DM's app is already watching.
// LAN by default; remote groups reach it through a tunnel (the group is on
// Discord anyway).
//
// AUTH (AUDIT P0, added 2026-07-23) — two layers, both stored in
// <campaign>/portal-auth.json (never committed; .gitignore'd):
//  1. A campaign KEY baked into the player link (?key=...) — every /api,
//     /asset and /homebrew request must carry it (query param or
//     x-hearth-key header). Prerequisite for any tunnel/remote route.
//  2. Per-character CLAIM tokens: the first browser to claim a character gets
//     a token (localStorage); every mutation of that character requires it.
//     Lost phone? The DM's ⟲ reset button clears all claims.
// Plus: same-origin check + a light per-IP rate limit on mutating POSTs.

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
}

export interface PortalStatus {
  running: boolean
  url: string
}

export interface PortalDeps {
  /** Current characters (fresh from disk). */
  getCharacters: () => Promise<Character[]>
  /** Persist one character (the campaign manager's atomic save). */
  saveCharacter: (c: Character) => Promise<unknown>
  /** Where the built renderer lives (player.html + assets + compendium). */
  rendererDir: string
  /** Current campaign folder (for /homebrew/*). */
  campaignDir: () => string
  /** A player rolled dice — feed the campaign Game Log hub. */
  onRoll: (roll: RollEvent) => void
  /** Player-created character (D2: players build their own, like DDB). */
  createCharacter: (name: string) => Promise<{ characterId: string }>
  /** Recent public rolls for the portal's log (DM-only rolls pre-filtered). */
  getRolls: () => RollEvent[]
  /** The live map for Ember's Table view (M2) — null = table dark. */
  getLiveMap: () => Promise<CampaignMap | null>
  /** Party stash (M4): players can view it and move items/coins. */
  getParty: () => Promise<PartyStash>
  transferItem: (req: { itemId: string; from: string; to: string; qty?: number; who: string }) => Promise<void>
  transferCoins: (req: { from: string; to: string; coin: CoinKey; amount: number; who: string }) => Promise<void>
  /** Ember E2: move a token on the LIVE map — only ever the player's own PC
   * token (the server checks token.characterId, the one rule that matters). */
  moveToken: (req: { tokenId: string; characterId: string; x: number; y: number }) => Promise<{ ok: boolean; error?: string }>
  /** Ember E2: a player pinged the live map — ephemeral fan-out, never saved. */
  playerPing: (p: PortalPing) => void
}

/** An ephemeral player ping (E2): position + who/color, relayed everywhere. */
export interface PortalPing {
  id: string
  x: number
  y: number
  color?: string
  label?: string
  mapId?: string
}

/** Image types the /asset/ route will serve to browsers (maps + handouts). */
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'])

function lanIp(): string {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address
    }
  }
  return 'localhost'
}

interface PortalAuth {
  key: string
  /** characterId → the claim token of the browser that owns it. */
  claims: Record<string, string>
}

export class PlayerPortal {
  private server: http.Server | null = null
  private port = 3789
  private sseClients = new Set<http.ServerResponse>()
  private auth: PortalAuth | null = null
  private authDir = ''
  /** Per-IP timestamps of recent mutating POSTs (sliding-window rate limit). */
  private postTimes = new Map<string, number[]>()

  constructor(private deps: PortalDeps) {}

  status(): PortalStatus {
    const key = this.auth?.key
    return {
      running: !!this.server,
      url: `http://${lanIp()}:${this.port}/${key ? `?key=${key}` : ''}`
    }
  }

  private authFile(): string {
    return path.join(this.deps.campaignDir(), 'portal-auth.json')
  }

  /** Load (or mint) the campaign's portal auth; re-loads on campaign switch. */
  private async loadAuth(): Promise<PortalAuth> {
    const dir = this.deps.campaignDir()
    if (this.auth && this.authDir === dir) return this.auth
    let auth: PortalAuth | null = null
    try {
      const raw = JSON.parse(await fs.readFile(this.authFile(), 'utf8')) as Partial<PortalAuth>
      if (typeof raw.key === 'string' && raw.key.length >= 6) {
        auth = { key: raw.key, claims: raw.claims && typeof raw.claims === 'object' ? raw.claims : {} }
      }
    } catch {
      /* first run for this campaign */
    }
    if (!auth) {
      auth = { key: crypto.randomBytes(4).toString('hex'), claims: {} }
      await fs.writeFile(this.authFile(), JSON.stringify(auth, null, 2))
    }
    this.auth = auth
    this.authDir = dir
    return auth
  }

  private async saveAuth(): Promise<void> {
    if (this.auth) await fs.writeFile(this.authFile(), JSON.stringify(this.auth, null, 2))
  }

  /** DM action: clear every claim (player lost their phone / new browser). */
  async resetClaims(): Promise<void> {
    const auth = await this.loadAuth()
    auth.claims = {}
    await this.saveAuth()
  }

  /** True if this request carries the claim token for `characterId`. */
  private claimOk(auth: PortalAuth, req: http.IncomingMessage, characterId: string): boolean {
    const token = auth.claims[characterId]
    return !!token && req.headers['x-hearth-claim'] === token
  }

  /** Sliding-window POST limiter: 40 per 10s per IP is generous for dice. */
  private allowPost(ip: string): boolean {
    const now = Date.now()
    const times = (this.postTimes.get(ip) ?? []).filter((t) => now - t < 10_000)
    if (times.length >= 40) return false
    times.push(now)
    this.postTimes.set(ip, times)
    return true
  }

  /** Tell connected players the campaign changed (they refetch). */
  notifyChange(): void {
    for (const res of this.sseClients) {
      try {
        res.write('data: changed\n\n')
      } catch {
        this.sseClients.delete(res)
      }
    }
  }

  /** Stream a public roll to connected players (named SSE event). */
  pushRoll(roll: RollEvent): void {
    const payload = `event: roll\ndata: ${JSON.stringify(roll)}\n\n`
    for (const res of this.sseClients) {
      try {
        res.write(payload)
      } catch {
        this.sseClients.delete(res)
      }
    }
  }

  /** Stream a map ping to connected players (E2) — ephemeral, never persisted. */
  pushPing(ping: PortalPing): void {
    const payload = `event: ping\ndata: ${JSON.stringify(ping)}\n\n`
    for (const res of this.sseClients) {
      try {
        res.write(payload)
      } catch {
        this.sseClients.delete(res)
      }
    }
  }

  async stop(): Promise<PortalStatus> {
    for (const res of this.sseClients) {
      try {
        res.end()
      } catch {
        /* ignore */
      }
    }
    this.sseClients.clear()
    await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()))
    this.server = null
    return this.status()
  }

  async start(): Promise<PortalStatus> {
    if (this.server) return this.status()
    await this.loadAuth() // the shared link needs the key before anyone asks
    const server = http.createServer((req, res) => void this.handle(req, res))
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(this.port, '0.0.0.0', () => resolve())
    })
    this.server = server
    return this.status()
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const rawUrl = req.url ?? '/'
    const url = rawUrl.split(/[?#]/)[0]
    const params = new URLSearchParams(rawUrl.split('?')[1] ?? '')
    try {
      // ---- auth & abuse gates -------------------------------------------
      const auth = await this.loadAuth()
      const guarded = url.startsWith('/api/') || url.startsWith('/asset/') || url.startsWith('/homebrew/')
      if (guarded) {
        const provided = params.get('key') ?? req.headers['x-hearth-key']
        if (provided !== auth.key) {
          return this.json(res, { error: 'portal key required — use the full link from the DM' }, 401)
        }
      }
      if (req.method === 'POST') {
        // CSRF guard: a browser POST from another site carries its Origin.
        const origin = req.headers.origin
        if (origin) {
          let host = ''
          try {
            host = new URL(origin).host
          } catch {
            /* malformed origin → reject below */
          }
          if (host !== req.headers.host) return this.json(res, { error: 'cross-origin refused' }, 403)
        }
        if (!this.allowPost(req.socket.remoteAddress ?? '?')) {
          return this.json(res, { error: 'slow down' }, 429)
        }
      }

      if (url === '/api/characters' && req.method === 'GET') {
        return this.json(res, await this.deps.getCharacters())
      }
      // Claim a character: first browser in gets the token; the same browser
      // re-claims freely (it sends its token back); anyone else is refused.
      if (url === '/api/claim' && req.method === 'POST') {
        const r = JSON.parse(await readBody(req)) as { characterId?: string; token?: string }
        const id = String(r.characterId ?? '').slice(0, 60)
        if (!id) return this.json(res, { error: 'characterId required' }, 400)
        if (!(await this.deps.getCharacters()).some((c) => c.id === id)) {
          return this.json(res, { error: 'not found' }, 404)
        }
        const existing = auth.claims[id]
        if (!existing) {
          const token = crypto.randomBytes(12).toString('hex')
          auth.claims[id] = token
          await this.saveAuth()
          return this.json(res, { ok: true, token })
        }
        if (r.token === existing) return this.json(res, { ok: true, token: existing })
        return this.json(res, { error: 'claimed on another device — ask the DM to reset player access' }, 403)
      }
      const save = url.match(/^\/api\/character\/([a-z0-9-]+)$/)
      if (save && req.method === 'POST') {
        if (!this.claimOk(auth, req, save[1])) {
          return this.json(res, { error: 'not your character — claim it first' }, 403)
        }
        const body = await readBody(req)
        const incoming = JSON.parse(body) as Character
        const current = (await this.deps.getCharacters()).find((c) => c.id === save[1])
        if (!current) return this.json(res, { error: 'not found' }, 404)
        // The server owns identity + file location; the client owns the rest.
        await this.deps.saveCharacter({ ...incoming, id: current.id, _sourceFile: current._sourceFile })
        return this.json(res, { ok: true })
      }
      if (url === '/api/character-create' && req.method === 'POST') {
        const { name } = JSON.parse(await readBody(req)) as { name?: string }
        const clean = String(name ?? '').trim().slice(0, 60)
        if (!clean) return this.json(res, { error: 'name required' }, 400)
        const result = await this.deps.createCharacter(clean)
        // The creator owns their creation — claim minted in the same breath.
        const token = crypto.randomBytes(12).toString('hex')
        auth.claims[result.characterId] = token
        await this.saveAuth()
        return this.json(res, { ok: true, characterId: result.characterId, token })
      }
      if (url === '/api/rolls' && req.method === 'GET') {
        return this.json(res, this.deps.getRolls())
      }
      if (url === '/api/roll' && req.method === 'POST') {
        const roll = JSON.parse(await readBody(req)) as RollEvent
        // Strict shape check + rebuild: a malformed group would crash every
        // connected Game Log render, so never trust the client's structure.
        if (typeof roll?.total !== 'number' || typeof roll?.who !== 'string' || !Array.isArray(roll?.groups)) {
          return this.json(res, { error: 'bad roll' }, 400)
        }
        const groups = roll.groups
          .filter((g) => g && typeof g.die === 'number' && Array.isArray(g.results))
          .slice(0, 20)
          .map((g) => ({
            die: Math.max(2, Math.min(1000, Math.floor(g.die))),
            results: g.results.filter((r) => typeof r === 'number').slice(0, 200),
            kept: (Array.isArray(g.kept) ? g.kept : []).filter((k) => typeof k === 'number')
          }))
        this.deps.onRoll({
          id: String(roll.id ?? `${Date.now()}-${Math.random()}`).slice(0, 60),
          ts: typeof roll.ts === 'number' ? roll.ts : Date.now(),
          who: roll.who.slice(0, 40),
          characterId: typeof roll.characterId === 'string' ? roll.characterId.slice(0, 60) : undefined,
          what: String(roll.what ?? '').slice(0, 80),
          expr: String(roll.expr ?? '').slice(0, 60),
          total: roll.total,
          groups,
          modifier: typeof roll.modifier === 'number' ? roll.modifier : 0,
          mode: roll.mode === 'adv' || roll.mode === 'dis' ? roll.mode : undefined,
          crit: roll.crit === 'crit' || roll.crit === 'fumble' ? roll.crit : undefined,
          dmOnly: false
        })
        return this.json(res, { ok: true })
      }
      if (url === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        })
        res.write('data: hello\n\n')
        this.sseClients.add(res)
        req.on('close', () => this.sseClients.delete(res))
        return
      }
      // Ember Table view (M2): the live map — filtered SERVER-SIDE (P0):
      // hidden tokens, the encounter (enemy HP), and monster refs never leave
      // this process; HP rings/conditions/initiative ship pre-computed.
      if (url === '/api/table' && req.method === 'GET') {
        const raw = await this.deps.getLiveMap()
        if (!raw) return this.json(res, { map: null })
        return this.json(res, sanitizePlayerMap(raw, await this.deps.getCharacters()))
      }
      // Ember E2: a player moved their OWN token on the live map. The server
      // enforces the only rule that matters — the token must belong to the
      // character the browser claims (monsters/others are never movable).
      if (url === '/api/table/move-token' && req.method === 'POST') {
        const r = JSON.parse(await readBody(req)) as { tokenId?: string; characterId?: string; x?: number; y?: number }
        if (
          typeof r.tokenId !== 'string' ||
          typeof r.characterId !== 'string' ||
          !Number.isFinite(r.x) ||
          !Number.isFinite(r.y)
        ) {
          return this.json(res, { error: 'bad move' }, 400)
        }
        if (!this.claimOk(auth, req, r.characterId)) {
          return this.json(res, { error: 'not your character — claim it first' }, 403)
        }
        const result = await this.deps.moveToken({
          tokenId: r.tokenId.slice(0, 60),
          characterId: r.characterId.slice(0, 60),
          x: Math.max(0, Math.min(100_000, r.x!)),
          y: Math.max(0, Math.min(100_000, r.y!))
        })
        return result.ok ? this.json(res, { ok: true }) : this.json(res, { error: result.error ?? 'refused' }, 403)
      }
      // Ember E2: player ping — ephemeral relay to every surface, never saved.
      if (url === '/api/table/ping' && req.method === 'POST') {
        const r = JSON.parse(await readBody(req)) as {
          id?: string
          x?: number
          y?: number
          color?: string
          label?: string
          mapId?: string
        }
        if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) return this.json(res, { error: 'bad ping' }, 400)
        this.deps.playerPing({
          id: String(r.id ?? `${Date.now()}-${Math.random()}`).slice(0, 60),
          x: r.x!,
          y: r.y!,
          color: typeof r.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(r.color) ? r.color : undefined,
          label: typeof r.label === 'string' ? r.label.slice(0, 24) : undefined,
          mapId: typeof r.mapId === 'string' ? r.mapId.slice(0, 60) : undefined
        })
        return this.json(res, { ok: true })
      }
      // Party stash (M4): shared items + coins + activity log.
      if (url === '/api/party' && req.method === 'GET') {
        return this.json(res, await this.deps.getParty())
      }
      if (url === '/api/party/transfer-item' && req.method === 'POST') {
        const r = JSON.parse(await readBody(req)) as {
          itemId?: string
          from?: string
          to?: string
          qty?: number
          who?: string
        }
        if (typeof r.itemId !== 'string' || typeof r.from !== 'string' || typeof r.to !== 'string') {
          return this.json(res, { error: 'bad transfer' }, 400)
        }
        // The character end of a stash move must be YOUR character.
        const itemChar = r.from === 'stash' ? r.to : r.from
        if (!this.claimOk(auth, req, itemChar.slice(0, 60))) {
          return this.json(res, { error: 'not your character — claim it first' }, 403)
        }
        await this.deps.transferItem({
          itemId: r.itemId.slice(0, 60),
          from: r.from.slice(0, 60),
          to: r.to.slice(0, 60),
          qty: typeof r.qty === 'number' ? Math.max(1, Math.floor(r.qty)) : undefined,
          who: String(r.who ?? 'someone').slice(0, 40)
        })
        return this.json(res, { ok: true })
      }
      if (url === '/api/party/transfer-coins' && req.method === 'POST') {
        const r = JSON.parse(await readBody(req)) as {
          from?: string
          to?: string
          coin?: string
          amount?: number
          who?: string
        }
        const coins = ['cp', 'sp', 'ep', 'gp', 'pp']
        if (
          typeof r.from !== 'string' ||
          typeof r.to !== 'string' ||
          !coins.includes(String(r.coin)) ||
          typeof r.amount !== 'number'
        ) {
          return this.json(res, { error: 'bad transfer' }, 400)
        }
        const coinChar = r.from === 'stash' ? r.to : r.from
        if (!this.claimOk(auth, req, coinChar.slice(0, 60))) {
          return this.json(res, { error: 'not your character — claim it first' }, 403)
        }
        await this.deps.transferCoins({
          from: r.from.slice(0, 60),
          to: r.to.slice(0, 60),
          coin: r.coin as CoinKey,
          amount: Math.max(1, Math.floor(r.amount)),
          who: String(r.who ?? 'someone').slice(0, 40)
        })
        return this.json(res, { ok: true })
      }
      // Campaign images (map art, handouts) — images only, path-guarded.
      if (url.startsWith('/asset/')) {
        const rel = decodeURIComponent(url.slice('/asset/'.length))
        const root = path.resolve(this.deps.campaignDir())
        const abs = path.resolve(root, rel)
        if (!abs.startsWith(root + path.sep)) return this.text(res, 'Forbidden', 403)
        const ext = path.extname(abs).toLowerCase()
        if (!IMAGE_EXTS.has(ext)) return this.text(res, 'Forbidden', 403)
        try {
          const data = await fs.readFile(abs)
          const type =
            ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg'
          res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'max-age=3600' })
          res.end(data)
        } catch {
          this.text(res, 'Not found', 404)
        }
        return
      }
      // Campaign homebrew (merged into the compendium client-side).
      const hb = url.match(/^\/homebrew\/([a-z0-9.-]+\.json)$/)
      if (hb) {
        const hbRoot = path.resolve(this.deps.campaignDir(), 'homebrew')
        const hbAbs = path.resolve(hbRoot, hb[1])
        if (!hbAbs.startsWith(hbRoot + path.sep)) return this.text(res, 'Forbidden', 403)
        try {
          const data = await fs.readFile(hbAbs)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(data)
        } catch {
          this.text(res, '[]', 404)
        }
        return
      }
      // Static: the built renderer (player.html + hashed assets + compendium).
      const rel = url === '/' ? 'player.html' : url.replace(/^\/+/, '')
      const root = path.resolve(this.deps.rendererDir)
      const abs = path.resolve(root, rel)
      if (!abs.startsWith(root + path.sep)) return this.text(res, 'Forbidden', 403)
      try {
        const data = await fs.readFile(abs)
        res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream' })
        res.end(data)
      } catch {
        this.text(
          res,
          url === '/'
            ? 'Player portal assets missing — run `npm run build` on the DM machine first.'
            : 'Not found',
          404
        )
      }
    } catch (err) {
      this.text(res, `Server error: ${(err as Error).message}`, 500)
    }
  }

  private json(res: http.ServerResponse, data: unknown, code = 200): void {
    res.writeHead(code, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }

  private text(res: http.ServerResponse, msg: string, code = 200): void {
    res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(msg)
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > 1_000_000) reject(new Error('body too large'))
      else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}
