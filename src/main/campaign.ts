import { app, dialog, shell } from 'electron'
import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import * as path from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import type {
  AssetKind,
  CampaignNote,
  Character,
  CampaignState,
  Coins,
  InventoryItem,
  Library,
  LibraryAsset,
  NoteKind,
  CampaignMap,
  PartyStash,
  PlaylistPreset,
  Scene,
  SceneImage
} from '../shared/types'
import type { TriageKeepRequest, TriageScan } from '../preload/index'
import { compileScriptText, normalizeScript } from '../shared/scriptCompile'
import {
  addCoins,
  autoAc,
  cpToCoins,
  emptyCoins,
  migrateEquipmentLines,
  newItemId,
  type CoinKey
} from '../shared/inventory'
import { AUTHORING_MD } from './authoring'

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'hearth-config.json')
const SUBFOLDERS = ['scenes', 'notes', 'characters', 'maps', 'music', 'ambience', 'sfx', 'art']
const TRIAGE_AUDIO_EXTS = new Set(['.mp3', '.ogg', '.wav', '.flac', '.m4a'])

interface Config {
  campaignPath?: string
}

/** Filesystem-safe slug for scene filenames/ids, e.g. "Copy of The Tavern!" → "copy-of-the-tavern". */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'scene'
}

type SceneTemplate = Omit<Scene, 'id' | '_sourceFile'>

/**
 * Built-in starting points for "+ New Scene": tiny, asset-free skeletons (every
 * campaign's library differs) — empty palettes plus placeholder scriptText that
 * shows the authoring conventions ({{cues}}, callouts). Ids must match the
 * template menu in renderer/components/SceneList.tsx.
 */
const SCENE_TEMPLATES: Record<string, SceneTemplate> = {
  blank: {
    name: 'New Scene',
    scriptText:
      '# New Scene\n\n' +
      'Write the read-aloud prose the players hear when this scene opens. Use the ✎ editor to style it and drop sound cues straight into the text.\n\n' +
      '> [!dm] Add music, ambience beds, and SFX from the library (+ Add in each section), then come back and wire {{sfx:...}} cues where they land best.',
    music: [],
    ambience: [],
    sfx: []
  },
  tavern: {
    name: 'The Tavern',
    dmNotes:
      'Template scene — rename it, then add music/ambience from the library (tavern, town, fire tags work well).',
    scriptText:
      '# The Tavern\n\n' +
      'The door swings open on a wall of warmth: woodsmoke, spilled ale, and a dozen conversations that dip — just for a heartbeat — as every eye takes your measure. A fire crackles in the hearth, and somewhere in the back a fiddle saws out a half-remembered dance.\n\n' +
      'The barkeep lifts a chin in greeting. *"Sit where you like. First round\'s not free."*\n\n' +
      '> [!dm] Set the mood before they order: add a tavern music palette and crowd/fireplace ambience beds from the library, then drop {{sfx:...}} cues into this script with the ✎ editor.',
    music: [],
    ambience: [],
    sfx: []
  },
  combat: {
    name: 'Combat Encounter',
    dmNotes:
      'Template scene — rename it. Three music slots work well: tension for the standoff, the fight itself, and an aftermath/regroup track.',
    scriptText:
      '# Combat Encounter\n\n' +
      'Steel clears its scabbard somewhere in the dark. Whatever you came here to do, it is too late for talking now — **roll initiative**.\n\n' +
      '> [!dm] Build the palette: a tension track, a battle track, and a victory or regroup track. Add hit/roar/clash SFX with hotkeys 1–4, then wire {{sfx:...}} cues into the prose.\n\n' +
      '> [!dm] Escalation levers if the fight drags or goes too easy: reinforcements arrive, the terrain changes (fire spreads, floor gives way), or the leader flees at half HP.',
    music: [],
    ambience: [],
    sfx: []
  },
  dungeon: {
    name: 'Dungeon Crawl',
    dmNotes:
      'Template scene — rename it. Low drones and drip/echo ambience sell a dungeon better than music; keep the music sparse.',
    scriptText:
      '# Dungeon Crawl\n\n' +
      'Your torchlight gutters against stone that has not felt wind in a hundred years. The passage ahead swallows the light after a dozen paces, and from somewhere below comes a slow, patient *drip... drip... drip*.\n\n' +
      'The air tastes of dust and old iron. Something down here is waiting to be found — or waiting for you.\n\n' +
      '> [!dm] Add a cave/dungeon ambience bed and a sparse exploration track from the library. Save a stinger SFX for the first trap or door — drop it as a {{sfx:...}} cue right where you\'ll read it.',
    music: [],
    ambience: [],
    sfx: []
  }
}

/**
 * Starter bodies for new notes — a light nudge toward useful structure, never
 * required fields (empty templates create guilt; see NOTES-PLAN.md). The
 * session skeleton follows the Lazy DM one-pager.
 */
const NOTE_STARTERS: Partial<Record<NoteKind, string>> = {
  session: [
    '# Recap',
    'What happened last time — written to be read aloud.',
    '',
    '# Strong start',
    'The opening beat: drop the players straight into something happening.',
    '',
    '# Possible scenes',
    'A few short lines — build the real ones as Hearth scenes and assign them to this session.',
    '',
    '# Secrets & clues',
    '- [ ] One-sentence revelation the players might discover — tick it when it lands at the table.',
    '- [ ] Another. Unchecked items carry into the next session automatically.',
    '',
    '# To-do / ideas',
    '> [!dm] Post-session scratch: what worked, what to figure out before next time.'
  ].join('\n'),
  npc: '> [!dm] Who they are in one line. Voice/mannerism. What they want. What they know.\n',
  pc: '> [!dm] Player + character. Goals, bonds, secrets, promises the table made to/about them.\n',
  location: '> [!dm] What it looks/sounds/smells like on arrival. Who is here. What is hidden.\n',
  faction: '> [!dm] What they want, who leads them, how they act when crossed.\n',
  item: '> [!dm] What it does, where it came from, who wants it.\n',
  thread: '> [!dm] The open question or secret. Mark the note resolved when it pays off.\n'
}

function readConfig(): Config {
  try {
    return JSON.parse(fsSync.readFileSync(CONFIG_FILE(), 'utf-8'))
  } catch {
    return {}
  }
}

