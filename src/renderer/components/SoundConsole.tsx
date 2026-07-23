import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  assetCategories,
  assetDisplayName,
  categoryMeta,
  type AssetKind,
  type LibraryAsset,
  type PlaylistPreset
} from '../../shared/types'
import { fuzzyScore } from '../lib/fuzzy'
import { isTypingTarget } from '../lib/keys'
import { pushRecent, useFavorites } from '../lib/prefs'
import { engine, useStore } from '../store'
import DangerButton from './DangerButton'
import { VolumeFader } from './Mixer'

/** "music/nox-rain-strong.ogg" → "nox-rain-strong" */
function stem(file: string): string {
  return (file.split('/').pop() ?? file).replace(/\.[^.]+$/, '')
}

/** Stable empty fallback — a `?? []` inside a selector would loop React. */
const NO_PRESETS: PlaylistPreset[] = []

const KIND_CHIP: Record<AssetKind, string> = {
  music: 'border-hearth-ember/60 text-hearth-ember hover:bg-hearth-ember/20',
  ambience: 'border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/20',
  sfx: 'border-hearth-gold/60 text-hearth-gold hover:bg-hearth-gold/20'
}
const KIND_LIT: Record<AssetKind, string> = {
  music: 'bg-hearth-ember/20 shadow-ember',
  ambience: 'bg-emerald-500/20',
  sfx: 'bg-hearth-gold/20'
}

// What each kind IS, spelled out — the old ♪/〜/🔊 glyphs read as noise live.
const KIND_BADGE_TEXT: Record<AssetKind, string> = { music: 'MUS', ambience: 'AMB', sfx: 'SFX' }
const KIND_BADGE_TITLE: Record<AssetKind, string> = {
  music: 'Music track — one at a time, crossfades',
  ambience: 'Ambience bed — loops, layers freely',
  sfx: 'Sound effect — one-shot (or a held loop)'
}
const KIND_BADGE_CLASS: Record<AssetKind, string> = {
  music: 'bg-hearth-ember/25 text-hearth-ember',
  ambience: 'bg-emerald-500/25 text-emerald-300',
  sfx: 'bg-hearth-gold/25 text-hearth-gold'
}

/** Tiny explicit kind tag: MUS / AMB / SFX. */
function KindBadge({ kind }: { kind: AssetKind }) {
  return (
    <span
      title={KIND_BADGE_TITLE[kind]}
      className={`rounded-sm px-1 py-px text-[8px] font-bold leading-none tracking-wider ${KIND_BADGE_CLASS[kind]}`}
    >
      {KIND_BADGE_TEXT[kind]}
    </span>
  )
}

/**
 * Mood/category info for a chip. `moods` are readable text tags (categories
 * minus the bulk-utility ones); `untagged` marks assets that still need a
 * sorting pass — exactly the ones to hit with ✎ in the Library.
 */
export interface MoodInfo {
  moods: string[]
  untagged: boolean
}

/** Readable mood tags (max 2 shown) or a "needs tagging" marker. */
function MoodTags({ info }: { info: MoodInfo | null }) {
  if (!info) return null
  if (info.untagged) {
    return (
      <span
        title="No category/mood yet — tag it via ✎ in the Library (📚)"
        className="rounded-sm bg-white/10 px-1 py-px text-[8px] font-bold leading-none tracking-wider text-hearth-muted"
      >
        ?
      </span>
    )
  }
  if (info.moods.length === 0) return null
  return (
    <span
      title={`Mood: ${info.moods.join(', ')}`}
      className="max-w-[7rem] truncate text-[9px] lowercase leading-none tracking-wide text-hearth-muted"
    >
      {info.moods.slice(0, 2).join(' · ')}
    </span>
  )
}

function RowLabel({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="w-16 flex-none pt-1 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted"
    >
      {children}
    </span>
  )
}

/** The tracks of the currently-playing queue, for the ≡ jump menu. */
export interface QueueInfo {
  tracks: string[]
  /** Index of the track currently sounding. */
  current: number
  /** Jump straight to a track (crossfades). */
  onJump: (index: number) => void
}

