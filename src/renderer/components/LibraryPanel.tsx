import { useEffect, useMemo, useState } from 'react'
import type { AssetKind, LibraryAsset } from '../../shared/types'
import { CATEGORY_ORDER, categoryMeta } from '../../shared/types'
import { useStore } from '../store'

const KIND_LABELS: Record<AssetKind, string> = {
  music: 'Music',
  ambience: 'Ambience',
  sfx: 'SFX'
}

/** Order categories by the recommended list, then unknown ones alphabetically. */
function categoryRank(id: string): number {
  const i = CATEGORY_ORDER.indexOf(id)
  return i === -1 ? CATEGORY_ORDER.length : i
}

function basename(file: string): string {
  return file.split('/').pop() ?? file
}

/**
 * Full-library browser: search + category/kind filters + per-asset audition.
 * Opened from the top bar; a modal overlay so it doesn't disturb the board.
 */
export default function LibraryPanel() {
  const open = useStore((s) => s.libraryOpen)
  const close = useStore((s) => s.closeLibrary)
  const assets = useStore((s) => s.campaign.library.assets)
  const importAssets = useStore((s) => s.importAssets)

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<AssetKind | 'all'>('all')
  const [category, setCategory] = useState<string | 'all'>('all')

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  // Categories present in the library, ordered.
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const a of assets) set.add(a.category ?? '')
    return [...set].sort((a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b))
  }, [assets])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return assets.filter((a) => {
      if (kind !== 'all' && a.kind !== kind) return false
      if (category !== 'all' && (a.category ?? '') !== category) return false
      if (!q) return true
      const hay = `${a.file} ${a.category ?? ''} ${a.tags.join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [assets, query, kind, category])

  // Group the filtered assets by category, in display order.
  const groups = useMemo(() => {
    const byCat = new Map<string, LibraryAsset[]>()
    for (const a of filtered) {
      const c = a.category ?? ''
      if (!byCat.has(c)) byCat.set(c, [])
      byCat.get(c)!.push(a)
    }
    return [...byCat.entries()]
      .sort(([a], [b]) => categoryRank(a) - categoryRank(b) || a.localeCompare(b))
      .map(([cat, items]) => ({
        cat,
        items: items.sort((a, b) => basename(a.file).localeCompare(basename(b.file)))
      }))
  }, [filtered])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6"
      onClick={close}
    >
      <div
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-hearth-border bg-hearth-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-hearth-border px-4 py-3">
          <h2 className="text-lg font-semibold text-hearth-text">Asset Library</h2>
          <span className="text-xs text-hearth-muted">{assets.length} assets</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => importAssets('sfx')}
              className="rounded border border-hearth-border bg-hearth-panel2 px-2 py-1 text-xs text-hearth-muted hover:text-hearth-text"
              title="Import SFX files into the campaign"
            >
              + Import SFX
            </button>
            <button
              onClick={close}
              className="rounded px-2 py-1 text-hearth-muted hover:text-hearth-text"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-2 border-b border-hearth-border px-4 py-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, tag, or category…"
            className="w-full rounded border border-hearth-border bg-hearth-bg px-3 py-1.5 text-sm text-hearth-text placeholder:text-hearth-muted focus:border-hearth-ember focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={kind === 'all'} onClick={() => setKind('all')}>
              All kinds
            </FilterChip>
            {(['music', 'ambience', 'sfx'] as AssetKind[]).map((k) => (
              <FilterChip key={k} active={kind === k} onClick={() => setKind(k)}>
                {KIND_LABELS[k]}
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={category === 'all'} onClick={() => setCategory('all')}>
              All categories
            </FilterChip>
            {categories.map((c) => {
              const meta = categoryMeta(c || undefined)
              return (
                <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
                  {meta.icon} {meta.label}
                </FilterChip>
              )
            })}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {groups.length === 0 ? (
            <p className="py-8 text-center text-sm text-hearth-muted">No assets match.</p>
          ) : (
            groups.map(({ cat, items }) => {
              const meta = categoryMeta(cat || undefined)
              return (
                <section key={cat || 'uncategorized'} className="mb-4">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-hearth-muted">
                    <span>{meta.icon}</span>
                    {meta.label}
                    <span className="text-hearth-muted/60">{items.length}</span>
                  </h3>
                  <ul className="space-y-1">
                    {items.map((a) => (
                      <AssetRow key={a.file} asset={a} />
                    ))}
                  </ul>
                </section>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
        active
          ? 'border-hearth-ember bg-hearth-emberdim/30 text-hearth-ember'
          : 'border-hearth-border bg-hearth-panel2 text-hearth-muted hover:text-hearth-text'
      }`}
    >
      {children}
    </button>
  )
}

function AssetRow({ asset }: { asset: LibraryAsset }) {
  const previewingFile = useStore((s) => s.previewingFile)
  const previewAsset = useStore((s) => s.previewAsset)
  const playing = previewingFile === asset.file

  return (
    <li className="flex items-center gap-2 rounded border border-hearth-border/50 bg-hearth-panel2/40 px-2 py-1.5">
      <button
        onClick={() => previewAsset(asset.file)}
        title={playing ? 'Stop' : 'Audition'}
        className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border text-sm transition-colors ${
          playing
            ? 'border-hearth-ember bg-hearth-ember/20 text-hearth-ember'
            : 'border-hearth-border text-hearth-muted hover:border-hearth-ember hover:text-hearth-ember'
        }`}
      >
        {playing ? '■' : '▶'}
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-hearth-text">{basename(asset.file)}</div>
        {asset.tags.length > 0 && (
          <div className="truncate text-[11px] text-hearth-muted">{asset.tags.join(' · ')}</div>
        )}
      </div>
      <span className="flex-none rounded bg-hearth-bg px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-hearth-muted">
        {asset.kind}
      </span>
    </li>
  )
}
