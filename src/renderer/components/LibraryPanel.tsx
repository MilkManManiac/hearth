import { useEffect, useMemo, useRef, useState } from 'react'
import type { AssetKind, LibraryAsset } from '../../shared/types'
import { assetDisplayName, CATEGORY_ORDER, categoryMeta } from '../../shared/types'
import { toggleFavorite, useFavorites, useRecents } from '../lib/prefs'
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
  const libraryKind = useStore((s) => s.libraryKind)
  const addAssetToScene = useStore((s) => s.addAssetToScene)
  const scene = useStore((s) => s.campaign.scenes.find((x) => x.id === s.currentSceneId) ?? null)

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<AssetKind | 'all'>('all')
  const [category, setCategory] = useState<string | 'all'>('all')
  const favorites = useFavorites()
  const recents = useRecents()

  // Files already on the current scene (any bucket) — to show "in scene" state.
  const filesInScene = useMemo(() => {
    const set = new Set<string>()
    scene?.music?.forEach((m) => set.add(m.file))
    scene?.ambience?.forEach((a) => set.add(a.file))
    scene?.sfx?.forEach((s) => set.add(s.file))
    return set
  }, [scene])

  // Seed the kind filter when opened from a section's "+ Add".
  useEffect(() => {
    if (open) setKind(libraryKind)
  }, [open, libraryKind])

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
      const hay = `${a.name ?? ''} ${a.file} ${a.category ?? ''} ${a.tags.join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [assets, query, kind, category])

  // Group the filtered assets: Favorites, then Recent, then the category
  // groups. Trash-marked assets are pulled out into a final section.
  const groups = useMemo(() => {
    const sections: { key: string; icon: string; label: string; items: LibraryAsset[] }[] = []
    const live = filtered.filter((a) => !a.trash)
    const trashed = filtered.filter((a) => a.trash)
    const byName = (a: LibraryAsset, b: LibraryAsset) =>
      assetDisplayName(a).localeCompare(assetDisplayName(b))

    const favSet = new Set(favorites)
    const favItems = live.filter((a) => favSet.has(a.file)).sort(byName)
    if (favItems.length > 0) {
      sections.push({ key: 'favorites', icon: '★', label: 'Favorites', items: favItems })
    }

    // Recent keeps fire order; favorites already shown above are skipped.
    const recentItems = recents
      .map((f) => live.find((a) => a.file === f && !favSet.has(f)))
      .filter((a): a is LibraryAsset => !!a)
    if (recentItems.length > 0) {
      sections.push({ key: 'recent', icon: '🕘', label: 'Recent', items: recentItems })
    }

    const byCat = new Map<string, LibraryAsset[]>()
    for (const a of live) {
      const c = a.category ?? ''
      if (!byCat.has(c)) byCat.set(c, [])
      byCat.get(c)!.push(a)
    }
    for (const [cat, items] of [...byCat.entries()].sort(
      ([a], [b]) => categoryRank(a) - categoryRank(b) || a.localeCompare(b)
    )) {
      const meta = categoryMeta(cat || undefined)
      sections.push({
        key: `cat:${cat || 'uncategorized'}`,
        icon: meta.icon,
        label: meta.label,
        items: items.sort(byName)
      })
    }

    if (trashed.length > 0) {
      sections.push({
        key: 'trash',
        icon: '🚮',
        label: 'Marked as trash',
        items: trashed.sort(byName)
      })
    }
    return sections
  }, [filtered, favorites, recents])

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
            groups.map(({ key, icon, label, items }) => {
              return (
                <section key={key} className="mb-4">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-hearth-muted">
                    <span>{icon}</span>
                    {label}
                    <span className="text-hearth-muted/60">{items.length}</span>
                  </h3>
                  <ul className="space-y-1">
                    {items.map((a) => (
                      <AssetRow
                        key={a.file}
                        asset={a}
                        inScene={filesInScene.has(a.file)}
                        canAdd={!!scene}
                        onAdd={() => addAssetToScene(a.file)}
                      />
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

const inputCls =
  'rounded border border-hearth-border bg-hearth-bg px-2 py-1 text-xs text-hearth-text placeholder:text-hearth-muted focus:border-hearth-ember focus:outline-none'

function AssetRow({
  asset,
  inScene,
  canAdd,
  onAdd
}: {
  asset: LibraryAsset
  inScene: boolean
  canAdd: boolean
  onAdd: () => void
}) {
  const previewingFile = useStore((s) => s.previewingFile)
  const previewAsset = useStore((s) => s.previewAsset)
  const updateLibraryAsset = useStore((s) => s.updateLibraryAsset)
  const deleteLibraryAsset = useStore((s) => s.deleteLibraryAsset)
  const playing = previewingFile === asset.file
  const fav = useFavorites().includes(asset.file)

  // Inline metadata editor (rename / recategorize / retag).
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [cat, setCat] = useState('')
  const [tags, setTags] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  const openEditor = (): void => {
    setName(assetDisplayName(asset))
    setCat(asset.category ?? '')
    setTags(asset.tags.join(', '))
    setEditing(true)
  }
  useEffect(() => {
    if (editing) nameRef.current?.select()
  }, [editing])

  const commit = (): void => {
    setEditing(false)
    void updateLibraryAsset(asset.file, {
      name,
      category: cat,
      tags: [...new Set(tags.toLowerCase().split(/[,\s]+/).filter(Boolean))]
    })
  }

  return (
    <li
      className={`rounded border border-hearth-border/50 px-2 py-1.5 ${
        asset.trash ? 'bg-hearth-bg/60 opacity-70' : 'bg-hearth-panel2/40'
      }`}
    >
      <div className="flex items-center gap-2">
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
          <div className="truncate text-sm text-hearth-text" title={asset.file}>
            {assetDisplayName(asset)}
          </div>
          {asset.tags.length > 0 && (
            <div className="truncate text-[11px] text-hearth-muted">{asset.tags.join(' · ')}</div>
          )}
        </div>
        <button
          onClick={() => toggleFavorite(asset.file)}
          title={fav ? 'Remove from favorites' : 'Add to favorites'}
          className={`flex-none px-1 text-base leading-none transition-colors ${
            fav ? 'text-hearth-ember' : 'text-hearth-muted/40 hover:text-hearth-ember'
          }`}
        >
          {fav ? '★' : '☆'}
        </button>
        <button
          onClick={() => (editing ? setEditing(false) : openEditor())}
          title="Rename / recategorize / retag"
          className={`flex-none px-1 text-sm transition-colors ${
            editing ? 'text-hearth-ember' : 'text-hearth-muted hover:text-hearth-ember'
          }`}
        >
          ✎
        </button>
        {asset.trash ? (
          <>
            <button
              onClick={() => void updateLibraryAsset(asset.file, { trash: false })}
              title="Restore — unmark as trash"
              className="flex-none px-1 text-sm text-hearth-muted hover:text-hearth-ember"
            >
              ♻
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Delete "${assetDisplayName(asset)}" for good? The file moves to the recycle bin.`)) {
                  void deleteLibraryAsset(asset.file)
                }
              }}
              title="Delete for good (file → recycle bin). Blocked while a scene still uses it."
              className="flex-none px-1 text-sm text-hearth-muted hover:text-red-400"
            >
              🗑
            </button>
          </>
        ) : (
          <button
            onClick={() => void updateLibraryAsset(asset.file, { trash: true })}
            title="Mark as trash — hidden from cue tray, staged under 'Marked as trash' for deletion"
            className="flex-none px-1 text-sm text-hearth-muted/50 hover:text-red-400"
          >
            🚮
          </button>
        )}
        <span className="flex-none rounded bg-hearth-bg px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-hearth-muted">
          {asset.kind}
        </span>
        {canAdd &&
          !asset.trash &&
          (inScene ? (
            <span
              className="flex-none rounded border border-hearth-border px-2 py-1 text-xs text-hearth-muted"
              title="Already on this scene"
            >
              ✓ In scene
            </span>
          ) : (
            <button
              onClick={onAdd}
              title="Add to the current scene"
              className="flex-none rounded border border-hearth-ember bg-hearth-ember/15 px-2 py-1 text-xs text-hearth-ember hover:bg-hearth-ember/30"
            >
              + Add
            </button>
          ))}
      </div>

      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            commit()
          }}
          className="mt-2 flex flex-wrap items-center gap-2 border-t border-hearth-border/50 pt-2"
        >
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setEditing(false))}
            placeholder="display name"
            className={`${inputCls} w-44`}
            title="Display name (the file on disk keeps its name — scenes are unaffected)"
          />
          <select value={cat} onChange={(e) => setCat(e.target.value)} className={inputCls}>
            <option value="">— no category —</option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {categoryMeta(c).icon} {categoryMeta(c).label}
              </option>
            ))}
          </select>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setEditing(false))}
            placeholder="tags (comma separated)"
            className={`${inputCls} min-w-0 flex-1`}
          />
          <button
            type="submit"
            className="rounded border border-hearth-ember bg-hearth-ember/15 px-2 py-1 text-xs text-hearth-ember hover:bg-hearth-ember/30"
          >
            Save
          </button>
        </form>
      )}
    </li>
  )
}
