import { useState } from 'react'
import { assetDisplayName, type AssetKind } from '../../shared/types'
import { pushRecent, useFavorites } from '../lib/prefs'
import { useStore } from '../store'

const KIND_ICON: Record<AssetKind, string> = { music: '♪', ambience: '〜', sfx: '🔊' }
const KIND_CLASS: Record<AssetKind, string> = {
  music: 'border-hearth-ember/60 text-hearth-ember hover:bg-hearth-ember/20',
  ambience: 'border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/20',
  sfx: 'border-hearth-gold/60 text-hearth-gold hover:bg-hearth-gold/20'
}
const KIND_LIT: Record<AssetKind, string> = {
  music: 'bg-hearth-ember/20 shadow-ember',
  ambience: 'bg-emerald-500/20',
  sfx: ''
}

/** Stable empty fallback — see the selector note below. */
const NO_PRESETS: import('../../shared/types').PlaylistPreset[] = []

/**
 * The Staples dock: every ★-favorited library asset, fireable from ANY scene
 * with zero setup — the DM's go-to beds/tracks/stingers for improv moments.
 * Music and ambience staples toggle (lit while playing); SFX are one-shots.
 */
export default function FavoritesDock() {
  const favorites = useFavorites()
  const assets = useStore((s) => s.campaign.library.assets)
  // NOTE: select the raw (stable) reference — `?? []` inside a selector mints
  // a new array every snapshot, which React treats as an infinite loop and
  // crashes the tree (the blank-screen bug).
  const presetsRaw = useStore((s) => s.campaign.library.playlists)
  const presets = presetsRaw ?? NO_PRESETS
  const fireFavorite = useStore((s) => s.fireFavorite)
  const togglePresetPlaylist = useStore((s) => s.togglePresetPlaylist)
  const presetStep = useStore((s) => s.presetStep)
  const deletePlaylistPreset = useStore((s) => s.deletePlaylistPreset)
  const activePresetId = useStore((s) => s.activePresetId)
  const buildMode = useStore((s) => s.uiMode === 'build')
  const status = useStore((s) => s.status)
  const [open, setOpen] = useState(localStorage.getItem('hearth:staplesOpen') !== '0')

  const items = favorites
    .map((file) => assets.find((a) => a.file === file))
    .filter((a): a is NonNullable<typeof a> => !!a && !a.trash)
  if (items.length === 0 && presets.length === 0) return null

  const toggleOpen = (): void => {
    const next = !open
    localStorage.setItem('hearth:staplesOpen', next ? '1' : '0')
    setOpen(next)
  }

  return (
    <div className="space-y-1 border-t border-hearth-border bg-hearth-panel/70 px-4 py-1.5">
      {presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-hearth-gold">🎜 Playlists</span>
          {presets.map((p) => {
            const active = p.id === activePresetId
            return (
              <span
                key={p.id}
                className={`group flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  active
                    ? 'border-hearth-ember bg-hearth-ember/20 text-hearth-ember shadow-ember'
                    : 'border-hearth-ember/50 bg-hearth-panel2/60 text-hearth-ember/90 hover:bg-hearth-ember/15'
                }`}
              >
                <button
                  onClick={() => togglePresetPlaylist(p.id)}
                  title={active ? `Stop "${p.name}"` : `Play "${p.name}" (${p.files.length} tracks, auto-advances, works in any scene)`}
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
                {buildMode && !active && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete playlist "${p.name}"? (Tracks stay in the library.)`)) {
                        void deletePlaylistPreset(p.id)
                      }
                    }}
                    title="Delete this playlist"
                    className="px-0.5 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}
      {items.length > 0 && (
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={toggleOpen}
          title={open ? 'Collapse staples' : 'Expand staples'}
          className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-hearth-gold"
        >
          ★ Staples
          <span className="text-hearth-muted">{open ? '▾' : `▸ ${items.length}`}</span>
        </button>
        {open &&
          items.map((a) => {
            const lit =
              (a.kind === 'music' && status.activeMusicId === a.file) ||
              (a.kind === 'ambience' && status.ambienceFiles.includes(a.file))
            return (
              <button
                key={a.file}
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
                className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${KIND_CLASS[a.kind]} ${
                  lit ? KIND_LIT[a.kind] : 'bg-hearth-panel2/60'
                }`}
              >
                <span aria-hidden>{lit && a.kind !== 'sfx' ? '⏹' : KIND_ICON[a.kind]}</span>
                <span className="max-w-[10rem] truncate">{assetDisplayName(a)}</span>
              </button>
            )
          })}
        {open && (
          <span className="text-[10px] text-hearth-muted/60">★ assets in the Library to add more</span>
        )}
      </div>
      )}
    </div>
  )
}
