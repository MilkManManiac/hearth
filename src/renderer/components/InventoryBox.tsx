import { useEffect, useMemo, useState } from 'react'
import type { Character, Coins, InventoryItem } from '../../shared/types'
import {
  addCoins,
  attunedCount,
  COIN_CP,
  COIN_KEYS,
  emptyCoins,
  newItemId,
  parseCostCp,
  spendCoins,
  type CoinKey
} from '../../shared/inventory'
import { loadKind, type NamedEntry } from '../lib/compendium'
import { fuzzyScore } from '../lib/fuzzy'

// SURFACES-PLAN M4 — the structured inventory: rows with equip/attune/charges/
// qty, a search-first catalog add (203 mundane + 757 magic + homebrew), and
// the coin pouch with auto-make-change. Shared by the DM sheet and the player
// portal — everything flows through `onPatch`, same as the rest of the sheet.

/** SRD equipment + magic items + campaign homebrew, one merged searchable list. */
interface CatalogEntry extends NamedEntry {
  kind: 'equipment' | 'magic-item'
  cost?: string
  rarity?: string
}

let catalogPromise: Promise<CatalogEntry[]> | null = null
export function loadItemCatalog(): Promise<CatalogEntry[]> {
  if (!catalogPromise) {
    catalogPromise = Promise.all([loadKind('equipment'), loadKind('magic-item')]).then(([eq, mi]) => [
      ...eq.map((e) => ({ ...e, kind: 'equipment' as const })),
      ...mi.map((e) => ({ ...e, kind: 'magic-item' as const }))
    ])
  }
  return catalogPromise
}

const RARITY_DOT: Record<string, string> = {
  common: 'text-hearth-muted',
  uncommon: 'text-emerald-300',
  rare: 'text-sky-300',
  'very-rare': 'text-purple-300',
  legendary: 'text-hearth-gold',
  artifact: 'text-red-300'
}

/**
 * Search-first item picker (also used by the 🎁 Grant bar). Type → catalog
 * hits (with cost/rarity); the last row always offers "custom item" so
 * homebrew loot is never blocked by the catalog.
 */
export function CatalogSearch({
  onPick,
  placeholder = 'Add item (SRD search)…',
  extra
}: {
  onPick: (pick: { name: string; entry?: CatalogEntry }) => void
  placeholder?: string
  /** Rendered inside the search row (qty / equip / pay options). */
  extra?: React.ReactNode
}) {
  const [all, setAll] = useState<CatalogEntry[] | null>(null)
  const [query, setQuery] = useState('')
  useEffect(() => {
    loadItemCatalog().then(setAll).catch(() => setAll([]))
  }, [])
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !all) return []
    return all
      .map((e) => ({ e, score: fuzzyScore(e.name, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
  }, [query, all])
  const pick = (p: { name: string; entry?: CatalogEntry }) => {
    setQuery('')
    onPick(p)
  }
  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && query.trim()) {
              const top = hits[0]
              if (top) pick({ name: top.e.name, entry: top.e })
              else pick({ name: query.trim() })
            }
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded border border-hearth-border bg-hearth-bg px-2 py-1 text-xs text-hearth-text placeholder:text-hearth-muted/40 focus:border-hearth-ember focus:outline-none"
        />
        {extra}
      </div>
      {query.trim() && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-hearth-border bg-hearth-panel2 shadow-2xl">
          {hits.map(({ e }) => (
            <button
              key={`${e.kind}:${e.key}`}
              onClick={() => pick({ name: e.name, entry: e })}
              className="flex w-full items-baseline gap-2 px-2.5 py-1 text-left text-xs text-hearth-text hover:bg-hearth-ember/15"
            >
              <span className="min-w-0 flex-1 truncate">
                {e.name}
                {e.homebrew && <span title="Campaign homebrew"> 🏠</span>}
              </span>
              {e.rarity && (
                <span className={`flex-none text-[9px] capitalize ${RARITY_DOT[e.rarity] ?? 'text-hearth-muted'}`}>
                  {String(e.rarity).replace('-', ' ')}
                </span>
              )}
              {e.cost && <span className="flex-none text-[9px] text-hearth-muted">{e.cost}</span>}
            </button>
          ))}
          <button
            onClick={() => pick({ name: query.trim() })}
            className="flex w-full items-baseline gap-2 border-t border-hearth-border px-2.5 py-1 text-left text-xs text-hearth-muted hover:bg-hearth-ember/15 hover:text-hearth-text"
          >
            ＋ custom item “{query.trim()}”
          </button>
        </div>
      )}
    </div>
  )
}

