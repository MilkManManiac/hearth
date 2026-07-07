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

/**
 * The Staples dock: every ★-favorited library asset, fireable from ANY scene
 * with zero setup — the DM's go-to beds/tracks/stingers for improv moments.
 * Music and ambience staples toggle (lit while playing); SFX are one-shots.
 */
export default function FavoritesDock() {
  const favorites = useFavorites()
  const assets = useStore((s) => s.campaign.library.assets)
  const fireFavorite = useStore((s) => s.fireFavorite)
  const status = useStore((s) => s.status)
  const [open, setOpen] = useState(localStorage.getItem('hearth:staplesOpen') !== '0')

  const items = favorites
    .map((file) => assets.find((a) => a.file === file))
    .filter((a): a is NonNullable<typeof a> => !!a && !a.trash)
  if (items.length === 0) return null

  const toggleOpen = (): void => {
    const next = !open
    localStorage.setItem('hearth:staplesOpen', next ? '1' : '0')
    setOpen(next)
  }

  return (
    <div className="border-t border-hearth-border bg-hearth-panel/70 px-4 py-1.5">
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
    </div>
  )
}