/**
 * Merge-write: hearth-config.json is shared with other features (the Discord
 * bot token lives there too) — writing `cfg` wholesale would erase their keys.
 */
function writeConfig(cfg: Config): void {
  fsSync.writeFileSync(CONFIG_FILE(), JSON.stringify({ ...readConfig(), ...cfg }, null, 2))
}

/**
 * Crash-safe JSON write: serialize to a temp sibling, then rename over the
 * target. A crash mid-write can never truncate the real file — library.json
 * (the index of every asset) is rewritten on every tag edit and must survive.
 */
async function writeJsonAtomic(dest: string, data: unknown): Promise<void> {
  const tmp = `${dest}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2))
  await fs.rename(tmp, dest)
}

/** In dev, default to the repo's sample campaign so there is content immediately. */
function defaultCampaignPath(): string {
  if (!app.isPackaged) {
    const sample = path.resolve(process.cwd(), 'campaign-sample')
    if (fsSync.existsSync(sample)) return sample
  }
  return path.join(app.getPath('userData'), 'Hearth Campaign')
}

export class CampaignManager {
  private campaignPath: string
  private watcher: FSWatcher | null = null
  private reloadTimer: NodeJS.Timeout | null = null
  /**
   * Timestamp of the last write WE made into the campaign folder. The watcher
   * skips its reload-broadcast within a short window of this, so our own saves
   * don't echo back as a second `campaign:changed` (which could stomp in-flight
   * renderer state). Every mutating method already returns/broadcasts fresh
   * state itself, so nothing is lost by suppressing the echo.
   */
  private lastInternalWrite = 0

  constructor(private onChange: (state: CampaignState) => void) {
    // HEARTH_CAMPAIGN: headless/testing override (like HEARTH_PORTAL) — point
    // a smoke run at any campaign folder without touching the user's config.
    this.campaignPath =
      process.env.HEARTH_CAMPAIGN ?? readConfig().campaignPath ?? defaultCampaignPath()
  }

  private markWrite(): void {
    this.lastInternalWrite = Date.now()
  }

  /**
   * Copy `src` into `destDir` as `stem+ext`, appending -2, -3… on collision.
   * COPYFILE_EXCL guards the check-then-copy race. Returns the final basename.
   * Never overwrites existing campaign files.
   */
  private async copyUnique(src: string, destDir: string, stem: string, ext: string): Promise<string> {
    let base = `${stem}${ext}`
    for (let n = 2; ; n++) {
      try {
        await fs.copyFile(src, path.join(destDir, base), fsSync.constants.COPYFILE_EXCL)
        this.markWrite()
        return base
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
        base = `${stem}-${n}${ext}`
      }
    }
  }

  get path(): string {
    return this.campaignPath
  }

  async init(): Promise<CampaignState> {
    await this.ensureStructure(this.campaignPath)
    this.startWatching()
    return this.load()
  }

  private async ensureStructure(root: string): Promise<void> {
    await fs.mkdir(root, { recursive: true })
    for (const sub of SUBFOLDERS) {
      await fs.mkdir(path.join(root, sub), { recursive: true })
    }
    const libPath = path.join(root, 'library.json')
    if (!fsSync.existsSync(libPath)) {
      await writeJsonAtomic(libPath, { assets: [] })
    }
    const authoringPath = path.join(root, 'AUTHORING.md')
    if (!fsSync.existsSync(authoringPath)) {
      await fs.writeFile(authoringPath, AUTHORING_MD)
    }
  }

  async load(): Promise<CampaignState> {
    const errors: string[] = []
    await this.migrateSceneMaps(errors)
    await this.migrateCharacterInventories(errors)
    const scenes = await this.loadScenes(errors)
    const notes = await this.loadNotes(errors)
    const characters = await this.loadCharacters(errors)
    const maps = await this.loadMaps(errors)
    const library = await this.loadLibrary(errors)
    const liveMapId = await this.readLiveMap(maps)
    const party = await this.loadParty()
    return { path: this.campaignPath, scenes, notes, characters, maps, liveMapId, party, library, errors }
  }

  // --- Battle maps (SURFACES-PLAN M1): maps/*.json + table.json live pointer ---

  private migrating = false

  /**
   * One-time migration: scenes that still embed `map`/`encounter` (pre-M1)
   * get them hoisted into maps/<scene-id>.json; the scene file is rewritten
   * without them. Idempotent — migrated scenes simply have nothing to hoist.
   */
  private async migrateSceneMaps(errors: string[]): Promise<void> {
    if (this.migrating) return
    this.migrating = true
    try {
      const dir = path.join(this.campaignPath, 'scenes')
      let files: string[] = []
      try {
        files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.json'))
      } catch {
        return
      }
      for (const file of files) {
        try {
          const abs = path.join(dir, file)
          const scene = JSON.parse(await fs.readFile(abs, 'utf-8')) as Scene & Record<string, unknown>
          if (!scene.map && !scene.encounter) continue
          const mapsDir = path.join(this.campaignPath, 'maps')
          await fs.mkdir(mapsDir, { recursive: true })
          const base = slugify(scene.name ?? file.replace(/\.json$/i, ''))
          let stem = base
          for (let n = 2; fsSync.existsSync(path.join(mapsDir, `${stem}.json`)); n++) stem = `${base}-${n}`
          const m: CampaignMap = {
            id: stem,
            name: scene.name ?? stem,
            image: scene.map?.image ?? '',
            strokes: scene.map?.strokes ?? [],
            tokens: scene.map?.tokens,
            overlays: scene.map?.overlays,
            grid: scene.map?.grid,
            encounter: scene.encounter
          }
          await writeJsonAtomic(path.join(mapsDir, `${stem}.json`), m)
          delete scene.map
          delete scene.encounter
          delete scene._sourceFile
          await writeJsonAtomic(abs, scene)
          this.markWrite()
          console.log(`[hearth] migrated scene "${file}" map/encounter → maps/${stem}.json`)
        } catch (err) {
          errors.push(`migrate ${file}: ${(err as Error).message}`)
        }
      }
    } finally {
      this.migrating = false
    }
  }

  private async loadMaps(errors: string[]): Promise<CampaignMap[]> {
    const dir = path.join(this.campaignPath, 'maps')
    let files: string[] = []
    try {
      files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.json'))
    } catch {
      return []
    }
    const maps: CampaignMap[] = []
    for (const file of files) {
      try {
        const raw = await fs.readFile(path.join(dir, file), 'utf-8')
        const m = JSON.parse(raw) as CampaignMap
        m._sourceFile = `maps/${file}`
        if (!m.id) m.id = file.replace(/\.json$/i, '')
        if (!m.name) m.name = m.id
        if (!m.strokes) m.strokes = []
        maps.push(m)
      } catch (err) {
        errors.push(`maps/${file}: ${(err as Error).message}`)
      }
    }
    maps.sort((a, b) => a.name.localeCompare(b.name))
    return maps
  }

  async saveMap(m: CampaignMap): Promise<CampaignState> {
    const rel = m._sourceFile ?? `maps/${m.id}.json`
    const { _sourceFile, ...rest } = m
    void _sourceFile
    const dest = path.join(this.campaignPath, rel)
    const root = path.resolve(this.campaignPath)
    if (!path.resolve(dest).startsWith(root + path.sep)) throw new Error('bad map path')
    await writeJsonAtomic(dest, rest)
    this.markWrite()
    return this.load()
  }

  async createMap(name: string, image: string): Promise<{ state: CampaignState; mapId: string }> {
    const dir = path.join(this.campaignPath, 'maps')
    await fs.mkdir(dir, { recursive: true })
    const base = slugify(name || 'map')
    let stem = base
    for (let n = 2; fsSync.existsSync(path.join(dir, `${stem}.json`)); n++) stem = `${base}-${n}`
    const m: CampaignMap = { id: stem, name: name || stem, image, strokes: [] }
    await writeJsonAtomic(path.join(dir, `${stem}.json`), m)
    this.markWrite()
    return { state: await this.load(), mapId: stem }
  }

  /** Move a map's JSON to the OS trash (the image stays in art/). */
  async deleteMap(mapId: string): Promise<CampaignState> {
    const m = (await this.loadMaps([])).find((x) => x.id === mapId)
    if (!m?._sourceFile) throw new Error(`map "${mapId}" not found`)
    await shell.trashItem(path.join(this.campaignPath, m._sourceFile))
    if ((await this.readLiveMap(null)) === mapId) await this.setLiveMap(null)
    this.markWrite()
    return this.load()
  }

  private tablePath(): string {
    return path.join(this.campaignPath, 'table.json')
  }

  /** Which map is live (validated against the loaded list when provided). */
  private async readLiveMap(maps: CampaignMap[] | null): Promise<string | null> {
    try {
      const raw = JSON.parse(await fs.readFile(this.tablePath(), 'utf-8')) as { liveMapId?: string }
      const id = raw.liveMapId ?? null
      if (id && maps && !maps.some((m) => m.id === id)) return null
      return id
    } catch {
      return null
    }
  }

  async setLiveMap(mapId: string | null): Promise<CampaignState> {
    await writeJsonAtomic(this.tablePath(), { liveMapId: mapId })
    this.markWrite()
    return this.load()
  }

  private migratingInventory = false

  /**
   * One-time migration (SURFACES-PLAN M4): characters that still carry
   * free-text `equipment` lines get them parsed into structured `inventory`
   * rows + a coin pouch. The original lines are preserved verbatim in
   * `legacyEquipment`; if the derived auto-AC disagrees with the sheet's
   * imported AC, the old number is pinned as `acOverride` (the imported value
   * is truth — never silently change a number the DM has seen). Idempotent:
   * presence of `inventory` means migrated.
   */
  private async migrateCharacterInventories(errors: string[]): Promise<void> {
    if (this.migratingInventory) return
    this.migratingInventory = true
    try {
      const dir = path.join(this.campaignPath, 'characters')
      let files: string[] = []
      try {
        files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.json'))
      } catch {
        return
      }
      for (const file of files) {
        try {
          const abs = path.join(dir, file)
          const raw = JSON.parse(await fs.readFile(abs, 'utf-8')) as Character & Record<string, unknown>
          if (raw.inventory !== undefined) continue
          if (!Array.isArray(raw.equipment) || raw.equipment.length === 0) continue
          const { items, coinsCp } = migrateEquipmentLines(raw.equipment)
          raw.inventory = items
          if (coinsCp > 0 && raw.coins == null) raw.coins = cpToCoins(coinsCp)
          raw.legacyEquipment = raw.equipment
          delete raw.equipment
          if (raw.abilities && typeof raw.ac === 'number') {
            const auto = autoAc(raw as Character)
            if (auto && auto.value !== raw.ac) raw.acOverride = raw.ac
          }
          delete raw._sourceFile
          await writeJsonAtomic(abs, raw)
          this.markWrite()
          console.log(
            `[hearth] migrated characters/${file}: ${items.length} inventory rows` +
              (coinsCp > 0 ? `, ${Math.floor(coinsCp / 100)} gp` : '') +
              (raw.acOverride != null ? `, AC pinned at ${raw.acOverride}` : '')
          )
        } catch (err) {
          errors.push(`migrate characters/${file}: ${(err as Error).message}`)
        }
      }
    } finally {
      this.migratingInventory = false
    }
  }

  // --- Party stash (M4): party.json — shared items + coins + activity log ---

  private partyPath(): string {
    return path.join(this.campaignPath, 'party.json')
  }

  async loadParty(): Promise<PartyStash> {
    try {
      const raw = JSON.parse(await fs.readFile(this.partyPath(), 'utf-8')) as Partial<PartyStash>
      return {
        items: Array.isArray(raw.items) ? raw.items : [],
        coins: { ...emptyCoins(), ...(raw.coins ?? {}) },
        log: Array.isArray(raw.log) ? raw.log : []
      }
    } catch {
      return { items: [], coins: emptyCoins(), log: [] }
    }
  }

  async saveParty(p: PartyStash): Promise<CampaignState> {
    await writeJsonAtomic(this.partyPath(), {
      items: p.items ?? [],
      coins: { ...emptyCoins(), ...(p.coins ?? {}) },
      log: (p.log ?? []).slice(0, 200)
    })
    this.markWrite()
    return this.load()
  }

  /** Prepend a stash-log line (newest first, capped). */
  private logParty(p: PartyStash, who: string, text: string): void {
    p.log = [{ ts: Date.now(), who, text }, ...(p.log ?? [])].slice(0, 200)
  }

  /**
   * Transfer-never-copy: move an inventory row (or a quantity split of it)
   * between a character and the stash (or character↔character). Equipped and
   * attuned flags always clear on the way out — the new owner re-equips.
   */
  async transferItem(req: {
    itemId: string
    from: string // 'stash' | characterId
    to: string
    qty?: number
    who: string
  }): Promise<CampaignState> {
    if (req.from === req.to) return this.load()
    const party = await this.loadParty()
    const characters = await this.loadCharacters([])
    const container = (
      id: string
    ): { items: InventoryItem[]; save: (items: InventoryItem[]) => Promise<void>; label: string } => {
      if (id === 'stash') {
        return {
          items: party.items,
          save: async (items) => {
            party.items = items
          },
          label: 'the party stash'
        }
      }
      const c = characters.find((x) => x.id === id)
      if (!c?._sourceFile) throw new Error(`character "${id}" not found`)
      return {
        items: c.inventory ?? [],
        save: async (items) => {
          c.inventory = items
          const { _sourceFile, ...rest } = c
          void _sourceFile
          await writeJsonAtomic(path.join(this.campaignPath, c._sourceFile!), rest)
        },
        label: c.name
      }
    }
    const src = container(req.from)
    const dst = container(req.to)
    const item = src.items.find((i) => i.id === req.itemId)
    if (!item) throw new Error('item not found (someone may have moved it first)')
    const total = item.qty ?? 1
    const moveQty = Math.max(1, Math.min(total, req.qty ?? total))
    const moved: InventoryItem = { ...item, id: newItemId(), qty: moveQty === 1 ? undefined : moveQty }
    delete moved.equipped
    delete moved.attuned
    const remaining =
      moveQty < total
        ? src.items.map((i) => (i.id === item.id ? { ...i, qty: total - moveQty } : i))
        : src.items.filter((i) => i.id !== item.id)
    await src.save(remaining)
    await dst.save([...dst.items, moved])
    const qtyLabel = moveQty > 1 ? ` ×${moveQty}` : ''
    this.logParty(
      party,
      req.who,
      req.to === 'stash'
        ? `stashed ${item.name}${qtyLabel}`
        : req.from === 'stash'
          ? `took ${item.name}${qtyLabel}`
          : `gave ${item.name}${qtyLabel} to ${dst.label}`
    )
    await writeJsonAtomic(this.partyPath(), party)
    this.markWrite()
    return this.load()
  }

  /** Move coins pouch↔stash with auto-make-change on the paying side. */
  async transferCoins(req: {
    from: string // 'stash' | characterId
    to: string
    coin: CoinKey
    amount: number
    who: string
  }): Promise<CampaignState> {
    const amount = Math.floor(req.amount)
    if (amount <= 0 || req.from === req.to) return this.load()
    const party = await this.loadParty()
    const characters = await this.loadCharacters([])
    const pouch = (id: string): Coins =>
      id === 'stash'
        ? party.coins
        : { ...emptyCoins(), ...(characters.find((x) => x.id === id)?.coins ?? {}) }
    const setPouch = async (id: string, coins: Coins): Promise<void> => {
      if (id === 'stash') {
        party.coins = coins
        return
      }
      const c = characters.find((x) => x.id === id)
      if (!c?._sourceFile) throw new Error(`character "${id}" not found`)
      c.coins = coins
      const { _sourceFile, ...rest } = c
      void _sourceFile
      await writeJsonAtomic(path.join(this.campaignPath, c._sourceFile!), rest)
    }
    const paid = addCoins(pouch(req.from), req.coin, -amount)
    if (!paid) throw new Error('not enough coin')
    await setPouch(req.from, paid)
    const received = addCoins(pouch(req.to), req.coin, amount)!
    await setPouch(req.to, received)
    this.logParty(
      party,
      req.who,
      req.to === 'stash' ? `stashed ${amount} ${req.coin}` : `took ${amount} ${req.coin}`
    )
    await writeJsonAtomic(this.partyPath(), party)
    this.markWrite()
    return this.load()
  }

  private async loadCharacters(errors: string[]): Promise<Character[]> {
    const dir = path.join(this.campaignPath, 'characters')
    let files: string[] = []
    try {
      files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.json'))
    } catch {
      return []
    }
    const characters: Character[] = []
    for (const file of files) {
      try {
        const raw = await fs.readFile(path.join(dir, file), 'utf-8')
        const c = JSON.parse(raw) as Character
        c._sourceFile = `characters/${file}`
        if (!c.id) c.id = file.replace(/\.json$/i, '')
        if (!c.name) c.name = c.id
        if (!c.abilities) c.abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
        if (!c.level) c.level = 1
        if (c.maxHp == null) c.maxHp = 10
        if (c.hp == null) c.hp = c.maxHp
        if (c.ac == null) c.ac = 10
        if (!c.skillProfs) c.skillProfs = []
        characters.push(c)
      } catch (err) {
        errors.push(`characters/${file}: ${(err as Error).message}`)
      }
    }
    characters.sort((a, b) => a.name.localeCompare(b.name))
    return characters
  }

  /** Persist a character back to its JSON file. */
  async saveCharacter(c: Character): Promise<CampaignState> {
    const rel = c._sourceFile
    if (!rel) throw new Error('character has no source file to save to')
    const { _sourceFile, ...rest } = c
    void _sourceFile
    const dest = path.join(this.campaignPath, rel)
    const root = path.resolve(this.campaignPath)
    if (!path.resolve(dest).startsWith(root + path.sep)) throw new Error('bad character path')
    await writeJsonAtomic(dest, rest)
    this.markWrite()
    return this.load()
  }

  async createCharacter(name: string): Promise<{ state: CampaignState; characterId: string }> {
    const dir = path.join(this.campaignPath, 'characters')
    await fs.mkdir(dir, { recursive: true })
    const base = slugify(name || 'character')
    let stem = base
    for (let n = 2; fsSync.existsSync(path.join(dir, `${stem}.json`)); n++) stem = `${base}-${n}`
    const c: Character = {
      id: stem,
      name: name || stem,
      level: 1,
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      skillProfs: [],
      ac: 10,
      maxHp: 10,
      hp: 10
    }
    await writeJsonAtomic(path.join(dir, `${stem}.json`), c)
    this.markWrite()
    return { state: await this.load(), characterId: stem }
  }

  /** Move a character's JSON to the OS trash (recoverable). */
  async deleteCharacter(characterId: string): Promise<CampaignState> {
    const c = (await this.loadCharacters([])).find((x) => x.id === characterId)
    if (!c?._sourceFile) throw new Error(`character "${characterId}" not found`)
    const abs = path.join(this.campaignPath, c._sourceFile)
    await shell.trashItem(abs)
    this.markWrite()
    return this.load()
  }

  private async loadScenes(errors: string[]): Promise<Scene[]> {
    const dir = path.join(this.campaignPath, 'scenes')
    // Scenes may live one folder deep (scenes/<Folder>/x.json) — the folder
    // name becomes the rail grouping. `_`/`.`-prefixed folders (e.g.
    // scenes/_archive) are invisible to the app: parked scenes stay on disk
    // without cluttering the session rail.
    let files: { rel: string; folder?: string }[] = []
    try {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
          files.push({ rel: entry.name })
        } else if (entry.isDirectory() && !/^[_.]/.test(entry.name)) {
          try {
            for (const f of await fs.readdir(path.join(dir, entry.name))) {
              if (f.toLowerCase().endsWith('.json')) {
                files.push({ rel: `${entry.name}/${f}`, folder: entry.name })
              }
            }
          } catch {
            /* unreadable subfolder — skip */
          }
        }
      }
    } catch {
      return []
    }
    const scenes: Scene[] = []
    for (const { rel: file, folder } of files) {
      try {
        const raw = await fs.readFile(path.join(dir, file), 'utf-8')
        const scene = JSON.parse(raw) as Scene
        scene._sourceFile = `scenes/${file}`
        if (folder) scene._folder = folder
        if (scene.script) {
          // Migrate any legacy flat script on disk into the block tree.
          scene.script = normalizeScript(scene.script)
        } else if (scene.scriptText) {
          scene.script = compileScriptText(scene.scriptText)
        }
        if (!scene.id) scene.id = file.replace(/\.json$/i, '')
        if (!scene.name) scene.name = scene.id
        scenes.push(scene)
      } catch (err) {
        errors.push(`scenes/${file}: ${(err as Error).message}`)
      }
    }
    scenes.sort((a, b) => a.name.localeCompare(b.name))
    return scenes
  }

  private async loadNotes(errors: string[]): Promise<CampaignNote[]> {
    const dir = path.join(this.campaignPath, 'notes')
    let files: string[] = []
    try {
      files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.json'))
    } catch {
      return []
    }
    const notes: CampaignNote[] = []
    for (const file of files) {
      try {
        const raw = await fs.readFile(path.join(dir, file), 'utf-8')
        const note = JSON.parse(raw) as CampaignNote
        note._sourceFile = `notes/${file}`
        if (note.body) {
          note.body = normalizeScript(note.body)
        } else if (note.bodyText) {
          note.body = compileScriptText(note.bodyText)
        }
        if (!note.id) note.id = file.replace(/\.json$/i, '')
        if (!note.title) note.title = note.id
        if (!note.kind) note.kind = 'note'
        notes.push(note)
      } catch (err) {
        errors.push(`notes/${file}: ${(err as Error).message}`)
      }
    }
    notes.sort((a, b) => a.title.localeCompare(b.title))
    return notes
  }

  private async loadLibrary(errors: string[]): Promise<Library> {
    const libPath = path.join(this.campaignPath, 'library.json')
    try {
      const raw = await fs.readFile(libPath, 'utf-8')
      const lib = JSON.parse(raw) as Library
      if (!Array.isArray(lib.assets)) return { assets: [] }
      return lib
    } catch (err) {
      if (fsSync.existsSync(libPath)) {
        errors.push(`library.json: ${(err as Error).message}`)
      }
      return { assets: [] }
    }
  }

  private startWatching(): void {
    this.stopWatching()
    // Watch only what hot-reloads (scenes/notes/library) — watching the whole
    // campaign paid a startup scan + write-finish polling over thousands of
    // audio files that never reload.
    this.watcher = chokidar.watch(
      [
        path.join(this.campaignPath, 'scenes'),
        path.join(this.campaignPath, 'notes'),
        path.join(this.campaignPath, 'characters'),
        path.join(this.campaignPath, 'maps'),
        path.join(this.campaignPath, 'table.json'),
        path.join(this.campaignPath, 'party.json'),
        path.join(this.campaignPath, 'library.json')
      ],
      {
        ignoreInitial: true,
        depth: 2,
        awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
      }
    )
    const trigger = () => {
      if (this.reloadTimer) clearTimeout(this.reloadTimer)
      this.reloadTimer = setTimeout(async () => {
        // Our own writes already broadcast fresh state from their handlers —
        // suppress the watcher echo (chokidar stability + this debounce put the
        // event ~500ms after the write; 1500ms covers slow disks comfortably).
        // BUT an event inside the window might be an EXTERNAL edit (Claude
        // authoring a file mid-autosave) — DEFER the reload past the window
        // instead of dropping it, so external changes are never silently lost.
        const since = Date.now() - this.lastInternalWrite
        if (since < 1500) {
          this.reloadTimer = setTimeout(trigger, 1500 - since + 100)
          return
        }
        this.onChange(await this.load())
      }, 200)
    }
    this.watcher.on('add', trigger).on('change', trigger).on('unlink', trigger)
  }

  private stopWatching(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

  /**
   * Existence sweep for referenced assets (🔎 Probe): fs.access only — no
   * reads, no decode. The old renderer-side probe fetched EVERY file through
   * the asset:// handler (whole-file reads), ballooning memory with a large
   * library; missing-file detection is all the check actually needs.
   */
  async probeFiles(files: string[]): Promise<string[]> {
    const root = path.resolve(this.campaignPath)
    const missing: string[] = []
    for (const rel of files) {
      const abs = path.resolve(root, rel)
      if (!abs.startsWith(root + path.sep)) {
        missing.push(rel)
        continue
      }
      try {
        await fs.access(abs)
      } catch {
        missing.push(rel)
      }
    }
    return missing
  }

  async choose(): Promise<CampaignState | null> {
    const res = await dialog.showOpenDialog({
      title: 'Choose campaign folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    this.campaignPath = res.filePaths[0]
    writeConfig({ campaignPath: this.campaignPath })
    await this.ensureStructure(this.campaignPath)
    this.startWatching()
    return this.load()
  }

  /** Persist an edited scene back to its JSON file. Writes structured `script`. */
  async saveScene(scene: Scene): Promise<CampaignState> {
    const rel = scene._sourceFile
    if (!rel) throw new Error('scene has no source file to save to')
    // Strip runtime-only fields; scriptText is dropped in favour of structured script.
    const { _sourceFile, _folder, scriptText, ...rest } = scene
    void _sourceFile
    void _folder
    void scriptText
    const dest = path.join(this.campaignPath, rel)
    const root = path.resolve(this.campaignPath)
    if (!path.resolve(dest).startsWith(root + path.sep)) {
      throw new Error('refusing to write outside campaign folder')
    }
    await writeJsonAtomic(dest, rest)
    this.markWrite()
    return this.load()
  }

  /**
   * Write a brand-new scene JSON into scenes/, deriving a unique slug filename
   * (and matching id) from the scene name — appends -2, -3… on collision with
   * existing files or scene ids. Returns the fresh state plus the new scene's
   * id so the renderer can select it. The folder watcher also picks up the new
   * file, but returning state directly makes the UI update immediate.
   */
  private async writeNewScene(
    scene: SceneTemplate & { id?: string }
  ): Promise<{ state: CampaignState; sceneId: string }> {
    const dir = path.join(this.campaignPath, 'scenes')
    await fs.mkdir(dir, { recursive: true })
    const taken = new Set((await fs.readdir(dir)).map((f) => f.toLowerCase().replace(/\.json$/i, '')))
    for (const s of await this.loadScenes([])) taken.add(s.id.toLowerCase())
    const base = slugify(scene.name)
    let stem = base
    for (let n = 2; taken.has(stem); n++) stem = `${base}-${n}`
    // Strip runtime/stale fields; the filename stem becomes the scene id.
    const { _sourceFile, _folder, id: _oldId, ...rest } = scene as Scene
    void _sourceFile
    void _folder
    void _oldId
    await writeJsonAtomic(path.join(dir, `${stem}.json`), { id: stem, ...rest })
    this.markWrite()
    return { state: await this.load(), sceneId: stem }
  }

  /** Duplicate a scene to a new scenes/<slug>.json named "Copy of X". */
  async duplicateScene(sceneId: string): Promise<{ state: CampaignState; sceneId: string }> {
    const scenes = await this.loadScenes([])
    const scene = scenes.find((s) => s.id === sceneId)
    if (!scene?._sourceFile) throw new Error(`scene "${sceneId}" not found`)
    // Copy the on-disk JSON (preserving scriptText / authored form) rather than
    // the runtime object, so the duplicate is a faithful copy of the file.
    const raw = JSON.parse(
      await fs.readFile(path.join(this.campaignPath, scene._sourceFile), 'utf-8')
    ) as Scene
    return this.writeNewScene({ ...raw, name: `Copy of ${scene.name}` })
  }

  /** Create a new scene from a built-in template (unknown ids fall back to blank). */
  async createScene(templateId: string): Promise<{ state: CampaignState; sceneId: string }> {
    const template = SCENE_TEMPLATES[templateId] ?? SCENE_TEMPLATES.blank
    return this.writeNewScene(structuredClone(template))
  }

  /** Move a scene's JSON to the OS trash (recoverable — never a hard delete). */
  async deleteScene(sceneId: string): Promise<CampaignState> {
    const scene = (await this.loadScenes([])).find((s) => s.id === sceneId)
    if (!scene?._sourceFile) throw new Error(`scene "${sceneId}" not found`)
    const abs = path.join(this.campaignPath, scene._sourceFile)
    const root = path.resolve(this.campaignPath)
    if (!path.resolve(abs).startsWith(root + path.sep)) {
      throw new Error('refusing to delete outside campaign folder')
    }
    await shell.trashItem(abs)
    this.markWrite()
    return this.load()
  }

  // --- Campaign notes (see NOTES-PLAN.md) ---------------------------------

  /** Persist an edited note back to its JSON file. Writes structured `body`. */
  async saveNote(note: CampaignNote): Promise<CampaignState> {
    const rel = note._sourceFile
    if (!rel) throw new Error('note has no source file to save to')
    // Strip runtime-only fields; bodyText is dropped in favour of structured body.
    const { _sourceFile, bodyText, ...rest } = note
    void _sourceFile
    void bodyText
    rest.updatedAt = new Date().toISOString()
    const dest = path.join(this.campaignPath, rel)
    const root = path.resolve(this.campaignPath)
    if (!path.resolve(dest).startsWith(root + path.sep)) {
      throw new Error('refusing to write outside campaign folder')
    }
    await writeJsonAtomic(dest, rest)
    this.markWrite()
    return this.load()
  }

  /**
   * Create a new note of `kind`, deriving a unique slug filename/id from the
   * title. Starter bodyText shows the shape without demanding fields (the
   * session kind gets a Lazy-DM-style prep skeleton).
   */
  async createNote(
    kind: NoteKind,
    title: string
  ): Promise<{ state: CampaignState; noteId: string }> {
    const dir = path.join(this.campaignPath, 'notes')
    await fs.mkdir(dir, { recursive: true })
    const taken = new Set(
      (await fs.readdir(dir)).map((f) => f.toLowerCase().replace(/\.json$/i, ''))
    )
    for (const n of await this.loadNotes([])) taken.add(n.id.toLowerCase())
    const base = slugify(title || kind)
    let stem = base
    for (let n = 2; taken.has(stem); n++) stem = `${base}-${n}`
    const note: Omit<CampaignNote, '_sourceFile'> = {
      id: stem,
      kind,
      title: title || stem,
      bodyText: NOTE_STARTERS[kind] ?? '',
      createdAt: new Date().toISOString()
    }
    await writeJsonAtomic(path.join(dir, `${stem}.json`), note)
    this.markWrite()
    return { state: await this.load(), noteId: stem }
  }

  /** Move a note's JSON to the OS trash (recoverable — never a hard delete). */
  async deleteNote(noteId: string): Promise<CampaignState> {
    const note = (await this.loadNotes([])).find((n) => n.id === noteId)
    if (!note?._sourceFile) throw new Error(`note "${noteId}" not found`)
    const abs = path.join(this.campaignPath, note._sourceFile)
    const root = path.resolve(this.campaignPath)
    if (!path.resolve(abs).startsWith(root + path.sep)) {
      throw new Error('refusing to delete outside campaign folder')
    }
    await shell.trashItem(abs)
    this.markWrite()
    return this.load()
  }

  /** Copy user-picked files into the campaign's <kind> folder and index them. */
  async importAssets(kind: AssetKind): Promise<CampaignState> {
    const res = await dialog.showOpenDialog({
      title: `Import ${kind} files`,
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'ogg', 'wav', 'flac', 'm4a', 'opus', 'webm'] }]
    })
    if (res.canceled) return this.load()

    const destDir = path.join(this.campaignPath, kind)
    await fs.mkdir(destDir, { recursive: true })
    const lib = await this.loadLibrary([])
    const known = new Set(lib.assets.map((a) => a.file))

    for (const src of res.filePaths) {
      // Collision-rename (-2, -3…) like every other copy path — a same-named
      // import must never silently overwrite an existing campaign file.
      const ext = path.extname(src)
      const stem = path.basename(src, ext)
      const base = await this.copyUnique(src, destDir, stem, ext)
      const rel = `${kind}/${base}`
      if (!known.has(rel)) {
        lib.assets.push({ file: rel, kind, tags: [], source: 'user-upload', license: 'owned' })
        known.add(rel)
      }
    }
    await writeJsonAtomic(path.join(this.campaignPath, 'library.json'), lib)
    this.markWrite()
    return this.load()
  }

  /**
   * Pick image files via the OS dialog, COPY them (sources are never touched)
   * into <campaign>/art/ — appending -2, -3… on filename collision, same
   * pattern as triageKeep — and append SceneImage entries to the given scene,
   * saved through the normal scene-save path. Returns null if canceled.
   */
  async importSceneImages(
    sceneId: string
  ): Promise<{ state: CampaignState; added: number } | null> {
    const res = await dialog.showOpenDialog({
      title: 'Import images',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }]
    })
    if (res.canceled || res.filePaths.length === 0) return null

    const scene = (await this.loadScenes([])).find((s) => s.id === sceneId)
    if (!scene?._sourceFile) throw new Error(`scene "${sceneId}" not found`)

    const destDir = path.join(this.campaignPath, 'art')
    await fs.mkdir(destDir, { recursive: true })
    const images: SceneImage[] = []
    for (const src of res.filePaths) {
      const ext = path.extname(src).toLowerCase()
      const stem = slugify(path.basename(src, path.extname(src)))
      const base = await this.copyUnique(src, destDir, stem, ext)
      images.push({ file: `art/${base}` })
    }
    // Edit the raw on-disk JSON (like duplicateScene) instead of saving the
    // compiled runtime scene — otherwise adding an image would silently
    // convert a Claude-authored scriptText scene to structured `script`.
    const scenePath = path.join(this.campaignPath, scene._sourceFile)
    const raw = JSON.parse(await fs.readFile(scenePath, 'utf-8')) as Scene
    raw.images = [...(raw.images ?? []), ...images]
    await writeJsonAtomic(scenePath, raw)
    this.markWrite()
    return { state: await this.load(), added: images.length }
  }

  /**
   * Patch a library entry (display name / category / tags / trash flag),
   * keyed by its campaign-relative file path. Empty-string name/category
   * clear the field; the file on disk is untouched.
   */
  async updateLibraryAsset(
    file: string,
    patch: Partial<Pick<LibraryAsset, 'name' | 'category' | 'tags' | 'trash' | 'description'>>
  ): Promise<CampaignState> {
    const lib = await this.loadLibrary([])
    const asset = lib.assets.find((a) => a.file === file)
    if (!asset) throw new Error(`asset "${file}" not in library.json`)
    if (patch.name !== undefined) {
      if (patch.name.trim()) asset.name = patch.name.trim()
      else delete asset.name
    }
    if (patch.category !== undefined) {
      // Free-form and multi-value: "combat, tension, nature" files the asset
      // under all three (first = primary/grouping). Each label is slugified so
      // grouping/filtering treat spellings consistently.
      const cats = patch.category
        .split(',')
        .map((c) => c.trim().toLowerCase().replace(/\s+/g, '-'))
        .filter(Boolean)
        .filter((c, i, arr) => arr.indexOf(c) === i)
      if (cats.length > 0) asset.category = cats[0]
      else delete asset.category
      if (cats.length > 1) asset.categories = cats
      else delete asset.categories
    }
    if (patch.description !== undefined) {
      if (patch.description.trim()) asset.description = patch.description.trim()
      else delete asset.description
    }
    if (patch.tags !== undefined) asset.tags = patch.tags
    if (patch.trash !== undefined) {
      if (patch.trash) asset.trash = true
      else delete asset.trash
    }
    await writeJsonAtomic(path.join(this.campaignPath, 'library.json'), lib)
    this.markWrite()
    return this.load()
  }

  /**
   * The blocklist ("never again" list): filename stems of sounds the DM
   * deleted, kept in <campaign>/blocklist.json so future pack imports and
   * triage sessions don't re-add culled sounds under the same name.
   */
  private blocklistPath(): string {
    return path.join(this.campaignPath, 'blocklist.json')
  }

  async readBlocklist(): Promise<{ stem: string; file: string }[]> {
    try {
      const raw = JSON.parse(await fs.readFile(this.blocklistPath(), 'utf-8'))
      return Array.isArray(raw) ? raw : []
    } catch {
      return []
    }
  }

  private async appendBlocklist(entries: { stem: string; file: string }[]): Promise<void> {
    const list = await this.readBlocklist()
    const have = new Set(list.map((e) => e.stem))
    for (const e of entries) {
      if (!have.has(e.stem)) {
        list.push(e)
        have.add(e.stem)
      }
    }
    await writeJsonAtomic(this.blocklistPath(), list)
    this.markWrite()
  }

  /** Filename stem used for blocklist identity: "sfx/fapx-troll-roar-2.ogg" → "fapx-troll-roar-2". */
  private static stemOf(file: string): string {
    return (file.split('/').pop() ?? file).replace(/\.[^.]+$/, '').toLowerCase()
  }

  /**
   * Batch-delete every trash-flagged asset: files → recycle bin, entries
   * dropped, stems blocklisted. Assets still referenced by a scene are
   * skipped (reported back) rather than orphaning cues.
   */
  async purgeTrash(): Promise<{ state: CampaignState; purged: number; skipped: string[] }> {
    const lib = await this.loadLibrary([])
    const scenes = await this.loadScenes([])
    const referenced = new Set<string>()
    for (const s of scenes) {
      s.music?.forEach((m) => referenced.add(m.file))
      s.ambience?.forEach((a) => referenced.add(a.file))
      s.sfx?.forEach((x) => referenced.add(x.file))
    }
    const skipped: string[] = []
    const blocked: { stem: string; file: string }[] = []
    const keep: LibraryAsset[] = []
    for (const a of lib.assets) {
      if (!a.trash) {
        keep.push(a)
        continue
      }
      if (referenced.has(a.file)) {
        skipped.push(a.file)
        keep.push(a)
        continue
      }
      const abs = path.resolve(this.campaignPath, a.file)
      if (abs.startsWith(path.resolve(this.campaignPath) + path.sep) && fsSync.existsSync(abs)) {
        await shell.trashItem(abs)
      }
      blocked.push({ stem: CampaignManager.stemOf(a.file), file: a.file })
    }
    lib.assets = keep
    await writeJsonAtomic(path.join(this.campaignPath, 'library.json'), lib)
    this.markWrite()
    if (blocked.length > 0) await this.appendBlocklist(blocked)
    return { state: await this.load(), purged: blocked.length, skipped }
  }

  /**
   * Delete a library asset for real: refuse if any scene still references the
   * file (deleting would leave dead cues); otherwise move the file to the OS
   * trash and drop the library entry.
   */
  async deleteLibraryAsset(file: string): Promise<CampaignState> {
    const scenes = await this.loadScenes([])
    const users = scenes.filter(
      (s) =>
        s.music?.some((m) => m.file === file) ||
        s.ambience?.some((a) => a.file === file) ||
        s.sfx?.some((x) => x.file === file)
    )
    if (users.length > 0) {
      throw new Error(`still used by: ${users.map((s) => s.name).join(', ')} — remove it from those scenes first`)
    }
    const abs = path.resolve(this.campaignPath, file)
    const root = path.resolve(this.campaignPath)
    if (!abs.startsWith(root + path.sep)) throw new Error('refusing to delete outside campaign folder')
    if (fsSync.existsSync(abs)) await shell.trashItem(abs)
    const lib = await this.loadLibrary([])
    lib.assets = lib.assets.filter((a) => a.file !== file)
    await writeJsonAtomic(path.join(this.campaignPath, 'library.json'), lib)
    this.markWrite()
    await this.appendBlocklist([{ stem: CampaignManager.stemOf(file), file }])
    return this.load()
  }

  /** Replace the campaign's playlist presets (stored in library.json). */
  async savePlaylistPresets(presets: PlaylistPreset[]): Promise<CampaignState> {
    const libPath = path.join(this.campaignPath, 'library.json')
    let raw: Library = { assets: [] }
    try {
      raw = JSON.parse(await fs.readFile(libPath, 'utf-8')) as Library
    } catch {
      /* fresh library */
    }
    raw.playlists = presets
    await writeJsonAtomic(libPath, raw)
    this.markWrite()
    return this.load()
  }

  // --- Sound triage (review inbox for a drop folder of candidates) ---

  private triageRoot: string | null = null
  private triageSeq = 0
  private triageToken: string | null = null

  /** Current triage session, if any — the asset:// handler serves `.triage/<token>/…` from its root. */
  get triage(): { root: string; token: string } | null {
    return this.triageRoot && this.triageToken
      ? { root: this.triageRoot, token: this.triageToken }
      : null
  }

  /** Pick a drop folder and scan it recursively for audio candidates. Read-only. */
  async triagePick(): Promise<TriageScan | null> {
    const res = await dialog.showOpenDialog({
      title: 'Choose a drop folder of sound candidates',
      properties: ['openDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const root = res.filePaths[0]
    const files: TriageScan['files'] = []
    const walk = async (dir: string): Promise<void> => {
      let entries: fsSync.Dirent[]
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return // unreadable subfolder — skip, don't abort the scan
      }
      for (const e of entries) {
        const abs = path.join(dir, e.name)
        if (e.isDirectory()) await walk(abs)
        else if (e.isFile() && TRIAGE_AUDIO_EXTS.has(path.extname(e.name).toLowerCase())) {
          files.push({
            rel: path.relative(root, abs).split(path.sep).join('/'),
            size: (await fs.stat(abs)).size
          })
        }
      }
    }
    await walk(root)
    files.sort((a, b) => a.rel.localeCompare(b.rel))
    this.triageRoot = root
    // Token namespaces audition URLs per session so the renderer's decode
    // cache can't serve a stale buffer from a previous drop folder.
    this.triageToken = String(++this.triageSeq)
    return { root, token: this.triageToken, files }
  }

  /**
   * Keep a triage candidate: COPY it (source file is never modified/deleted)
   * into the campaign's <kind>/ folder — appending -2, -3… on filename
   * collision — and index it in library.json.
   */
  async triageKeep(req: TriageKeepRequest): Promise<CampaignState> {
    if (!this.triageRoot) throw new Error('no triage session in progress')
    const root = path.resolve(this.triageRoot)
    const src = path.resolve(root, req.rel)
    if (!src.startsWith(root + path.sep)) throw new Error('candidate outside the drop folder')
    const ext = path.extname(req.rel).toLowerCase()
    const stem = slugify(req.name.trim() || path.basename(req.rel, path.extname(req.rel)))
    // "Never again": a previously-deleted sound is refused by name — renaming
    // it in the keep form is the deliberate override.
    const blocklist = await this.readBlocklist()
    if (blocklist.some((b) => b.stem === stem.toLowerCase())) {
      throw new Error(`"${stem}" was deleted before (blocklist.json) — rename it to keep anyway`)
    }
    const destDir = path.join(this.campaignPath, req.kind)
    await fs.mkdir(destDir, { recursive: true })
    const base = await this.copyUnique(src, destDir, stem, ext)
    const lib = await this.loadLibrary([])
    const asset: LibraryAsset = { file: `${req.kind}/${base}`, kind: req.kind, tags: req.tags }
    if (req.category) asset.category = req.category
    if (req.source) asset.source = req.source
    if (req.license) asset.license = req.license
    lib.assets.push(asset)
    await writeJsonAtomic(path.join(this.campaignPath, 'library.json'), lib)
    this.markWrite()
    return this.load()
  }

  dispose(): void {
    this.stopWatching()
  }
}