/** Charge pips — the limited-uses idiom, living on the item row. */
function ChargePips({
  item,
  onChange
}: {
  item: InventoryItem
  onChange: (charges: InventoryItem['charges']) => void
}) {
  if (!item.charges) return null
  const { max, used = 0 } = item.charges
  return (
    <span className="flex items-center gap-0.5" title="Charges (tick = spent)">
      {Array.from({ length: Math.min(12, max) }, (_, i) => (
        <input
          key={i}
          type="checkbox"
          checked={i < used}
          onChange={(e) => onChange({ ...item.charges!, used: e.target.checked ? i + 1 : i })}
          className="h-3 w-3 accent-hearth-gold"
        />
      ))}
    </span>
  )
}

function ItemRow({
  item,
  update,
  remove,
  onStashItem
}: {
  item: InventoryItem
  update: (p: Partial<InventoryItem>) => void
  remove: () => void
  onStashItem?: (itemId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null)
  useEffect(() => {
    if (open) loadItemCatalog().then(setCatalog).catch(() => setCatalog([]))
  }, [open])
  // Catalog card: by stored key first, else a live name match (migrated rows).
  const entry = useMemo(() => {
    if (!catalog) return null
    if (item.catalogKey) return catalog.find((e) => e.kind === item.catalogKind && e.key === item.catalogKey) ?? null
    const n = item.name.trim().toLowerCase()
    return catalog.find((e) => e.name.toLowerCase() === n) ?? null
  }, [catalog, item.catalogKey, item.catalogKind, item.name])
  const qty = item.qty ?? 1
  return (
    <div className="group/item rounded border border-transparent px-1 py-px hover:border-hearth-border/60">
      <div className="flex items-center gap-1.5 text-xs">
        <button
          onClick={() => update({ equipped: item.equipped ? undefined : true })}
          title={item.equipped ? 'Equipped (armor & shields feed AC) — click to unequip' : 'Equip'}
          className={`flex-none text-sm leading-none ${item.equipped ? 'text-hearth-ember' : 'text-hearth-muted/30 hover:text-hearth-muted'}`}
        >
          {item.equipped ? '⛨' : '○'}
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 truncate text-left text-hearth-text hover:text-hearth-ember"
          title="Details (notes, charges, AC bonus, transfer)"
        >
          {item.name}
          {qty > 1 && <span className="text-hearth-muted"> ×{qty}</span>}
        </button>
        <button
          onClick={() => update({ attuned: item.attuned ? undefined : true })}
          title={item.attuned ? 'Attuned — click to end attunement' : 'Attune (max 3 — a warning, never a block)'}
          className={`flex-none ${item.attuned ? 'text-hearth-gold' : 'text-hearth-muted/25 hover:text-hearth-gold/60'}`}
        >
          ✦
        </button>
        <ChargePips item={item} onChange={(charges) => update({ charges })} />
        <button
          onClick={remove}
          className="flex-none text-hearth-muted opacity-0 hover:text-red-400 group-hover/item:opacity-100"
          title="Remove (gone for good — stash it instead to keep it)"
        >
          ×
        </button>
      </div>
      {open && (
        <div className="mb-1 ml-5 mt-0.5 space-y-1.5 rounded border border-hearth-border/60 bg-hearth-bg/50 p-2 text-[11px] text-hearth-muted">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1">
              qty
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => {
                  const n = Math.max(1, Number(e.target.value) || 1)
                  update({ qty: n === 1 ? undefined : n })
                }}
                className="w-14 rounded border border-hearth-border bg-hearth-bg px-1 py-px text-center text-hearth-text"
              />
            </label>
            <label className="flex items-center gap-1" title="Flat AC bonus while equipped (Ring of Protection, +1 armor…)">
              AC bonus
              <input
                type="number"
                value={item.acBonus ?? 0}
                onChange={(e) => {
                  const n = Number(e.target.value) || 0
                  update({ acBonus: n === 0 ? undefined : n })
                }}
                className="w-12 rounded border border-hearth-border bg-hearth-bg px-1 py-px text-center text-hearth-text"
              />
            </label>
            {item.charges ? (
              <label className="flex items-center gap-1">
                charges
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={item.charges.max}
                  onChange={(e) =>
                    update({ charges: { ...item.charges!, max: Math.max(1, Number(e.target.value) || 1) } })
                  }
                  className="w-12 rounded border border-hearth-border bg-hearth-bg px-1 py-px text-center text-hearth-text"
                />
                <select
                  value={item.charges.reset ?? 'long'}
                  onChange={(e) =>
                    update({ charges: { ...item.charges!, reset: e.target.value as 'short' | 'long' | 'none' } })
                  }
                  className="rounded border border-hearth-border bg-hearth-bg px-0.5 py-px"
                  title="Which rest refills it (dawn items = ☀️ long)"
                >
                  <option value="short">🌙 short</option>
                  <option value="long">☀️ long/dawn</option>
                  <option value="none">no auto-reset</option>
                </select>
                <button onClick={() => update({ charges: undefined })} className="hover:text-red-400" title="Remove charges">
                  ×
                </button>
              </label>
            ) : (
              <button
                onClick={() => update({ charges: { max: 3, used: 0, reset: 'long' } })}
                className="rounded border border-dashed border-hearth-border px-1.5 py-px hover:text-hearth-text"
                title="Track charges on this item (wands, staffs, Velmire…)"
              >
                + charges
              </button>
            )}
            {onStashItem && (
              <button
                onClick={() => {
                  setOpen(false)
                  onStashItem(item.id)
                }}
                className="ml-auto rounded border border-hearth-border px-1.5 py-px hover:border-hearth-gold hover:text-hearth-gold"
                title="Move to the shared party stash (transfer, never copy)"
              >
                → stash
              </button>
            )}
          </div>
          <input
            value={item.notes ?? ''}
            onChange={(e) => update({ notes: e.target.value || undefined })}
            placeholder="notes (masteries, who gave it, quirks…)"
            className="w-full rounded border border-hearth-border bg-hearth-bg px-1.5 py-0.5 text-hearth-text placeholder:text-hearth-muted/40 focus:border-hearth-ember focus:outline-none"
          />
          {entry?.desc && (
            <p className="max-h-24 overflow-y-auto leading-snug">
              <span className="text-hearth-text">
                {entry.name}
                {entry.homebrew ? ' 🏠' : ' 📖'}.{' '}
              </span>
              {entry.desc.length > 400 ? `${entry.desc.slice(0, 400)}…` : entry.desc}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** The coin pouch: direct-edit denominations + a make-change quick box + ledger. */
export function CoinPouch({
  coins,
  onChange,
  onTxn,
  ledger
}: {
  coins: Coins | undefined
  onChange: (coins: Coins) => void
  /** Called after a quick-box transaction with a signed cp delta (for the ledger). */
  onTxn?: (deltaCp: number, note: string) => void
  ledger?: Array<{ ts: number; deltaCp: number; note?: string }>
}) {
  const pouch = { ...emptyCoins(), ...(coins ?? {}) }
  const [amount, setAmount] = useState('')
  const [denom, setDenom] = useState<CoinKey>('gp')
  const [short, setShort] = useState(false)
  const apply = (sign: 1 | -1) => {
    const n = Math.floor(Number(amount))
    if (!Number.isFinite(n) || n <= 0) return
    const next = addCoins(pouch, denom, sign * n)
    if (!next) {
      setShort(true)
      return
    }
    setShort(false)
    setAmount('')
    onChange(next)
    onTxn?.(sign * n * COIN_CP[denom], `${sign > 0 ? '+' : '−'}${n} ${denom}`)
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {COIN_KEYS.map((k) => (
          <label key={k} className="flex items-center gap-1 text-[11px] text-hearth-muted">
            <span className={k === 'gp' ? 'text-hearth-gold' : ''}>{k}</span>
            <input
              type="number"
              min={0}
              value={pouch[k]}
              onChange={(e) => onChange({ ...pouch, [k]: Math.max(0, Number(e.target.value) || 0) })}
              className="w-14 rounded border border-hearth-border bg-hearth-bg px-1 py-px text-center text-xs text-hearth-text"
            />
          </label>
        ))}
        <span className="flex items-center gap-0.5">
          <input
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setShort(false)
            }}
            onKeyDown={(e) => e.key === 'Enter' && apply(-1)}
            placeholder="15"
            title="Quick spend/gain — spending makes change automatically (breaks a gp into sp/cp)"
            className={`w-12 rounded border bg-hearth-bg px-1 py-px text-center text-xs text-hearth-text placeholder:text-hearth-muted/30 focus:outline-none ${
              short ? 'border-red-500/60' : 'border-hearth-border focus:border-hearth-ember'
            }`}
          />
          <select
            value={denom}
            onChange={(e) => setDenom(e.target.value as CoinKey)}
            className="rounded border border-hearth-border bg-hearth-bg px-0.5 py-px text-[11px] text-hearth-muted"
          >
            {COIN_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <button onClick={() => apply(-1)} className="rounded bg-red-500/15 px-1.5 text-sm text-red-300 hover:bg-red-500/30" title="Spend (auto make-change)">
            −
          </button>
          <button onClick={() => apply(1)} className="rounded bg-emerald-500/15 px-1.5 text-sm text-emerald-300 hover:bg-emerald-500/30" title="Gain">
            +
          </button>
          {short && <span className="text-[10px] text-red-300">not enough coin</span>}
        </span>
      </div>
      {(ledger?.length ?? 0) > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-[10px] text-hearth-muted/60 hover:text-hearth-muted">
            ledger ({ledger!.length})
          </summary>
          <div className="mt-0.5 max-h-24 space-y-px overflow-y-auto text-[10px] text-hearth-muted">
            {[...ledger!].reverse().map((t, i) => (
              <div key={`${t.ts}:${i}`} className="flex gap-2">
                <span className={t.deltaCp >= 0 ? 'text-emerald-300' : 'text-red-300'}>{t.note}</span>
                <span className="text-hearth-muted/50">{new Date(t.ts).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

/** The character's inventory panel: rows + catalog add + pouch. */
export default function InventoryBox({
  c,
  onPatch,
  onStashItem
}: {
  c: Character
  onPatch: (p: Partial<Character>) => void
  /** Present when a party stash is reachable — enables "→ stash" on rows. */
  onStashItem?: (itemId: string) => void
}) {
  const items = c.inventory ?? []
  const attuned = attunedCount(c)
  const [equipNow, setEquipNow] = useState(false)
  const [payNow, setPayNow] = useState(false)
  const [cantAfford, setCantAfford] = useState(false)

  const addItem = (pick: { name: string; entry?: CatalogEntry }) => {
    setCantAfford(false)
    const row: InventoryItem = { id: newItemId(), name: pick.name }
    if (pick.entry) {
      row.catalogKind = pick.entry.kind
      row.catalogKey = pick.entry.key
    }
    if (equipNow) row.equipped = true
    const patch: Partial<Character> = { inventory: [...items, row] }
    if (payNow && pick.entry?.cost) {
      const costCp = parseCostCp(pick.entry.cost)
      if (costCp != null) {
        const paid = spendCoins({ ...emptyCoins(), ...(c.coins ?? {}) }, costCp)
        if (!paid) {
          setCantAfford(true)
          return
        }
        patch.coins = paid
        patch.coinLog = [...(c.coinLog ?? []), { ts: Date.now(), deltaCp: -costCp, note: `bought ${pick.name}` }].slice(-50)
      }
    }
    onPatch(patch)
  }

  return (
    <div className="rounded-md border border-hearth-border bg-hearth-panel2/30 p-2">
      <div className="mb-1 flex items-baseline gap-2 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
        Inventory
        <span
          className={`normal-case ${attuned > 3 ? 'font-bold text-red-400' : attuned > 0 ? 'text-hearth-gold' : 'text-hearth-muted/50'}`}
          title="Attuned magic items (✦ on a row) — 3 is the rules cap; a warning, never a block"
        >
          ✦ attuned {attuned}/3
        </span>
      </div>
      <div className="space-y-px">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            update={(p) => {
              const next = items.map((x) => (x.id === item.id ? { ...x, ...p } : x))
              onPatch({ inventory: next })
            }}
            remove={() => onPatch({ inventory: items.filter((x) => x.id !== item.id) })}
            onStashItem={onStashItem}
          />
        ))}
        {items.length === 0 && (
          <p className="px-1 py-1 text-[11px] text-hearth-muted/60">Empty-handed — search below to add gear.</p>
        )}
      </div>
      <div className="mt-1.5">
        <CatalogSearch
          onPick={addItem}
          extra={
            <span className="flex flex-none items-center gap-2 text-[10px] text-hearth-muted">
              <label className="flex items-center gap-0.5" title="Equip the item as it lands">
                <input type="checkbox" checked={equipNow} onChange={(e) => setEquipNow(e.target.checked)} className="h-3 w-3 accent-hearth-ember" />
                equip
              </label>
              <label className="flex items-center gap-0.5" title="Pay the catalog price from the pouch (auto make-change)">
                <input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} className="h-3 w-3 accent-hearth-gold" />
                pay
              </label>
              {cantAfford && <span className="text-red-300">can't afford</span>}
            </span>
          }
        />
      </div>
      <div className="mt-2 border-t border-hearth-border pt-1.5">
        <CoinPouch
          coins={c.coins}
          onChange={(coins) => onPatch({ coins })}
          onTxn={(deltaCp, note) =>
            onPatch({ coinLog: [...(c.coinLog ?? []), { ts: Date.now(), deltaCp, note }].slice(-50) })
          }
          ledger={c.coinLog}
        />
      </div>
      {(c.equipment?.length ?? 0) > 0 && (
        <details className="mt-2 border-t border-hearth-border pt-1.5">
          <summary className="cursor-pointer text-[10px] text-hearth-muted/60 hover:text-hearth-muted">
            un-migrated gear lines ({c.equipment!.length})
          </summary>
          <textarea
            value={(c.equipment ?? []).join('\n')}
            onChange={(e) => onPatch({ equipment: e.target.value.split('\n') })}
            rows={4}
            className="mt-1 w-full rounded border border-hearth-border bg-hearth-bg px-2 py-1 text-xs text-hearth-text focus:border-hearth-ember focus:outline-none"
          />
        </details>
      )}
    </div>
  )
}
