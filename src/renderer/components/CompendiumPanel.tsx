import { useEffect, useMemo, useState } from 'react'
import {
  formatCR,
  KIND_META,
  KIND_ORDER,
  loadKind,
  loadMeta,
  SPELL_LEVEL_LABEL,
  type CompendiumKind,
  type Monster,
  type NamedEntry,
  type Spell
} from '../lib/compendium'
import { fuzzyScore } from '../lib/fuzzy'
import { useStore } from '../store'
import { EntryArticle, MonsterStatBlock, SpellCard } from './StatBlock'

const LIST_CAP = 80

/**
 * 📖 The rules compendium: SRD 5.2.1 (2024 rules) — monsters, spells, species,
 * classes, items, rules — searchable and offline. Master list on the left,
 * stat block on the right; Ctrl+K can deep-link straight to an entry.
 */
export default function CompendiumPanel() {
  const open = useStore((s) => s.compendiumOpen)
  const close = useStore((s) => s.closeCompendium)
  const target = useStore((s) => s.compendiumTarget)
  const [kind, setKind] = useState<CompendiumKind>('monster')
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<NamedEntry[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [attribution, setAttribution] = useState('')
  // Monster/spell filters.
  const [crMax, setCrMax] = useState<number | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [levelFilter, setLevelFilter] = useState<number | null>(null)

  // Deep link from Ctrl+K: open at a specific kind+entry.
  useEffect(() => {
    if (open && target) {
      setKind(target.kind)
      setSelectedKey(target.key)
      setQuery('')
    }
  }, [open, target])

  useEffect(() => {
    if (!open) return
    let alive = true
    loadKind(kind).then((rows) => {
      if (!alive) return
      setEntries(rows)
      setSelectedKey((k) => (k && rows.some((r) => r.key === k) ? k : (rows[0]?.key ?? null)))
    })
    return () => {
      alive = false
    }
  }, [open, kind])

  useEffect(() => {
    if (open) loadMeta().then((m) => setAttribution(m.attribution))
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const monsterTypes = useMemo(() => {
    if (kind !== 'monster') return []
    return [...new Set(entries.map((e) => String((e as unknown as Monster).type)))].sort()
  }, [kind, entries])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = entries
    if (kind === 'monster') {
      rows = rows.filter((e) => {
        const m = e as unknown as Monster
        if (crMax != null && m.cr > crMax) return false
        if (typeFilter !== 'all' && m.type !== typeFilter) return false
        return true
      })
    }
    if (kind === 'spell' && levelFilter != null) {
      rows = rows.filter((e) => (e as unknown as Spell).level === levelFilter)
    }
    if (!q) return rows
    return rows
      .map((e) => ({ e, score: fuzzyScore(e.name, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name))
      .map((x) => x.e)
  }, [entries, query, kind, crMax, typeFilter, levelFilter])

  const selected = entries.find((e) => e.key === selectedKey) ?? filtered[0] ?? null

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6" onClick={close}>
      <div
        className="flex h-full max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-hearth-border bg-hearth-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: kind tabs + search */}
        <div className="flex flex-wrap items-center gap-2 border-b border-hearth-border px-4 py-2.5">
          <h2 className="mr-1 font-display text-lg font-semibold text-hearth-text">📖 Compendium</h2>
          <div className="flex flex-wrap gap-1">
            {KIND_ORDER.map((k) => (
              <button
                key={k}
                onClick={() => {
                  setKind(k)
                  setQuery('')
                  setSelectedKey(null)
                }}
                className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                  kind === k
                    ? 'border-hearth-ember bg-hearth-ember/15 text-hearth-ember'
                    : 'border-hearth-border text-hearth-muted hover:text-hearth-text'
                }`}
              >
                {KIND_META[k].icon} {KIND_META[k].plural}
              </button>
            ))}
          </div>
          <button onClick={close} className="ml-auto rounded px-2 py-1 text-hearth-muted hover:text-hearth-text" title="Close (Esc)">
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* List */}
          <div className="flex w-72 flex-none flex-col border-r border-hearth-border">
            <div className="space-y-1.5 border-b border-hearth-border p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${KIND_META[kind].plural.toLowerCase()}…`}
                className="w-full rounded border border-hearth-border bg-hearth-bg px-2 py-1 text-sm text-hearth-text placeholder:text-hearth-muted/60 focus:border-hearth-ember focus:outline-none"
              />
              {kind === 'monster' && (
                <div className="flex gap-1.5">
                  <select
                    value={crMax ?? ''}
                    onChange={(e) => setCrMax(e.target.value === '' ? null : Number(e.target.value))}
                    className="min-w-0 flex-1 rounded border border-hearth-border bg-hearth-panel2 px-1 py-0.5 text-xs text-hearth-text"
                    title="Maximum CR"
                  >
                    <option value="">CR: any</option>
                    {[0.25, 0.5, 1, 2, 3, 5, 8, 12, 17, 30].map((c) => (
                      <option key={c} value={c}>
                        CR ≤ {formatCR(c)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="min-w-0 flex-1 rounded border border-hearth-border bg-hearth-panel2 px-1 py-0.5 text-xs text-hearth-text"
                  >
                    <option value="all">Type: all</option>
                    {monsterTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {kind === 'spell' && (
                <select
                  value={levelFilter ?? ''}
                  onChange={(e) => setLevelFilter(e.target.value === '' ? null : Number(e.target.value))}
                  className="w-full rounded border border-hearth-border bg-hearth-panel2 px-1 py-0.5 text-xs text-hearth-text"
                >
                  <option value="">Level: any</option>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
                    <option key={l} value={l}>
                      {SPELL_LEVEL_LABEL(l)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {filtered.slice(0, LIST_CAP).map((e) => (
                <button
                  key={e.key}
                  onClick={() => setSelectedKey(e.key)}
                  className={`flex w-full items-baseline gap-2 px-3 py-1 text-left text-sm transition-colors ${
                    selected?.key === e.key ? 'bg-hearth-ember/15 text-hearth-text' : 'text-hearth-muted hover:text-hearth-text'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {e.homebrew ? <span title="Campaign homebrew" aria-hidden>🏠 </span> : null}
                    {e.name}
                  </span>
                  <span className="flex-none text-[10px] text-hearth-muted/60">
                    {kind === 'monster'
                      ? `CR ${formatCR((e as unknown as Monster).cr)}`
                      : kind === 'spell'
                        ? SPELL_LEVEL_LABEL((e as unknown as Spell).level)
                        : (e.section ?? '')}
                  </span>
                </button>
              ))}
              {filtered.length > LIST_CAP && (
                <p className="px-3 py-1 text-[11px] text-hearth-muted/60">
                  {filtered.length - LIST_CAP} more — search to narrow.
                </p>
              )}
              {filtered.length === 0 && <p className="px-3 py-2 text-xs text-hearth-muted">No matches.</p>}
            </div>
          </div>

          {/* Detail */}
          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            {selected ? (
              kind === 'monster' ? (
                <MonsterStatBlock m={selected as unknown as Monster} />
              ) : kind === 'spell' ? (
                <SpellCard s={selected as unknown as Spell} />
              ) : (
                <EntryArticle e={selected} />
              )
            ) : (
              <p className="text-sm text-hearth-muted">Pick an entry.</p>
            )}
          </div>
        </div>

        <div className="border-t border-hearth-border px-4 py-1.5 text-[9px] leading-tight text-hearth-muted/50">
          {attribution || 'SRD 5.2.1 · CC-BY-4.0'}
        </div>
      </div>
    </div>
  )
}
