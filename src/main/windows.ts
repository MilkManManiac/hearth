import { app, BrowserWindow, screen } from 'electron'
import * as path from 'path'
import { readFileSync } from 'fs'
import { writeFile, mkdir, rename } from 'fs/promises'

// SURFACES-PLAN M3 — the window split. Table (⚔ maps + tracker) and Party
// (🛡 sheets) graduate from console overlays to real windows. One engine:
// these windows are extra renderers over the SAME main-process campaign
// state — every mutation IPCs to main and broadcasts back to all windows.

export type WindowRole = 'table' | 'party'

interface RoleBounds {
  x?: number
  y?: number
  width: number
  height: number
}

const DEFAULTS: Record<WindowRole, RoleBounds> = {
  table: { width: 1280, height: 860 },
  party: { width: 1180, height: 820 }
}

const TITLES: Record<WindowRole, string> = {
  table: 'Hearth — ⚔ Table',
  party: 'Hearth — 🛡 Party'
}

/**
 * Per-role singleton windows with remembered bounds (a tiny
 * electron-window-state: userData/window-state.json, merge-written).
 */
export class WindowManager {
  private windows = new Map<WindowRole, BrowserWindow>()
  private saveTimer: NodeJS.Timeout | null = null
  private statePath = path.join(app.getPath('userData'), 'window-state.json')

  constructor(
    private preloadPath: string,
    private loadRenderer: (win: BrowserWindow, hash?: string) => void
  ) {}

  /** Open (or focus) the singleton window for a role. */
  open(role: WindowRole): BrowserWindow {
    const existing = this.windows.get(role)
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore()
      existing.focus()
      return existing
    }
    const bounds = this.savedBounds(role)
    const win = new BrowserWindow({
      ...bounds,
      minWidth: 900,
      minHeight: 620,
      backgroundColor: '#14110f',
      title: TITLES[role],
      autoHideMenuBar: true,
      webPreferences: {
        preload: this.preloadPath,
        sandbox: false,
        // The Table window keeps its Konva canvas rendering while the DM's
        // focus is on the console (tokens must move live, unfocused).
        backgroundThrottling: role !== 'table'
      }
    })
    // The window root sets document.title to the role title on mount
    // (index.html's own <title> briefly shows plain "Hearth" while loading).
    this.loadRenderer(win, role)
    const remember = () => this.queueSave(role, win)
    win.on('move', remember)
    win.on('resize', remember)
    win.on('closed', () => this.windows.delete(role))
    this.windows.set(role, win)
    return win
  }

  get(role: WindowRole): BrowserWindow | null {
    const win = this.windows.get(role)
    return win && !win.isDestroyed() ? win : null
  }

  private savedBounds(role: WindowRole): RoleBounds {
    try {
      const all = JSON.parse(readFileSync(this.statePath, 'utf8')) as Record<string, RoleBounds>
      const b = all[role]
      if (b && b.width >= 300 && b.height >= 200 && this.onScreen(b)) return b
    } catch {
      /* first run / corrupt state — use defaults */
    }
    return DEFAULTS[role]
  }

  /** A remembered position must still touch a connected display (monitors change). */
  private onScreen(b: RoleBounds): boolean {
    if (b.x === undefined || b.y === undefined) return true
    return screen.getAllDisplays().some((d) => {
      const a = d.workArea
      return (
        b.x! < a.x + a.width - 40 && b.x! + b.width > a.x + 40 && b.y! >= a.y - 20 && b.y! < a.y + a.height - 40
      )
    })
  }

  private queueSave(role: WindowRole, win: BrowserWindow): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      if (win.isDestroyed() || win.isMinimized()) return
      void this.persist(role, win.getBounds())
    }, 600)
  }

  private async persist(role: WindowRole, bounds: RoleBounds): Promise<void> {
    try {
      let all: Record<string, RoleBounds> = {}
      try {
        all = JSON.parse(readFileSync(this.statePath, 'utf8'))
      } catch {
        /* no prior state */
      }
      all[role] = bounds
      await mkdir(path.dirname(this.statePath), { recursive: true })
      // tmp + rename so a crash mid-write can't truncate the file.
      const tmp = `${this.statePath}.tmp`
      await writeFile(tmp, JSON.stringify(all, null, 2), 'utf8')
      await rename(tmp, this.statePath)
    } catch {
      /* window-state is a nicety — never let it throw */
    }
  }
}
