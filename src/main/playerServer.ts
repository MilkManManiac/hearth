import http from 'http'
import os from 'os'
import * as path from 'path'
import { promises as fs } from 'fs'
import type { CampaignMap, Character, RollEvent } from '../shared/types'

// ONESTOP-PLAN C5 — the player portal: Hearth hosts a small HTTP server so
// each PLAYER opens their character in any browser (phone/laptop) — build,
// level up, swap spells, manage inventory — and every save lands in the
// campaign's characters/*.json, which the DM's app is already watching.
// LAN by default; remote groups reach it through a tunnel (the group is on
// Discord anyway). No auth — it's a table of friends, not the internet.

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

export class PlayerPortal {
  private server: http.Server | null = null
  private port = 3789
  private sseClients = new Set<http.ServerResponse>()

  constructor(private deps: PortalDeps) {}

  status(): PortalStatus {
    return { running: !!this.server, url: `http://${lanIp()}:${this.port}` }
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
    const server = http.createServer((req, res) => void this.handle(req, res))
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(this.port, '0.0.0.0', () => resolve())
    })
    this.server = server
    return this.status()
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = (req.url ?? '/').split(/[?#]/)[0]
    try {
      if (url === '/api/characters' && req.method === 'GET') {
        return this.json(res, await this.deps.getCharacters())
      }
      const save = url.match(/^\/api\/character\/([a-z0-9-]+)$/)
      if (save && req.method === 'POST') {
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
        return this.json(res, { ok: true, characterId: result.characterId })
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
      // Ember Table view (M2): the live map, rendered client-side.
      if (url === '/api/table' && req.method === 'GET') {
        return this.json(res, { map: await this.deps.getLiveMap() })
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