/**
 * ≡ button + popover listing the active queue's tracks — click one to jump.
 * The whole point of this addition: pick a specific song in a playlist instead
 * of only being able to skip forward. The list renders in a portal (fixed,
 * anchored above the button) so it escapes the console's `overflow` clipping
 * and floats over the script area instead of being cut off.
 */
function QueueMenu({ queue }: { queue: QueueInfo }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ right: number; bottom: number } | null>(null)

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ right: window.innerWidth - r.right, bottom: window.innerHeight - r.top + 6 })
  }

  useEffect(() => {
    if (!open) return
    place()
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onScrollOrResize = () => place()
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('resize', onScrollOrResize)
    // Capture-phase scroll so the console scrolling repositions the menu too.
    window.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        title="Pick a track in this playlist"
        className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] leading-none hover:bg-black/30 hover:opacity-100 ${
          open ? 'opacity-100' : 'opacity-70'
        }`}
      >
        ☰
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', right: pos.right, bottom: pos.bottom }}
            onPointerDown={(e) => e.stopPropagation()}
            className="z-50 flex max-h-72 w-64 flex-col overflow-y-auto rounded-md border border-hearth-border bg-hearth-panel2 py-1 shadow-2xl"
          >
            <div className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
              Jump to track
            </div>
            {queue.tracks.map((file, i) => (
              <button
                key={`${file}:${i}`}
                onClick={() => {
                  queue.onJump(i)
                  setOpen(false)
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-left text-xs transition-colors hover:bg-hearth-ember/15 ${
                  i === queue.current ? 'text-hearth-ember' : 'text-hearth-text'
                }`}
                title={file}
              >
                <span className="w-4 flex-none text-center" aria-hidden>
                  {i === queue.current ? '▶' : ''}
                </span>
                <span className="truncate">{stem(file)}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}

const VIBE_RESULT_CAP = 14
const VIBE_KIND_ORDER: Record<AssetKind, number> = { music: 0, ambience: 1, sfx: 2 }

/**
 * 🔥 Vibe — sounds on the fly, for when the table goes off-script (it always
 * does). One box: type any word (mood, song name, "rain") for ranked matches,
 * or focus it empty to browse the library's vibes (moods + categories) as
 * chips. Clicking a result fires it through the same path as staples — music
 * crossfades, beds toggle/layer, SFX one-shot — and the list STAYS OPEN so a
 * bed + track can be layered in two clicks.
 */
