import { useEffect, useMemo, useState } from 'react'
import {
  assetCategories,
  assetDisplayName,
  LIBRARY_MOODS,
  type AssetKind
} from '../../shared/types'
import { useStore } from '../store'

const KIND_ORDER: Record<AssetKind, number> = { music: 0, ambience: 1, sfx: 2 }
const KIND_LABEL: Record<AssetKind, string> = { music: 'MUS', ambience: 'AMB', sfx: 'SFX' }
const KIND_CLASS: Record<AssetKind, string> = {
  music: 'bg-hearth-ember/25 text-hearth-ember',
  ambience: 'bg-emerald-500/25 text-emerald-300',
  sfx: 'bg-hearth-gold/25 text-hearth-gold'
}

/**
 * 🎧 Review queue — the "listen and vibe it" flow (Wes, 2026-07-23): every
 * import lands unheard; this walks the unheard pile one sound at a time.
 * Each card auto-auditions, pre-selects a best-guess vibe (existing moods +
 * any vocabulary words hiding in tags/categories — the machine's
 * recommendation), and the DM confirms/corrects before Save marks it 🎧 heard.
 */
export default function ReviewQueue({ onClose }: { onClose: () => void }) {
  const assets = useStore((s) => s.campaign.library.assets)
  const updateLibraryAsset = useStore((s) => s.updateLibraryAsset)
  const previewAsset = useStore((s) => s.previewAsset)
  const previewingFile = useStore((s) => s.previewingFile)

  // Snapshot the queue at open (music first) so saves don't reshuffle the deck.
  const [queue] = useState<string[]>(() =>
    assets
      .filter((a) => !a.trash && !a.heard)
      .sort(
        (a, b) =>
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          assetDisplayName(a).localeCompare(assetDisplayName(b))
      )
      .map((a) => a.file)
  )
  const [i, setI] = useState(0)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [extra, setExtra] = useState('')
  const [saved, setSaved] = useState(0)

  const asset = useMemo(() => assets.find((a) => a.file === queue[i]) ?? null, [assets, queue, i])
  const finished = i >= queue.length

  // Window-level Esc (focus is often on body, not the card) — capture phase so
  // the Library's own Esc-to-close never sees it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewingFile])

  // New card: auto-audition and pre-select the vibe guess.
  useEffect(() => {
    if (!asset) return
    const guess = new Set<string>(asset.moods ?? [])
    for (const w of [...asset.tags, ...assetCategories(asset)])
      if ((LIBRARY_MOODS as readonly string[]).includes(w)) guess.add(w)
    setSel(guess)
    setExtra('')
    void previewAsset(asset.file)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.file])

  const stopPreview = () => {
    if (previewingFile) void previewAsset(previewingFile) // toggle = stop
  }
  const close = () => {
    stopPreview()
    onClose()
  }

  const toggle = (m: string) =>
    setSel((s) => {
      const n = new Set(s)
      if (n.has(m)) n.delete(m)
      else n.add(m)
      return n
    })

  const moodsOut = () => [
    ...new Set([
      ...sel,
      ...extra
        .toLowerCase()
        .split(/[,\s]+/)
        .filter(Boolean)
    ])
  ]

  const save = () => {
    if (!asset) return
    void updateLibraryAsset(asset.file, { moods: moodsOut(), heard: true })
    setSaved((n) => n + 1)
    setI((n) => n + 1)
  }
  const skip = () => setI((n) => n + 1)
  const trash = () => {
    if (!asset) return
    void updateLibraryAsset(asset.file, { trash: true })
    setI((n) => n + 1)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    } else if (e.key === 'Enter' && !finished && asset) {
      e.preventDefault()
      save()
    }
  }

  // The suggested chips: the shared vocabulary plus anything already selected
  // (custom words from earlier edits stay toggleable).
  const chipWords = [...new Set([...LIBRARY_MOODS, ...sel])]
  const playing = !!asset && previewingFile === asset.file

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6"
      onClick={close}
      onKeyDown={onKey}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-hearth-border bg-hearth-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <h3 className="text-base font-semibold text-hearth-text">🎧 Review queue</h3>
          <span className="text-xs text-hearth-muted">
            {finished ? `done — ${saved} vibed` : `${i + 1} / ${queue.length}`}
          </span>
          <button
            onClick={close}
            className="ml-auto rounded px-2 py-1 text-hearth-muted hover:text-hearth-text"
            title="Close (Esc) — progress is already saved"
          >
            ✕
          </button>
        </div>

        {finished || !asset ? (
          <div className="space-y-3 py-6 text-center">
            <div className="text-4xl" aria-hidden>
              🔥
            </div>
            <p className="text-sm text-hearth-text">
              Queue clear — {saved} sound{saved === 1 ? '' : 's'} vibed this pass.
            </p>
            <p className="text-xs text-hearth-muted">
              New imports land back here automatically (they arrive unheard).
            </p>
          </div>
        ) : (
          <>
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`rounded-sm px-1 py-px text-[9px] font-bold leading-none tracking-wider ${KIND_CLASS[asset.kind]}`}
              >
                {KIND_LABEL[asset.kind]}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-hearth-text">
                {assetDisplayName(asset)}
              </span>
              <button
                onClick={() => void previewAsset(asset.file)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  playing
                    ? 'border-hearth-ember bg-hearth-ember/15 text-hearth-ember'
                    : 'border-hearth-border text-hearth-muted hover:border-hearth-ember/60 hover:text-hearth-text'
                }`}
              >
                {playing ? '⏸ Stop' : '▶ Replay'}
              </button>
            </div>
            <p className="mb-3 truncate text-[11px] text-hearth-muted" title={asset.file}>
              {asset.file}
              {asset.tags.length > 0 && ` · ${asset.tags.slice(0, 5).join(', ')}`}
            </p>

            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
              What's the vibe? (pre-checked = my guess)
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {chipWords.map((m) => (
                <button
                  key={m}
                  onClick={() => toggle(m)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    sel.has(m)
                      ? 'border-hearth-gold bg-hearth-gold/15 text-hearth-gold'
                      : 'border-hearth-border text-hearth-muted hover:border-hearth-gold/50 hover:text-hearth-text'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="other words (space/comma separated)…"
              className="mb-4 w-full rounded border border-hearth-border bg-hearth-bg px-3 py-1.5 text-sm text-hearth-text placeholder:text-hearth-muted/60 focus:border-hearth-ember focus:outline-none"
            />

            <div className="flex items-center gap-2">
              <button
                onClick={trash}
                className="rounded border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/15"
                title="Junk — trash it and move on"
              >
                🚮 Trash
              </button>
              <button
                onClick={skip}
                className="rounded border border-hearth-border px-3 py-1.5 text-xs text-hearth-muted hover:text-hearth-text"
                title="Not sure yet — stays unheard, comes back next pass"
              >
                Skip →
              </button>
              <button
                onClick={save}
                className="ml-auto rounded-full border border-hearth-ember bg-hearth-ember/15 px-4 py-1.5 text-sm text-hearth-ember shadow-ember transition-colors hover:bg-hearth-ember/30"
                title="Save vibes + mark 🎧 heard, then next (Enter)"
              >
                ✓ Save & next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
