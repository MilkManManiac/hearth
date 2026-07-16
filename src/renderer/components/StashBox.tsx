import { useState } from 'react'
import type { InventoryItem, PartyStash } from '../../shared/types'
import { COIN_KEYS, type CoinKey } from '../../shared/inventory'

// SURFACES-PLAN M4 — the shared party stash, transport-agnostic: the DM's
// 🛡 Party panel wires the callbacks to IPC, the player portal to HTTP.
// Transfer-never-copy: every move goes through onTransferItem/onTransferCoins
// (handled atomically in the main process) and lands in the activity log.

export interface StashActions {
  /** Move an item stash → `takeToId` (or a qty split of it). */
  onTake: (item: InventoryItem, qty: number) => void
  /** Move coins between the stash and `takeToId`. */
  onCoins: (direction: 'take' | 'deposit', coin: CoinKey, amount: number) => void
  /** DM only: add a custom row straight into the stash (players use → stash). */
  onAdd?: (name: string) => void
  /** DM only: delete a row outright. */
  onRemove?: (itemId: string) => void
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function StashBox({
  stash,
  takeToName,
  actions
}: {
  stash: PartyStash
  /** Who receives takes/deposits — shown on the buttons ("Take → Cumb"). */
  takeToName: string | null
  actions: StashActions
}) {
  const [amount, setAmount] = useState('')
  const [denom, setDenom] = useState<CoinKey>('gp')
  const [draft, setDraft] = useState('')
  const coins = (direction: 'take' | 'deposit') => {
    const n = Math.floor(Number(amount))
    if (!Number.isFinite(n) || n <= 0) return
    setAmount('')
    actions.onCoins(direction, denom, n)
  }
  return (
    <div className="space-y-2 text-xs">
      <div className="space-y-px">
        {stash.items.map((item) => (
          <StashRow key={item.id} item={item} takeToName={takeToName} actions={actions} />
        ))}
        {stash.items.length === 0 && (
          <p className="text-[11px] text-hearth-muted/60">
            The bag is empty — send items here with “→ stash” on any sheet row.
          </p>
        )}
      </div>
      {actions.onAdd && (
        <div className="flex gap-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) {
                actions.onAdd!(draft.trim())
                setDraft('')
              }
            }}
            placeholder="+ drop loot into the stash…"
            className="min-w-0 flex-1 rounded border border-hearth-border bg-hearth-bg px-2 py-1 text-hearth-text placeholder:text-hearth-muted/40 focus:border-hearth-gold focus:outline-none"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-hearth-border pt-1.5">
        <span className="text-[11px] text-hearth-muted" title="Shared coins — the party fund">
          💰{' '}
          {COIN_KEYS.filter((k) => (stash.coins[k] ?? 0) > 0)
            .map((k) => `${stash.coins[k]} ${k}`)
            .join(' · ') || 'no coins'}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10"
            className="w-12 rounded border border-hearth-border bg-hearth-bg px-1 py-px text-center text-hearth-text placeholder:text-hearth-muted/30 focus:border-hearth-ember focus:outline-none"
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
          {takeToName && (
            <>
              <button
                onClick={() => coins('take')}
                className="rounded border border-hearth-border px-1.5 py-px text-[11px] text-hearth-muted hover:border-hearth-gold hover:text-hearth-gold"
                title={`Stash → ${takeToName}'s pouch (makes change if needed)`}
              >
                take
              </button>
              <button
                onClick={() => coins('deposit')}
                className="rounded border border-hearth-border px-1.5 py-px text-[11px] text-hearth-muted hover:border-hearth-gold hover:text-hearth-gold"
                title={`${takeToName}'s pouch → stash (makes change if needed)`}
              >
                deposit
              </button>
            </>
          )}
        </span>
      </div>
      {stash.log.length > 0 && (
        <div className="max-h-28 space-y-px overflow-y-auto border-t border-hearth-border pt-1 text-[10px] text-hearth-muted">
          {stash.log.slice(0, 20).map((l, i) => (
            <div key={`${l.ts}:${i}`} className="flex gap-1.5">
              <span className="text-hearth-text">{l.who}</span>
              <span className="min-w-0 flex-1 truncate">{l.text}</span>
              <span className="flex-none text-hearth-muted/50">{timeAgo(l.ts)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StashRow({
  item,
  takeToName,
  actions
}: {
  item: InventoryItem
  takeToName: string | null
  actions: StashActions
}) {
  const total = item.qty ?? 1
  const [take, setTake] = useState(total)
  return (
    <div className="group/srow flex items-center gap-1.5 rounded px-1 py-px hover:bg-hearth-panel2/60">
      <span className="min-w-0 flex-1 truncate text-hearth-text" title={item.notes}>
        {item.name}
        {total > 1 && <span className="text-hearth-muted"> ×{total}</span>}
        {item.charges && (
          <span className="text-[10px] text-hearth-muted"> ({item.charges.max - (item.charges.used ?? 0)}⚡)</span>
        )}
      </span>
      {takeToName && (
        <>
          {total > 1 && (
            <input
              type="number"
              min={1}
              max={total}
              value={Math.min(take, total)}
              onChange={(e) => setTake(Math.max(1, Math.min(total, Number(e.target.value) || 1)))}
              className="w-10 rounded border border-hearth-border bg-hearth-bg px-1 py-px text-center text-[11px] text-hearth-text"
              title="How many to take"
            />
          )}
          <button
            onClick={() => actions.onTake(item, Math.min(take, total))}
            className="flex-none rounded border border-hearth-border px-1.5 py-px text-[11px] text-hearth-muted hover:border-hearth-gold hover:text-hearth-gold"
            title={`Move to ${takeToName} (logged for the table)`}
          >
            take
          </button>
        </>
      )}
      {actions.onRemove && (
        <button
          onClick={() => actions.onRemove!(item.id)}
          className="flex-none text-hearth-muted opacity-0 hover:text-red-400 group-hover/srow:opacity-100"
          title="Delete from the stash"
        >
          ×
        </button>
      )}
    </div>
  )
}
