import { useEffect, useRef, useState } from 'react'
import type { AssetKind } from '../../shared/types'
import { CATEGORY_ORDER, categoryMeta } from '../../shared/types'
import { useStore } from '../store'
import PreviewScrubber from './PreviewScrubber'

/** "creatures/wolf_growl-03.wav" → "wolf_growl-03" */
function stem(rel: string): string {
  return (rel.split('/').pop() ?? rel).replace(/\.[^.]+$/, '')
}

/** "wolf_growl-03" → "Wolf Growl 03" */
function prettyName(rel: string): string {
  return stem(rel)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

/** Crude kind guess from path/filename tokens; the form is right there to fix it. */
function guessKind(rel: string): AssetKind {
  const hay = rel.toLowerCase()
  if (/music|theme|song|bgm/.test(hay)) return 'music'
  if (/amb|atmos|loop|bed/.test(hay)) return 'ambience'
  return 'sfx'
}

/** Prefill tags from the filename's words (editable, comma/space separated). */
function guessTags(rel: string): string {
  const words = stem(rel)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w))
  return [...new Set(words)].join(', ')
}

function parseTags(text: string): string[] {
  return [...new Set(text.toLowerCase().split(/[,\s]+/).filter(Boolean))]
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-hearth-border bg-hearth-bg px-1.5 py-0.5 font-mono text-[10px] text-hearth-text">
      {children}
    </kbd>
  )
}

const inputCls =
  'w-full rounded border border-hearth-border bg-hearth-bg px-3 py-1.5 text-sm text-hearth-text placeholder:text-hearth-muted focus:border-hearth-ember focus:outline-none'

/**
 * Sound triage: a keyboard-driven keep-or-cull review inbox over a drop folder
 * of downloaded candidates. Auditions play through the engine's preview path
 * (served read-only via asset:///.triage/…); keepers are COPIED into the
 * campaign + indexed in library.json — the source folder is never touched.
 */
