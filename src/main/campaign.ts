import { app, dialog } from 'electron'
import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import * as path from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import type { AssetKind, CampaignState, Library, Scene } from '../shared/types'
import { compileScriptText } from '../shared/scriptCompile'
import { AUTHORING_MD } from './authoring'

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'hearth-config.json')
const SUBFOLDERS = ['scenes', 'music', 'ambience', 'sfx', 'art']

interface Config {
  campaignPath?: string
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
        if (!scene.script && scene.scriptText) {
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

  dispose(): void {
    this.stopWatching()
  }
}
