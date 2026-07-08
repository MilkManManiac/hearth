import { useEffect, useMemo, useRef, useState } from 'react'
import type { AssetKind, LibraryAsset } from '../../shared/types'
import {
  assetCategories,
  assetDisplayName,
  assetPrimaryCategory,
  CATEGORY_ORDER,
  categoryMeta
} from '../../shared/types'
import { toggleFavorite, useFavorites, useRecents } from '../lib/prefs'
import { useStore } from '../store'
import PreviewScrubber from './PreviewScrubber'
import GrowArea from './GrowArea'

const KIND_LABELS: Record<AssetKind, string> = {
  music: 'Music',
  ambience: 'Ambience',
  sfx: 'SFX'
}

/** Rows rendered per group before the "Show all" expander kicks in. */
const GROUP_CAP = 60

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
  const purgeTrash = useStore((s) => s.purgeTrash)
  const scene = useStore((s) => s.campaign.scenes.find((x) => x.id === s.currentSceneId) ?? null)

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<AssetKind | 'all'>('all')
  const [category, setCategory] = useState<string | 'all'>('all')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const favorites = useFavorites()
  const favoriteSet = useMemo(() => new Set(favorites), [favorites])
  const recents = useRecents()

  // New filter/search → collapse the big groups again.
  useEffect(() => {
    setExpandedGroups(new Set())
  }, [query, kind, category])

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

  // Categories present in the library (all of an asset's categories), ordered.
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const a of assets) {
      const cats = assetCategories(a)
      if (cats.length === 0) set.add('')
      for (const c of cats) set.add(c)
    }
    return [...set].sort((a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b))
  }, [assets])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return assets.filter((a) => {
      if (kind !== 'all' && a.kind !== kind) return false
      // Multi-category: the filter matches if ANY of the asset's categories hit.
      if (category !== 'all') {
        const cats = assetCategories(a)
        if (category === '' ? cats.length > 0 : !cats.includes(category)) return false
      }
      if (!q) return true
      const hay = `${a.name ?? ''} ${a.file} ${assetCategories(a).join(' ')} ${a.description ?? ''} ${a.tags.join(' ')}`.toLowerCase()
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
      // Grouped under the PRIMARY category only (no duplicate rows); the
      // category filter above still finds it via any of its categories.
      const c = assetPrimaryCategory(a) ?? ''
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

        {/* Category suggestions for the row editors: the recommended set plus
            everything already used in this campaign — typing anything new is
            equally valid (categories are free-form). */}
        <datalist id="hearth-categories">
          {[...new Set([...CATEGORY_ORDER, ...categories.filter(Boolean)])].map((c) => (
            <option key={c} value={c}>
              {categoryMeta(c).icon} {categoryMeta(c).label}
            </option>
          ))}
        </datalist>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {groups.length === 0 ? (
            <p className="py-8 text-center text-sm text-hearth-muted">No assets match.</p>
          ) : (
            groups.map(({ key, icon, label, items }) => {
              // Big groups (750 footsteps…) render a capped slice; expanding is
              // one click. Keeps the panel snappy at library scale.
              const expanded = expandedGroups.has(key)
              const shown = expanded ? items : items.slice(0, GROUP_CAP)
              return (
                <section key={key} className="mb-4">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-hearth-muted">
                    <span>{icon}</span>
                    {label}
                    <span className="text-hearth-muted/60">{items.length}</span>
                    {key === 'trash' && (
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              `Purge all ${items.length} trashed sound${items.length === 1 ? '' : 's'}? Files go to the recycle bin and their names are blocklisted so future imports skip them. Sounds still used by a scene are kept.`
                            )
                          ) {
                            void purgeTrash()
                          }
                        }}
                        title="Delete everything marked as trash — recycle bin + blocklist"
                        className="ml-2 rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] normal-case tracking-normal text-red-300 hover:bg-red-500/25"
                      >
                        🗑 Purge all
                      </button>
                    )}
                  </h3>
                  <ul className="space-y-1">
                    {shown.map((a) => (
                      <AssetRow
                        key={a.file}
                        asset={a}
                        fav={favoriteSet.has(a.file)}
                        inScene={filesInScene.has(a.file)}
                        canAdd={!!scene}
                        onAdd={() => addAssetToScene(a.file)}
                      />
                    ))}
                  </ul>
                  {items.length > shown.length && (
                    <button
                      onClick={() => setExpandedGroups((s) => new Set(s).add(key))}
                      className="mt-1 w-full rounded border border-dashed border-hearth-border px-2 py-1 text-xs text-hearth-muted hover:border-hearth-ember hover:text-hearth-ember"
                    >
                      Show all {items.length} — or refine the search
                    </button>
                  )}
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
  fav,
  inScene,
  canAdd,
  onAdd
}: {
  asset: LibraryAsset
  fav: boolean
  inScene: boolean
  canAdd: boolean
  onAdd: () => void
}) {
  const playing = useStore((s) => s.previewingFile === asset.file)
  const previewAsset = useStore((s) => s.previewAsset)
  const updateLibraryAsset = useStore((s) => s.updateLibraryAsset)
  const deleteLibraryAsset = useStore((s) => s.deleteLibraryAsset)

  // Inline metadata editor (rename / recategorize / retag / describe).
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [cat, setCat] = useState('')
  const [tags, setTags] = useState('')
  const [desc, setDesc] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  const openEditor = (): void => {
    setName(assetDisplayName(asset))
    setCat(assetCategories(asset).join(', '))
    setTags(asset.tags.join(', '))
    setDesc(asset.description ?? '')
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
      description: desc,
      tags: [...new Set(tags.toLowerCase().split(/[,\s]+/).filter(Boolean))]
    })
  }

  return (
    <li
      className={`rounded border border-hearth-border/50 px-2 py-1.5 [content-visibility:auto] [contain-intrinsic-size:auto_52px] ${
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
            {assetCategories(asset).length > 1 && (
              <span
                className="ml-2 text-[10px] uppercase tracking-wide text-hearth-muted/70"
                title="All categories (grouped under the first)"
              >
                {assetCategories(asset).join(' · ')}
              </span>
            )}
          </div>
          {asset.tags.length > 0 && (
            <div className="truncate text-[11px] text-hearth-muted">{asset.tags.join(' · ')}</div>
          )}
          {asset.description && (
            <div className="truncate text-[11px] italic text-hearth-muted/80" title={asset.description}>
              {asset.description}
            </div>
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

      {/* Audition scrubber — drag into the middle of the track. */}
      {playing && <PreviewScrubber file={asset.file} />}

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
          <input
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setEditing(false))}
            list="hearth-categories"
            placeholder="categories (comma separated)"
            className={`${inputCls} w-40`}
            title="One or more, comma separated — 'combat, tension, nature' files it under all three (first = main group + mood tag)"
          />
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
          <GrowArea
            value={desc}
            onChange={setDesc}
            placeholder="description — what it sounds like, when to use it…"
            className={`${inputCls} basis-full text-[12px]`}
          />
        </form>
      )}
    </li>
  )
}
