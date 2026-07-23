import { useEffect, useMemo, useRef, useState } from 'react'
import type { AssetKind, LibraryAsset } from '../../shared/types'
import {
  assetCategories,
  assetDisplayName,
  assetPrimaryCategory,
  CATEGORY_ORDER,
  categoryMeta,
  LIBRARY_MOODS
} from '../../shared/types'
import { fuzzyScore } from '../lib/fuzzy'
import { toggleFavorite, useFavorites, useRecents } from '../lib/prefs'
import { basename } from '../../shared/paths'
import { useStore } from '../store'
import DangerButton from './DangerButton'
import PreviewScrubber from './PreviewScrubber'
import GrowArea from './GrowArea'
import ReviewQueue from './ReviewQueue'

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
  const [heardFilter, setHeardFilter] = useState<'all' | 'heard' | 'unheard'>('all')
  const [reviewing, setReviewing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const favorites = useFavorites()
  const favoriteSet = useMemo(() => new Set(favorites), [favorites])
  const recents = useRecents()

  // New filter/search → collapse the big groups again.
  useEffect(() => {
    setExpandedGroups(new Set())
  }, [query, kind, category, heardFilter])

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

  // Close on Escape — unless the review overlay is up (it owns Esc then).
  useEffect(() => {
    if (!open || reviewing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close, reviewing])

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
    const base = assets.filter((a) => {
      if (kind !== 'all' && a.kind !== kind) return false
      if (heardFilter !== 'all' && (heardFilter === 'heard') !== !!a.heard) return false
      // Multi-category: the filter matches if ANY of the asset's categories hit.
      if (category !== 'all') {
        const cats = assetCategories(a)
        if (category === '' ? cats.length > 0 : !cats.includes(category)) return false
      }
      return true
    })
    if (!q) return base
    // Relevance-ranked, not substring-over-everything: name beats mood beats
    // category beats tags; description/file are last-resort matches only.
    const scored = base
      .map((a) => {
        let s = fuzzyScore(assetDisplayName(a), q) * 3
        for (const m of a.moods ?? []) s = Math.max(s, fuzzyScore(m, q) * 2.5)
        for (const c of assetCategories(a)) s = Math.max(s, fuzzyScore(c, q) * 2)
        for (const t of a.tags) s = Math.max(s, fuzzyScore(t, q) * 1.5)
        if (s === 0 && (a.description ?? '').toLowerCase().includes(q)) s = 40
        if (s === 0 && a.file.toLowerCase().includes(q)) s = 20
        return { a, s }
      })
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s || assetDisplayName(x.a).localeCompare(assetDisplayName(y.a)))
    return scored.map((x) => x.a)
  }, [assets, query, kind, category, heardFilter])

  // Group the filtered assets: Favorites, then Recent, then the category
  // groups. Trash-marked assets are pulled out into a final section.
  const groups = useMemo(() => {
    const sections: { key: string; icon: string; label: string; items: LibraryAsset[] }[] = []
    const live = filtered.filter((a) => !a.trash)
    const trashed = filtered.filter((a) => a.trash)
    const byName = (a: LibraryAsset, b: LibraryAsset) =>
      assetDisplayName(a).localeCompare(assetDisplayName(b))

    // Searching: one relevance-ordered Results section (filtered is already
    // score-sorted) instead of alphabetical category groups.
    if (query.trim()) {
      if (live.length > 0) sections.push({ key: 'results', icon: '🔎', label: 'Results', items: live })
      if (trashed.length > 0)
        sections.push({ key: 'trash', icon: '🚮', label: 'Marked as trash', items: trashed })
      return sections
    }

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
  }, [filtered, query, favorites, recents])

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
            {(() => {
              const unheard = assets.filter((a) => !a.trash && !a.heard).length
              return unheard > 0 ? (
                <button
                  onClick={() => setReviewing(true)}
                  className="rounded-full border border-hearth-gold/60 bg-hearth-gold/10 px-2.5 py-1 text-xs text-hearth-gold transition-colors hover:bg-hearth-gold/20"
                  title="Listen through the unheard pile one sound at a time — confirm a vibe for each"
                >
                  🎧 Review {unheard}
                </button>
              ) : null
            })()}
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
            <span aria-hidden className="mx-1 h-4 w-px bg-hearth-border" />
            <FilterChip active={heardFilter === 'all'} onClick={() => setHeardFilter('all')}>
              Heard + unheard
            </FilterChip>
            <FilterChip active={heardFilter === 'heard'} onClick={() => setHeardFilter('heard')}>
              🎧 Heard
            </FilterChip>
            <FilterChip active={heardFilter === 'unheard'} onClick={() => setHeardFilter('unheard')}>
              Unheard
            </FilterChip>
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
        <datalist id="hearth-moods">
          {LIBRARY_MOODS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        {/* Bulk bar — appears once anything is ☑-selected. One library write
            per action, whatever the selection size. */}
        {selected.size > 0 && (
          <BulkBar files={[...selected]} onClear={() => setSelected(new Set())} />
        )}

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
                    <button
                      onClick={() => {
                        setSelected((prev) => {
                          const next = new Set(prev)
                          const allIn = shown.every((a) => next.has(a.file))
                          for (const a of shown) {
                            if (allIn) next.delete(a.file)
                            else next.add(a.file)
                          }
                          return next
                        })
                      }}
                      title="Select / unselect everything shown in this group (for bulk edit)"
                      className={`rounded border px-1 leading-tight transition-colors ${
                        shown.length > 0 && shown.every((a) => selected.has(a.file))
                          ? 'border-hearth-ember text-hearth-ember'
                          : 'border-hearth-border text-hearth-muted/60 hover:text-hearth-ember'
                      }`}
                    >
                      ☑
                    </button>
                    <span>{icon}</span>
                    {label}
                    <span className="text-hearth-muted/60">{items.length}</span>
                    {key === 'trash' && (
                      <DangerButton
                        onConfirm={() => void purgeTrash()}
                        title={`Purge all ${items.length} trashed sounds — recycle bin + blocklist (scene-used sounds are kept)`}
                        className="ml-2 rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] normal-case tracking-normal text-red-300 hover:bg-red-500/25"
                        armedLabel={`🗑 Really purge ${items.length}?`}
                      >
                        🗑 Purge all
                      </DangerButton>
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
                        checked={selected.has(a.file)}
                        onToggleSelect={() =>
                          setSelected((prev) => {
                            const next = new Set(prev)
                            if (next.has(a.file)) next.delete(a.file)
                            else next.add(a.file)
                            return next
                          })
                        }
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
      {reviewing && <ReviewQueue onClose={() => setReviewing(false)} />}
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

/**
 * Bulk-edit bar for the current ☑ selection: set categories/moods, mark
 * heard/unheard, trash/restore. Each action is ONE library.json write.
 * The selection survives an action so several passes can stack (e.g. set
 * category, then mark heard).
 */
function BulkBar({ files, onClear }: { files: string[]; onClear: () => void }) {
  const updateLibraryAssets = useStore((s) => s.updateLibraryAssets)
  const [cat, setCat] = useState('')
  const [moods, setMoods] = useState('')

  const btnCls =
    'rounded border border-hearth-border bg-hearth-panel2 px-2 py-1 text-xs text-hearth-muted transition-colors hover:border-hearth-ember hover:text-hearth-ember'
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-hearth-ember/40 bg-hearth-emberdim/15 px-4 py-2">
      <span className="text-xs font-semibold text-hearth-ember">{files.length} selected</span>
      <input
        value={cat}
        onChange={(e) => setCat(e.target.value)}
        list="hearth-categories"
        placeholder="categories…"
        className={`${inputCls} w-36`}
        title="Comma separated; applies to every selected sound"
      />
      <button
        onClick={() => cat.trim() && void updateLibraryAssets(files, { category: cat })}
        disabled={!cat.trim()}
        className={`${btnCls} disabled:opacity-40`}
      >
        Set categories
      </button>
      <input
        value={moods}
        onChange={(e) => setMoods(e.target.value)}
        list="hearth-moods"
        placeholder="moods…"
        className={`${inputCls} w-32`}
        title="Comma separated; replaces moods on every selected sound"
      />
      <button
        onClick={() =>
          moods.trim() &&
          void updateLibraryAssets(files, {
            moods: moods.toLowerCase().split(/[,\s]+/).filter(Boolean)
          })
        }
        disabled={!moods.trim()}
        className={`${btnCls} disabled:opacity-40`}
      >
        Set moods
      </button>
      <span aria-hidden className="h-4 w-px bg-hearth-border" />
      <button onClick={() => void updateLibraryAssets(files, { heard: true })} className={btnCls}>
        🎧 Heard
      </button>
      <button onClick={() => void updateLibraryAssets(files, { heard: false })} className={btnCls}>
        Unheard
      </button>
      <DangerButton
        onConfirm={() => void updateLibraryAssets(files, { trash: true })}
        title="Mark every selected sound as trash (soft — restorable)"
        className={`${btnCls} hover:border-red-400 hover:text-red-300`}
        armedLabel={`🚮 Really trash ${files.length}?`}
      >
        🚮 Trash
      </DangerButton>
      <button onClick={() => void updateLibraryAssets(files, { trash: false })} className={btnCls}>
        ♻ Restore
      </button>
      <button onClick={onClear} className={`${btnCls} ml-auto`}>
        ✕ Clear selection
      </button>
    </div>
  )
}

function AssetRow({
  asset,
  fav,
  inScene,
  canAdd,
  onAdd,
  checked,
  onToggleSelect
}: {
  asset: LibraryAsset
  fav: boolean
  inScene: boolean
  canAdd: boolean
  onAdd: () => void
  checked: boolean
  onToggleSelect: () => void
}) {
  const playing = useStore((s) => s.previewingFile === asset.file)
  const previewAsset = useStore((s) => s.previewAsset)
  const updateLibraryAsset = useStore((s) => s.updateLibraryAsset)
  const deleteLibraryAsset = useStore((s) => s.deleteLibraryAsset)

  // Inline metadata editor (rename / recategorize / retag / moods / license).
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [cat, setCat] = useState('')
  const [tags, setTags] = useState('')
  const [moods, setMoods] = useState('')
  const [license, setLicense] = useState('')
  const [source, setSource] = useState('')
  const [desc, setDesc] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  const openEditor = (): void => {
    setName(assetDisplayName(asset))
    setCat(assetCategories(asset).join(', '))
    setTags(asset.tags.join(', '))
    setMoods((asset.moods ?? []).join(', '))
    setLicense(asset.license ?? '')
    setSource(asset.source ?? '')
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
      license,
      source,
      moods: moods.toLowerCase().split(/[,\s]+/).filter(Boolean),
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
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleSelect}
          title="Select for bulk edit"
          className="flex-none accent-[#c96f2f]"
        />
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
          {((asset.moods?.length ?? 0) > 0 || asset.tags.length > 0) && (
            <div className="truncate text-[11px] text-hearth-muted">
              {(asset.moods?.length ?? 0) > 0 && (
                <span className="text-hearth-gold/80" title="Moods">
                  {asset.moods!.join(' · ')}
                  {asset.tags.length > 0 && '  ·  '}
                </span>
              )}
              {asset.tags.join(' · ')}
            </div>
          )}
          {asset.description && (
            <div className="truncate text-[11px] italic text-hearth-muted/80" title={asset.description}>
              {asset.description}
            </div>
          )}
        </div>
        <button
          onClick={() => void updateLibraryAsset(asset.file, { heard: !asset.heard })}
          title={
            asset.heard
              ? 'Heard — auditioned by ear. Click to unmark.'
              : 'Unheard — imported by filename, never auditioned. Click to mark as heard.'
          }
          className={`flex-none px-1 text-sm leading-none transition-colors ${
            asset.heard ? 'text-hearth-gold' : 'text-hearth-muted/40 hover:text-hearth-gold'
          }`}
        >
          🎧
        </button>
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
            <DangerButton
              onConfirm={() => void deleteLibraryAsset(asset.file)}
              title="Delete for good (file → recycle bin). Blocked while a scene still uses it."
              className="flex-none rounded border border-transparent px-1 text-sm text-hearth-muted hover:text-red-400"
              armedLabel="🗑?"
            >
              🗑
            </DangerButton>
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
            value={moods}
            onChange={(e) => setMoods(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setEditing(false))}
            list="hearth-moods"
            placeholder="moods (tense, calm…)"
            className={`${inputCls} w-36`}
            title="Mood words, comma separated — the live-retrieval axis ('tense', 'calm', 'epic')"
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
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setEditing(false))}
            placeholder="source"
            className={`${inputCls} w-36`}
            title="Where it came from (pack / site / 'youtube')"
          />
          <input
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setEditing(false))}
            placeholder="license (CC0, private…)"
            className={`${inputCls} w-44`}
            title="License terms — 'private' = personal-table only, never redistributed"
          />
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