function QuickFire() {
  const assets = useStore((s) => s.campaign.library.assets)
  const status = useStore((s) => s.status)
  const fireFavorite = useStore((s) => s.fireFavorite)
  const [q, setQ] = useState('')
  // Multi-select: a table moment is several vibes at once — "campfire" =
  // chill music + fire + forest. Union of everything picked.
  const [vibes, setVibes] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(0)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null)

  const query = q.trim().toLowerCase()

  // Vibe chips: every mood/category actually present on non-trash assets,
  // busiest first — the browse surface IS the categorization, so sorting the
  // library directly improves this menu.
  const vibeChips = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of assets) {
      if (a.trash) continue
      for (const m of a.moods ?? []) counts.set(m, (counts.get(m) ?? 0) + 1)
      for (const c of assetCategories(a)) counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    return [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 18)
  }, [assets])

  const results = useMemo(() => {
    const live = assets.filter((a) => !a.trash)
    if (query.length >= 2) {
      // Same relevance shape as the Library browser: name > mood > category >
      // tag, with a nudge for auditioned (🎧) sounds — trusted picks surface first.
      const scored = live
        .map((a) => {
          const name = assetDisplayName(a).toLowerCase()
          let s = fuzzyScore(name, query) * 3
          for (const m of a.moods ?? []) s = Math.max(s, fuzzyScore(m, query) * 2.5)
          for (const c of assetCategories(a)) s = Math.max(s, fuzzyScore(c, query) * 2)
          for (const t of a.tags) s = Math.max(s, fuzzyScore(t, query) * 1.5)
          if (s === 0 && a.file.toLowerCase().includes(query)) s = 20
          return { a, s: s > 0 ? s + (a.heard ? 5 : 0) : 0 }
        })
        .filter((x) => x.s > 0)
      scored.sort((x, y) => y.s - x.s)
      return scored.map((x) => x.a)
    }
    if (vibes.size > 0) {
      return live
        .filter(
          (a) =>
            (a.moods ?? []).some((m) => vibes.has(m)) ||
            assetCategories(a).some((c) => vibes.has(c))
        )
        .sort(
          (a, b) =>
            VIBE_KIND_ORDER[a.kind] - VIBE_KIND_ORDER[b.kind] ||
            Number(!!b.heard) - Number(!!a.heard) ||
            assetDisplayName(a).localeCompare(assetDisplayName(b))
        )
    }
    return []
  }, [assets, query, vibes])

  const shown = results.slice(0, VIBE_RESULT_CAP)

  const place = () => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (r) setPos({ left: r.left, bottom: window.innerHeight - r.top + 6 })
  }
  useEffect(() => {
    if (!open) return
    place()
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || boxRef.current?.contains(t)) return
      setOpen(false)
    }
    const onScrollOrResize = () => place()
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [open])

  useEffect(() => setSel(0), [query, vibes])

  const fire = (a: LibraryAsset) => {
    fireFavorite(a.file)
    pushRecent(a.file)
  }

  const litOf = (a: LibraryAsset) =>
    (a.kind === 'music' && status.activeMusicId === a.file) ||
    (a.kind === 'ambience' && status.ambienceFiles.includes(a.file))

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      e.currentTarget.blur()
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(s + 1, Math.max(shown.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' && shown[sel]) {
      e.preventDefault()
      fire(shown[sel])
    }
  }

  return (
    <div className="flex items-center gap-2">
      <RowLabel title="Vibes on the fly — search any sound, or browse by mood/category, and fire it instantly. Music crossfades, beds layer, SFX one-shot; the list stays open for layering.">
        🔥 Vibe
      </RowLabel>
      <div ref={wrapRef}>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="mood, song, sound… Enter plays it"
          className="w-64 rounded-full border border-hearth-border bg-hearth-panel2 px-3 py-1 text-sm text-hearth-text placeholder:text-hearth-muted/60 focus:border-hearth-ember/60 focus:outline-none"
        />
      </div>
      {open &&
        pos &&
        createPortal(
          <div
            ref={boxRef}
            style={{ position: 'fixed', left: pos.left, bottom: pos.bottom }}
            onPointerDown={(e) => e.stopPropagation()}
            className="z-50 flex max-h-80 w-[26rem] flex-col overflow-y-auto rounded-md border border-hearth-border bg-hearth-panel2 p-2 shadow-2xl"
          >
            {query.length < 2 && (
              <>
                <div className="flex items-center gap-2 px-1 pb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
                    Pick vibes (stack as many as fit the moment)
                  </span>
                  {vibes.size > 0 && (
                    <button
                      onClick={() => setVibes(new Set())}
                      className="text-[10px] text-hearth-muted hover:text-hearth-text"
                    >
                      ✕ clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 px-1 pb-1.5">
                  {vibeChips.length === 0 && (
                    <span className="text-xs text-hearth-muted">
                      No moods/categories tagged yet — sort sounds in 📚 Library and they show up
                      here.
                    </span>
                  )}
                  {vibeChips.map(([v, n]) => {
                    const on = vibes.has(v)
                    return (
                      <button
                        key={v}
                        onClick={() =>
                          setVibes((prev) => {
                            const next = new Set(prev)
                            if (next.has(v)) next.delete(v)
                            else next.add(v)
                            return next
                          })
                        }
                        className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                          on
                            ? 'border-hearth-gold bg-hearth-gold/15 text-hearth-gold'
                            : 'border-hearth-border bg-hearth-panel text-hearth-muted hover:border-hearth-ember/60 hover:text-hearth-text'
                        }`}
                      >
                        {v} <span className={on ? 'text-hearth-gold/60' : 'text-hearth-muted/60'}>{n}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
            {(query.length >= 2 || vibes.size > 0) && (
              <>
                {shown.length === 0 && (
                  <div className="px-1 py-2 text-xs text-hearth-muted">
                    No match — try another word, or tag more sounds in 📚 Library.
                  </div>
                )}
                {shown.map((a, i) => {
                  const lit = litOf(a)
                  return (
                    <button
                      key={a.file}
                      onClick={() => fire(a)}
                      className={`flex items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors ${
                        i === sel ? 'bg-hearth-ember/15' : 'hover:bg-hearth-ember/10'
                      } ${lit ? 'text-hearth-ember' : 'text-hearth-text'}`}
                      title={lit ? 'Sounding — click to stop' : a.file}
                    >
                      <KindBadge kind={a.kind} />
                      <span className="min-w-0 flex-1 truncate">{assetDisplayName(a)}</span>
                      {(a.moods?.length ?? 0) > 0 && (
                        <span className="max-w-[8rem] truncate text-[10px] lowercase text-hearth-muted">
                          {(a.moods ?? []).slice(0, 2).join(' · ')}
                        </span>
                      )}
                      {a.heard && (
                        <span title="Auditioned" aria-hidden className="text-[10px]">
                          🎧
                        </span>
                      )}
                      {lit && <span aria-hidden>⏹</span>}
                    </button>
                  )
                })}
                {results.length > shown.length && (
                  <div className="px-1.5 pt-1 text-[10px] text-hearth-muted">
                    +{results.length - shown.length} more — keep typing to narrow
                  </div>
                )}
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  )
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/**
 * Live position of the playing music track (elapsed / bar / total), polled off
 * the engine. Click anywhere on the bar to JUMP there — not a hard cut: the
 * engine blends old and new position with a ~1.2s equal-power crossfade.
 */
function MusicScrub() {
  const [p, setP] = useState(() => engine.musicProgress())
  const barRef = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    const t = setInterval(() => setP(engine.musicProgress()), 500)
    return () => clearInterval(t)
  }, [])
  if (!p) return null
  const pct = Math.min(100, (p.elapsed / p.duration) * 100)
  const seekTo = (e: React.PointerEvent) => {
    const r = barRef.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    const ratio = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1)
    engine.seekMusic(ratio * p.duration)
  }
  return (
    <span
      className="flex items-center gap-1.5 text-[10px] tabular-nums text-hearth-muted"
      title="Click to jump — blends to the new spot with a slow crossfade"
    >
      <span>{fmtTime(p.elapsed)}</span>
      <span
        ref={barRef}
        onPointerDown={seekTo}
        className="group/scrub relative h-3 w-36 cursor-pointer"
      >
        <span className="absolute inset-x-0 top-1 h-1 overflow-hidden rounded-full bg-hearth-border">
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-hearth-ember"
            style={{ width: `${pct}%` }}
          />
        </span>
        <span
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-hearth-ember opacity-0 shadow-ember transition-opacity group-hover/scrub:opacity-100"
          style={{ left: `${pct}%` }}
        />
      </span>
      <span>{fmtTime(p.duration)}</span>
    </span>
  )
}

/** A playing item: name + a small (deliberately imprecise) fader + kill. */
function NowChip({
  kind,
  looping,
  label,
  className,
  mood,
  volume,
  defaultVolume,
  onVolume,
  onNext,
  onStop,
  stopTitle,
  queue
}: {
  kind: AssetKind
  /** Show the loop marker (a held SFX loop). */
  looping?: boolean
  label: string
  className: string
  mood?: MoodInfo | null
  volume: number | undefined
  defaultVolume: number
  onVolume: (v: number) => void
  onNext?: () => void
  onStop: () => void
  stopTitle: string
  /** When this chip is a playlist/preset, the queue for the ≡ track picker. */
  queue?: QueueInfo
}) {
  return (
    <span className={`flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-1 text-sm transition-colors ${className}`}>
      <KindBadge kind={kind} />
      {looping && (
        <span aria-hidden title="Held loop — tap ✕ to stop">
          🔁
        </span>
      )}
      <span className="max-w-[10rem] truncate">{label}</span>
      <MoodTags info={mood ?? null} />
      <span className="w-12">
        <VolumeFader value={volume} defaultValue={defaultVolume} onChange={onVolume} />
      </span>
      {queue && queue.tracks.length > 1 && <QueueMenu queue={queue} />}
      {onNext && (
        <button
          onClick={onNext}
          title="Next track"
          className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] leading-none opacity-70 hover:bg-black/30 hover:opacity-100"
        >
          ⏭
        </button>
      )}
      <button
        onClick={onStop}
        title={stopTitle}
        className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] leading-none opacity-60 hover:bg-black/30 hover:opacity-100"
      >
        ✕
      </button>
    </span>
  )
}

/** A fire/toggle chip for the run-mode scene rows and the staples row. */
function FireChip({
  kind,
  label,
  lit,
  mood,
  onClick,
  title,
  extra,
  badge = true,
  hotkey
}: {
  kind: AssetKind
  label: string
  lit: boolean
  mood?: MoodInfo | null
  onClick: () => void
  title: string
  extra?: React.ReactNode
  /** Show the MUS/AMB/SFX tag. Off inside kind-grouped rows (the row label says it). */
  badge?: boolean
  /** Single-key hotkey that fires this in run mode. */
  hotkey?: string
}) {
  return (
    <span
      className={`group flex items-center rounded-full border text-sm transition-colors ${KIND_CHIP[kind]} ${
        lit ? KIND_LIT[kind] : 'bg-hearth-panel2/60'
      }`}
    >
      <button onClick={onClick} title={title} className="flex items-center gap-1.5 py-1 pl-2.5 pr-2">
        {badge && <KindBadge kind={kind} />}
        {lit && <span aria-hidden>⏹</span>}
        {hotkey && (
          <kbd
            title={`Press ${hotkey.toUpperCase()} to fire`}
            className="rounded border border-white/25 bg-black/25 px-1 py-px font-mono text-[9px] uppercase leading-none opacity-80"
          >
            {hotkey}
          </kbd>
        )}
        <span className="max-w-[9rem] truncate">{label}</span>
        <MoodTags info={mood ?? null} />
      </button>
      {extra}
    </span>
  )
}

/**
 * The Sound Console: the always-visible bottom deck that IS the live player.
 * Rows (each only when it has content):
 *   NOW      everything audible, each with a small fader + kill switch
 *   SCENE    (Run mode) the armed scene's tracks / beds / SFX as fire chips —
 *            the whole live surface without scrolling the board mid-read
 *   PLAYLISTS campaign-wide presets (auto-advancing, work in any scene)
 *   STAPLES  ★-favorited library sounds, fireable anywhere
 */
export default function SoundConsole() {
  const status = useStore((s) => s.status)
  const scenes = useStore((s) => s.campaign.scenes)
  const assets = useStore((s) => s.campaign.library.assets)
  const presetsRaw = useStore((s) => s.campaign.library.playlists)
  const presets = presetsRaw ?? NO_PRESETS
  const currentSceneId = useStore((s) => s.currentSceneId)
  const runMode = useStore((s) => s.uiMode === 'run')
  const stopAll = useStore((s) => s.stopAll)
  const playSfx = useStore((s) => s.playSfx)
  const fireFavorite = useStore((s) => s.fireFavorite)
  const togglePresetPlaylist = useStore((s) => s.togglePresetPlaylist)
  const presetStep = useStore((s) => s.presetStep)
  const presetJump = useStore((s) => s.presetJump)
  const presetPos = useStore((s) => s.presetPos)
  const presetOrder = useStore((s) => s.presetOrder)
  const presetShuffle = useStore((s) => s.presetShuffle)
  const togglePresetShuffle = useStore((s) => s.togglePresetShuffle)
  const playlistStep = useStore((s) => s.playlistStep)
  const deletePlaylistPreset = useStore((s) => s.deletePlaylistPreset)
  const activePresetId = useStore((s) => s.activePresetId)
  const buildMode = !runMode
  const favorites = useFavorites()
  const [staplesOpen, setStaplesOpen] = useState(localStorage.getItem('hearth:staplesOpen') !== '0')
  const [consoleOpen, setConsoleOpen] = useState(localStorage.getItem('hearth:consoleOpen') !== '0')
  const toggleConsole = (): void => {
    localStorage.setItem('hearth:consoleOpen', consoleOpen ? '0' : '1')
    setConsoleOpen(!consoleOpen)
  }

  const scene = scenes.find((s) => s.id === currentSceneId) ?? null
  // Staples cluster by kind (music → beds → sfx), alphabetical within — the
  // badges then read as group headers instead of confetti.
  const KIND_ORDER: Record<AssetKind, number> = { music: 0, ambience: 1, sfx: 2 }
  const staples = favorites
    .map((file) => assets.find((a) => a.file === file))
    .filter((a): a is NonNullable<typeof a> => !!a && !a.trash)
    .sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        assetDisplayName(a).localeCompare(assetDisplayName(b))
    )

  // Run mode hides the SFX grid, so its single-key hotkeys re-home here.
  useEffect(() => {
    if (!runMode || !scene) return
    const map = new Map((scene.sfx ?? []).filter((s) => s.hotkey).map((s) => [s.hotkey!.toLowerCase(), s]))
    if (map.size === 0) return
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState()
      if (st.libraryOpen || st.triage || st.discordOpen || st.switcherOpen || st.captureOpen || st.helpOpen || st.compendiumOpen || st.mapEditorOpen || st.mapsOpen || st.partyOpen) return
      if (isTypingTarget(e.target)) return
      const item = map.get(e.key.toLowerCase())
      if (item) {
        e.preventDefault()
        playSfx(item.id)
        pushRecent(item.file)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [runMode, scene, playSfx])

  // Next-track control for the playing music chip: preset queue first, then
  // the scene's own playlist mode.
  const nextTrack = activePresetId
    ? () => presetStep(1)
    : scene?.playlist?.enabled && status.activeMusicId
      ? () => playlistStep(1)
      : undefined

  // When a campaign preset is driving music, expose its full track list so the
  // Now chip's ☰ menu can jump straight to any song.
  const activePreset = presets.find((p) => p.id === activePresetId)
  // The ☰ menu lists files in disc order; with shuffle on, presetPos walks the
  // shuffled order, so map it back to the file index for the ▶ highlight.
  const currentFileIdx =
    activePreset && presetOrder.length === activePreset.files.length
      ? presetOrder[presetPos]
      : presetPos
  const musicQueue: QueueInfo | undefined = activePreset
    ? { tracks: activePreset.files, current: currentFileIdx, onJump: presetJump }
    : undefined

  // Run-screen redesign: the armed scene's palette lives in the right rail's
  // 🎚 tab now — this console only shows what's SOUNDING (+ playlists/staples).
  const hasNow =
    !!status.activeMusicId ||
    status.ambienceFiles.length > 0 ||
    status.loopingSfxIds.length > 0 ||
    status.oneShotSfx.length > 0
  // Any library at all keeps the console alive — the 🔥 Vibe box must be
  // reachable even in silence (that's exactly when you need a sound fast).
  if (!hasNow && presets.length === 0 && staples.length === 0 && assets.length === 0) return null

  // NOW-row label/volume lookups can hit any scene — the sounding item may
  // belong to a scene that's no longer armed (exactly when showing it matters).
  const musicTrack = scenes.flatMap((s) => s.music ?? []).find((m) => m.id === status.activeMusicId)
  const musicLabel = status.activeMusicId
    ? musicTrack?.label ??
      (status.activeMusicId.includes('/') ? stem(status.activeMusicId) : status.activeMusicId)
    : null
  const ambLayer = (file: string) => scenes.flatMap((s) => s.ambience ?? []).find((a) => a.file === file)
  const sfxItem = (id: string) => scenes.flatMap((s) => s.sfx ?? []).find((x) => x.id === id)

  // The library categories double as mood tags (tension/somber/combat/
  // tavern…). Bulk-utility categories aren't moods — skip them. An asset with
  // no categories at all gets flagged `untagged` so it's easy to spot the ones
  // still needing a sorting pass.
  const moodOf = (file: string | null | undefined): MoodInfo | null => {
    if (!file) return null
    const asset: LibraryAsset | undefined = assets.find((x) => x.file === file)
    if (!asset) return null // scene-local file, not a library asset — nothing to tag
    const cats = assetCategories(asset)
    if (cats.length === 0) return { moods: [], untagged: true }
    const moods = cats
      .filter((c) => c !== 'footsteps' && c !== 'voices')
      .map((c) => categoryMeta(c).label.toLowerCase())
    return { moods, untagged: false }
  }

  const toggleStaples = (): void => {
    localStorage.setItem('hearth:staplesOpen', staplesOpen ? '0' : '1')
    setStaplesOpen(!staplesOpen)
  }

  // Minimized: a slim strip — screen goes to the script; what's audible stays
  // visible at a glance and one click brings the console back.
  if (!consoleOpen) {
    const audible =
      (status.activeMusicId ? 1 : 0) +
      status.ambienceFiles.length +
      status.loopingSfxIds.length +
      status.oneShotSfx.length
    return (
      <button
        onClick={toggleConsole}
        title="Expand the sound console"
        data-bottom-dock
        className="flex w-full items-center gap-2 border-t-2 border-hearth-ember/30 bg-hearth-panel px-4 py-1 text-left text-[11px] text-hearth-muted transition-colors hover:text-hearth-ember"
      >
        🎛 Sound console
        {audible > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-hearth-ember/15 px-2 py-px text-hearth-ember">
            <span className="inline-block h-1 w-1 animate-flicker rounded-full bg-hearth-ember" />
            {audible} sounding
          </span>
        )}
        <span className="ml-auto">▴</span>
      </button>
    )
  }

  return (
    <div
      data-bottom-dock
      className="relative max-h-56 space-y-1.5 overflow-y-auto border-t-2 border-hearth-ember/30 bg-hearth-panel px-4 py-2 shadow-[0_-4px_16px_rgba(0,0,0,0.35)]"
    >
      <button
        onClick={toggleConsole}
        title="Minimize the sound console"
        className="absolute right-1.5 top-1 z-10 rounded bg-hearth-panel px-1.5 text-[11px] text-hearth-muted transition-colors hover:text-hearth-ember"
      >
        ▾
      </button>
      {/* NOW — everything audible */}
      {hasNow && (
        <div className="flex flex-wrap items-center gap-2">
          <RowLabel title="Everything currently audible — adjust or kill each without leaving the script">
            Now
          </RowLabel>
          {musicLabel && (
            <NowChip
              kind="music"
              label={musicLabel}
              className="border-hearth-ember/60 bg-hearth-ember/10 text-hearth-ember"
              mood={moodOf(musicTrack?.file ?? (status.activeMusicId?.includes('/') ? status.activeMusicId : null))}
              volume={musicTrack?.volume}
              defaultVolume={0.6}
              onVolume={(v) => engine.setActiveMusicVolume(v)}
              onNext={nextTrack}
              queue={musicQueue}
              onStop={() => engine.stopMusic()}
              stopTitle="Fade this track out"
            />
          )}
          {musicLabel && <MusicScrub />}
          {status.ambienceFiles.map((file) => (
            <NowChip
              key={file}
              kind="ambience"
              label={stem(file)}
              className="border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
              mood={moodOf(file)}
              volume={ambLayer(file)?.volume}
              defaultVolume={0.4}
              onVolume={(v) => engine.setAmbienceLayerVolume(file, v)}
              onStop={() => engine.stopAmbienceLayer(file)}
              stopTitle="Fade this bed out"
            />
          ))}
          {status.oneShotSfx.map((s, i) => (
            <span
              key={`${s.id}:${i}`}
              className="flex items-center gap-1.5 rounded-full border border-hearth-gold/60 bg-hearth-gold/10 py-1 pl-2.5 pr-1 text-sm text-hearth-gold"
            >
              <KindBadge kind="sfx" />
              <span className="max-w-[10rem] truncate">{s.label}</span>
              <button
                onClick={() => engine.stopSfx(s.id)}
                title="Cut this sound now"
                className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] leading-none opacity-60 hover:bg-black/30 hover:opacity-100"
              >
                ✕
              </button>
            </span>
          ))}
          {status.loopingSfxIds.map((id) => (
            <NowChip
              key={id}
              kind="sfx"
              looping
              label={sfxItem(id)?.label ?? id}
              className="border-hearth-gold/60 bg-hearth-gold/10 text-hearth-gold"
              mood={moodOf(sfxItem(id)?.file)}
              volume={sfxItem(id)?.volume}
              defaultVolume={0.9}
              onVolume={(v) => engine.setSfxLoopVolume(id, v)}
              onStop={() => engine.stopSfxLoop(id)}
              stopTitle="Stop this loop"
            />
          ))}
          {status.ducked && (
            <span
              className="rounded bg-hearth-emberdim/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-hearth-gold"
              title="Music is dipped while a sound effect plays"
            >
              ducking
            </span>
          )}
          {status.monitorMuted && (
            <span
              className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-red-300"
              title="Your speakers are muted — the Discord stream still carries everything (🔊 Local in the top bar to unmute)"
            >
              🔇 local muted
            </span>
          )}
          <button
            onClick={stopAll}
            title="Fade everything out (Esc)"
            className="ml-auto rounded border border-hearth-emberdim bg-hearth-emberdim/20 px-2.5 py-1 text-xs text-hearth-gold hover:bg-hearth-emberdim/40"
          >
            ⏹ All
          </button>
        </div>
      )}

      {/* 🔥 VIBE — search/browse ANY library sound and fire it, mid-anything */}
      {assets.length > 0 && <QuickFire />}

      {/* PLAYLISTS — campaign-wide presets */}
      {presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <RowLabel title="Campaign-wide playlists — auto-advance, work in any scene">🎜 Lists</RowLabel>
          {presets.map((p) => {
            const active = p.id === activePresetId
            return (
              <span
                key={p.id}
                className={`group flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors ${
                  active
                    ? 'border-hearth-ember bg-hearth-ember/20 text-hearth-ember shadow-ember'
                    : 'border-hearth-ember/50 bg-hearth-panel2/60 text-hearth-ember/90 hover:bg-hearth-ember/15'
                }`}
              >
                <button
                  onClick={() => togglePresetPlaylist(p.id)}
                  title={active ? `Stop "${p.name}"` : `Play "${p.name}" (${p.files.length} tracks, auto-advances)`}
                  className="flex items-center gap-1"
                >
                  <span aria-hidden>{active ? '⏹' : '▶'}</span>
                  <span className="max-w-[10rem] truncate">{p.name}</span>
                  <span className="text-hearth-muted/70">{p.files.length}</span>
                </button>
                {active && (
                  <button onClick={() => presetStep(1)} title="Next track" className="px-0.5 hover:text-hearth-gold">
                    ⏭
                  </button>
                )}
                {active && (
                  <button
                    onClick={togglePresetShuffle}
                    title={presetShuffle ? 'Shuffle ON — click for disc order' : 'Shuffle this playlist'}
                    className={`px-0.5 ${presetShuffle ? 'text-hearth-gold' : 'opacity-50 hover:opacity-100 hover:text-hearth-gold'}`}
                  >
                    🔀
                  </button>
                )}
                {buildMode && !active && (
                  <DangerButton
                    onConfirm={() => void deletePlaylistPreset(p.id)}
                    title="Delete this playlist (tracks stay in the library)"
                    className="rounded border border-transparent px-0.5 opacity-40 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    armedLabel="✕?"
                  >
                    ✕
                  </DangerButton>
                )}
              </span>
            )
          })}
        </div>
      )}

      {/* STAPLES — ★ favorites, fireable anywhere */}
      {staples.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={toggleStaples}
            title={staplesOpen ? 'Collapse staples' : 'Expand staples'}
            className="w-16 flex-none pt-1 text-left text-[10px] font-semibold uppercase tracking-wider text-hearth-gold"
          >
            ★ Staples <span className="text-hearth-muted">{staplesOpen ? '▾' : `${staples.length}`}</span>
          </button>
          {staplesOpen &&
            staples.map((a) => {
              const lit =
                (a.kind === 'music' && status.activeMusicId === a.file) ||
                (a.kind === 'ambience' && status.ambienceFiles.includes(a.file))
              return (
                <FireChip
                  key={a.file}
                  kind={a.kind}
                  label={assetDisplayName(a)}
                  mood={moodOf(a.file)}
                  lit={lit}
                  onClick={() => {
                    fireFavorite(a.file)
                    pushRecent(a.file)
                  }}
                  title={
                    a.kind === 'sfx'
                      ? `Fire ${assetDisplayName(a)}`
                      : lit
                        ? `Stop ${assetDisplayName(a)}`
                        : `Play ${assetDisplayName(a)} (works in any scene)`
                  }
                />
              )
            })}
        </div>
      )}
    </div>
  )
}
