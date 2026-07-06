import { app, dialog } from 'electron'
import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import * as path from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import type { AssetKind, CampaignState, Library, LibraryAsset, Scene } from '../shared/types'
import type { TriageKeepRequest, TriageScan } from '../preload/index'
import { compileScriptText, normalizeScript } from '../shared/scriptCompile'
import { AUTHORING_MD } from './authoring'

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'hearth-config.json')
const SUBFOLDERS = ['scenes', 'music', 'ambience', 'sfx', 'art']
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

function readConfig(): Config {
  try {
    return JSON.parse(fsSync.readFileSync(CONFIG_FILE(), 'utf-8'))
  } catch {
    return {}
  }
}

function writeConfig(cfg: Config): void {
  fsSync.writeFileSync(CONFIG_FILE(), JSON.stringify(cfg, null, 2))
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

  constructor(private onChange: (state: CampaignState) => void) {
    this.campaignPath = readConfig().campaignPath ?? defaultCampaignPath()
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
      await fs.writeFile(libPath, JSON.stringify({ assets: [] }, null, 2))
    }
    const authoringPath = path.join(root, 'AUTHORING.md')
    if (!fsSync.existsSync(authoringPath)) {
      await fs.writeFile(authoringPath, AUTHORING_MD)
    }
  }

  async load(): Promise<CampaignState> {
    const errors: string[] = []
    const scenes = await this.loadScenes(errors)
    const library = await this.loadLibrary(errors)
    return { path: this.campaignPath, scenes, library, errors }
  }

  private async loadScenes(errors: string[]): Promise<Scene[]> {
    const dir = path.join(this.campaignPath, 'scenes')
    let files: string[] = []
    try {
      files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.json'))
    } catch {
      return []
    }
    const scenes: Scene[] = []
    for (const file of files) {
      try {
        const raw = await fs.readFile(path.join(dir, file), 'utf-8')
        const scene = JSON.parse(raw) as Scene
        scene._sourceFile = `scenes/${file}`
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
    this.watcher = chokidar.watch(this.campaignPath, {
      ignoreInitial: true,
      depth: 3,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
    })
    const trigger = () => {
      if (this.reloadTimer) clearTimeout(this.reloadTimer)
      this.reloadTimer = setTimeout(async () => {
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
    const { _sourceFile, scriptText, ...rest } = scene
    void _sourceFile
    void scriptText
    const dest = path.join(this.campaignPath, rel)
    const root = path.resolve(this.campaignPath)
    if (!path.resolve(dest).startsWith(root + path.sep)) {
      throw new Error('refusing to write outside campaign folder')
    }
    await fs.writeFile(dest, JSON.stringify(rest, null, 2))
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
    const { _sourceFile, id: _oldId, ...rest } = scene as Scene
    void _sourceFile
    void _oldId
    await fs.writeFile(path.join(dir, `${stem}.json`), JSON.stringify({ id: stem, ...rest }, null, 2))
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
      const base = path.basename(src)
      const dest = path.join(destDir, base)
      await fs.copyFile(src, dest)
      const rel = `${kind}/${base}`
      if (!known.has(rel)) {
        lib.assets.push({ file: rel, kind, tags: [], source: 'user-upload', license: 'owned' })
        known.add(rel)
      }
    }
    await fs.writeFile(
      path.join(this.campaignPath, 'library.json'),
      JSON.stringify(lib, null, 2)
    )
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
    const destDir = path.join(this.campaignPath, req.kind)
    await fs.mkdir(destDir, { recursive: true })
    let base = `${stem}${ext}`
    for (let n = 2; fsSync.existsSync(path.join(destDir, base)); n++) base = `${stem}-${n}${ext}`
    await fs.copyFile(src, path.join(destDir, base), fsSync.constants.COPYFILE_EXCL)
    const lib = await this.loadLibrary([])
    const asset: LibraryAsset = { file: `${req.kind}/${base}`, kind: req.kind, tags: req.tags }
    if (req.category) asset.category = req.category
    if (req.source) asset.source = req.source
    if (req.license) asset.license = req.license
    lib.assets.push(asset)
    await fs.writeFile(path.join(this.campaignPath, 'library.json'), JSON.stringify(lib, null, 2))
    return this.load()
  }

  dispose(): void {
    this.stopWatching()
  }
}