export default function TriagePanel() {
  const triage = useStore((s) => s.triage)
  const close = useStore((s) => s.closeTriage)
  const previewAsset = useStore((s) => s.previewAsset)
  const previewingFile = useStore((s) => s.previewingFile)
  const pushToast = useStore((s) => s.pushToast)

  const [pos, setPos] = useState(0)
  const [decisions, setDecisions] = useState<Record<number, 'kept' | 'rejected'>>({})
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // Keep-form fields (prefilled from the filename each time the form opens).
  const [kind, setKind] = useState<AssetKind>('sfx')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState('')
  // Captured once per triage session, stamped on every kept entry.
  const [source, setSource] = useState('')
  const [license, setLicense] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  const token = triage?.token
  const files = triage?.files ?? []
  const done = pos >= files.length
  const current = done ? null : files[pos]
  const auditionFile = triage && current ? `.triage/${triage.token}/${current.rel}` : null
  const playing = !!auditionFile && previewingFile === auditionFile
  const kept = Object.values(decisions).filter((d) => d === 'kept').length
  const rejected = Object.values(decisions).filter((d) => d === 'rejected').length

  // Fresh session → reset the queue and the per-session source/license.
  useEffect(() => {
    setPos(0)
    setDecisions({})
    setFormOpen(false)
    setSource('')
    setLicense('')
  }, [token])

  // Auto-play the current candidate.
  useEffect(() => {
    if (!triage || pos >= triage.files.length) return
    void previewAsset(`.triage/${triage.token}/${triage.files[pos].rel}`)
  }, [triage, pos, previewAsset])

  const goTo = (next: number): void => {
    setFormOpen(false)
    if (next >= files.length) {
      // Entering the summary — stop whatever is still auditioning.
      const pf = useStore.getState().previewingFile
      if (pf?.startsWith('.triage/')) void previewAsset(pf)
    }
    setPos(next)
  }

  const openKeepForm = (): void => {
    if (!current) return
    setKind(guessKind(current.rel))
    setName(prettyName(current.rel))
    setCategory('')
    setTags(guessTags(current.rel))
    setFormOpen(true)
  }

  const reject = (): void => {
    if (done) return
    setDecisions((d) => ({ ...d, [pos]: 'rejected' }))
    goTo(pos + 1)
  }

  const confirmKeep = async (): Promise<void> => {
    if (!triage || !current || busy) return
    setBusy(true)
    try {
      await window.hearth.triageKeep({
        rel: current.rel,
        kind,
        name,
        category: category || undefined,
        tags: parseTags(tags),
        source: source.trim() || undefined,
        license: license.trim() || undefined
      })
      setDecisions((d) => ({ ...d, [pos]: 'kept' }))
      goTo(pos + 1)
    } catch (err) {
      pushToast(`Keep failed: ${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  // Focus the name field when the keep form opens.
  useEffect(() => {
    if (formOpen) nameRef.current?.select()
  }, [formOpen])

  // Keyboard loop: Space play/stop · K/Enter keep · J/Backspace/Delete reject · ←/→ skip · Esc close.
  useEffect(() => {
    if (!triage) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (formOpen) setFormOpen(false)
        else close()
        return
      }
      // While the keep form is open, typing owns the keyboard (Enter submits the form).
      if (formOpen || busy) return
      const t = e.target as HTMLElement | null
      if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return
      if (done) {
        if (e.key === 'Enter') close()
        return
      }
      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (auditionFile) void previewAsset(auditionFile)
          break
        case 'k':
        case 'K':
        case 'Enter':
          e.preventDefault()
          openKeepForm()
          break
        case 'j':
        case 'J':
        case 'Backspace':
        case 'Delete':
          e.preventDefault()
          reject()
          break
        case 'ArrowRight':
          e.preventDefault()
          if (pos < files.length - 1) goTo(pos + 1)
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (pos > 0) goTo(pos - 1)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!triage) return null

  const folderName = triage.root.split(/[\\/]/).pop() ?? triage.root
  const decision = decisions[pos]

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6"
      onClick={close}
    >
      <div
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-hearth-border bg-hearth-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-hearth-border px-4 py-3">
          <h2 className="text-lg font-semibold text-hearth-text">📥 Sound Triage</h2>
          <span className="max-w-[14rem] truncate text-xs text-hearth-muted" title={triage.root}>
            {folderName}
          </span>
          <div className="ml-auto flex items-center gap-3 text-xs text-hearth-muted">
            <span>
              {Math.min(pos + 1, files.length)} / {files.length}
            </span>
            <span className="text-hearth-gold">✓ {kept}</span>
            <span>✗ {rejected}</span>
            <button
              onClick={close}
              className="rounded px-2 py-1 text-hearth-muted hover:text-hearth-text"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {done ? (
          /* Session summary */
          <div className="flex flex-col items-center gap-3 px-6 py-10">
            <p className="text-lg text-hearth-text">Batch reviewed.</p>
            <p className="text-sm text-hearth-muted">
              Kept <span className="text-hearth-gold">{kept}</span> · rejected {rejected} · skipped{' '}
              {files.length - kept - rejected} of {files.length}. Source files were not touched.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => goTo(files.length - 1)}
                className="rounded border border-hearth-border bg-hearth-panel2 px-3 py-1.5 text-sm text-hearth-text hover:border-hearth-ember hover:text-hearth-ember"
              >
                ← Back
              </button>
              <button
                onClick={close}
                className="rounded border border-hearth-ember bg-hearth-ember/15 px-3 py-1.5 text-sm text-hearth-ember hover:bg-hearth-ember/30"
              >
                Done (Enter)
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 px-4 py-4">
            {/* Current candidate */}
            <div className="rounded border border-hearth-border/50 bg-hearth-panel2/40 px-3 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => auditionFile && previewAsset(auditionFile)}
                title={playing ? 'Stop (Space)' : 'Play (Space)'}
                className={`flex h-10 w-10 flex-none items-center justify-center rounded-full border text-lg transition-colors ${
                  playing
                    ? 'border-hearth-ember bg-hearth-ember/20 text-hearth-ember'
                    : 'border-hearth-border text-hearth-muted hover:border-hearth-ember hover:text-hearth-ember'
                }`}
              >
                {playing ? '■' : '▶'}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base text-hearth-text">
                  {current!.rel.split('/').pop()}
                </div>
                <div className="truncate text-xs text-hearth-muted">
                  {current!.rel.includes('/') ? current!.rel.slice(0, current!.rel.lastIndexOf('/')) + ' · ' : ''}
                  {fmtSize(current!.size)}
                </div>
              </div>
              {decision && (
                <span
                  className={`flex-none rounded px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                    decision === 'kept'
                      ? 'bg-hearth-emberdim/40 text-hearth-gold'
                      : 'bg-hearth-bg text-hearth-muted'
                  }`}
                >
                  {decision === 'kept' ? '✓ kept' : '✗ rejected'}
                </span>
              )}
            </div>
            {/* Audition scrubber — jump into the middle before judging. */}
            {playing && auditionFile && <PreviewScrubber file={auditionFile} />}
            </div>

            {formOpen ? (
              /* Keep form */
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void confirmKeep()
                }}
                className="space-y-2 rounded border border-hearth-border/50 bg-hearth-panel2/40 px-3 py-3"
              >
                <div className="flex gap-2">
                  <label className="flex-none text-xs text-hearth-muted">
                    Kind
                    <select
                      value={kind}
                      onChange={(e) => setKind(e.target.value as AssetKind)}
                      className={`${inputCls} mt-1`}
                    >
                      <option value="music">music</option>
                      <option value="ambience">ambience</option>
                      <option value="sfx">sfx</option>
                    </select>
                  </label>
                  <label className="flex-none text-xs text-hearth-muted">
                    Category
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className={`${inputCls} mt-1`}
                    >
                      <option value="">—</option>
                      {CATEGORY_ORDER.map((c) => (
                        <option key={c} value={c}>
                          {categoryMeta(c).icon} {categoryMeta(c).label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="min-w-0 flex-1 text-xs text-hearth-muted">
                    Name <span className="text-hearth-muted/60">(becomes the filename)</span>
                    <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} mt-1`} />
                  </label>
                </div>
                <label className="block text-xs text-hearth-muted">
                  Tags <span className="text-hearth-muted/60">(comma or space separated)</span>
                  <input value={tags} onChange={(e) => setTags(e.target.value)} className={`${inputCls} mt-1`} />
                </label>
                <div className="flex gap-2">
                  <label className="min-w-0 flex-1 text-xs text-hearth-muted">
                    Source <span className="text-hearth-muted/60">(kept for the session)</span>
                    <input
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      placeholder="e.g. itch.io / kmontesdev"
                      className={`${inputCls} mt-1`}
                    />
                  </label>
                  <label className="min-w-0 flex-1 text-xs text-hearth-muted">
                    License
                    <input
                      value={license}
                      onChange={(e) => setLicense(e.target.value)}
                      placeholder="e.g. CC0"
                      className={`${inputCls} mt-1`}
                    />
                  </label>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded border border-hearth-ember bg-hearth-ember/15 px-3 py-1.5 text-sm text-hearth-ember hover:bg-hearth-ember/30 disabled:opacity-50"
                  >
                    {busy ? 'Copying…' : '✓ Keep (Enter)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="rounded border border-hearth-border bg-hearth-panel2 px-3 py-1.5 text-sm text-hearth-muted hover:text-hearth-text"
                  >
                    Cancel (Esc)
                  </button>
                  <span className="ml-auto text-xs text-hearth-muted">
                    Copies into {kind}/ — the source file stays put.
                  </span>
                </div>
              </form>
            ) : (
              /* Decide buttons (mouse fallback for the keys) */
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => pos > 0 && goTo(pos - 1)}
                  disabled={pos === 0}
                  title="Previous (←)"
                  className="rounded border border-hearth-border bg-hearth-panel2 px-3 py-1.5 text-sm text-hearth-muted hover:text-hearth-text disabled:opacity-40"
                >
                  ← Prev
                </button>
                <button
                  onClick={openKeepForm}
                  className="rounded border border-hearth-ember bg-hearth-ember/15 px-4 py-1.5 text-sm text-hearth-ember hover:bg-hearth-ember/30"
                >
                  ✓ Keep (K)
                </button>
                <button
                  onClick={reject}
                  className="rounded border border-hearth-border bg-hearth-panel2 px-4 py-1.5 text-sm text-hearth-text hover:border-hearth-emberdim"
                >
                  ✗ Reject (J)
                </button>
                <button
                  onClick={() => goTo(pos + 1)}
                  disabled={pos >= files.length - 1}
                  title="Next (→)"
                  className="rounded border border-hearth-border bg-hearth-panel2 px-3 py-1.5 text-sm text-hearth-muted hover:text-hearth-text disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Key hints */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hearth-border px-4 py-2 text-xs text-hearth-muted">
          <span className="flex items-center gap-1"><Key>Space</Key> play / stop</span>
          <span className="flex items-center gap-1"><Key>K</Key> / <Key>Enter</Key> keep</span>
          <span className="flex items-center gap-1"><Key>J</Key> / <Key>⌫</Key> reject</span>
          <span className="flex items-center gap-1"><Key>←</Key> <Key>→</Key> prev / next</span>
          <span className="flex items-center gap-1"><Key>Esc</Key> close</span>
        </div>
      </div>
    </div>
  )
}
