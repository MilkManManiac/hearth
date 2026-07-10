import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import type { CueKind, Scene } from '../../shared/types'
import { useStore } from '../store'

const KIND_CLASS: Record<CueKind, string> = {
  music: 'border-hearth-ember/60 bg-hearth-ember/15 text-hearth-ember',
  sfx: 'border-hearth-gold/60 bg-hearth-gold/10 text-hearth-gold',
  image: 'border-sky-500/50 bg-sky-500/10 text-sky-300',
  amb: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
}

const CUE_ICON: Record<CueKind, string> = { music: '▶', sfx: '🔊', image: '🖼', amb: '〜' }

const stem = (file: string) => (file.split('/').pop() ?? file).replace(/\.[^.]+$/, '')

/** Same-kind retarget candidates from the scene's palettes (value = cue ref). */
function targetOptions(scene: Scene | undefined, kind: CueKind): { value: string; display: string }[] {
  if (!scene) return []
  switch (kind) {
    case 'music':
      return (scene.music ?? []).map((m) => ({ value: m.id, display: m.label }))
    case 'sfx':
      return (scene.sfx ?? []).map((s) => ({ value: s.id, display: s.label }))
    case 'amb':
      return (scene.ambience ?? []).map((a) => ({ value: a.file, display: stem(a.file) }))
    case 'image':
      return (scene.images ?? []).map((img) => ({ value: img.file, display: img.caption ?? stem(img.file) }))
  }
}

/**
 * Inline atomic cue chip rendered inside the editor. The whole node is
 * draggable (ProseMirror handles repositioning); the × deletes it, and the
 * node also deletes as a unit via Backspace/Delete when selected.
 *
 * Amb cues additionally get a ⚙ lifecycle popover: target volume, fade in/out
 * durations, and whether the bed auto-stops at the end of its section — the
 * "pre-mix it while planning so you don't mix while talking" settings.
 */
export default function CueChip({ node, deleteNode, selected, updateAttributes }: NodeViewProps) {
  const kind = (node.attrs.kind as CueKind) ?? 'sfx'
  const ref = node.attrs.ref as string
  const label = (node.attrs.label as string) || ref
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLElement | null>(null)
  const scene = useStore((s) => s.campaign.scenes.find((sc) => sc.id === s.currentSceneId))
  const targets = targetOptions(scene, kind)

  // Close the popover on any click outside the chip.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const volume = node.attrs.volume as number | null
  const fadeInMs = node.attrs.fadeInMs as number | null
  const fadeOutMs = node.attrs.fadeOutMs as number | null
  const until = node.attrs.until as string | null
  const hasLifecycle = volume != null || fadeInMs != null || fadeOutMs != null || until === 'section'

  return (
    <NodeViewWrapper
      as="span"
      ref={rootRef}
      className={`cue-chip relative mx-0.5 inline-flex cursor-grab select-none items-center gap-1 rounded border px-1.5 py-0.5 align-middle text-sm ${
        KIND_CLASS[kind]
      } ${selected ? 'ring-2 ring-hearth-ember/70' : ''}`}
      data-drag-handle
      contentEditable={false}
    >
      <span>{label}</span>
      <button
        type="button"
        title={
          kind === 'amb'
            ? 'Cue settings: what it plays, target volume, fade in/out, when it stops'
            : 'Cue settings: what it plays'
        }
        onMouseDown={(e) => {
          // preventDefault so the click doesn't move the selection/blur the editor
          e.preventDefault()
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={`flex h-4 w-4 items-center justify-center rounded-full text-[11px] leading-none hover:bg-black/30 ${
          hasLifecycle || open ? 'opacity-100' : 'opacity-50 hover:opacity-100'
        }`}
      >
        ⚙
      </button>
      <button
        type="button"
        title="Remove cue"
        // preventDefault so the click doesn't move the selection/blur the editor
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          deleteNode()
        }}
        className="cue-x -mr-0.5 flex h-4 w-4 items-center justify-center rounded-full text-xs leading-none opacity-70 hover:bg-black/30 hover:opacity-100"
      >
        ×
      </button>

      {open && (
        <span
          contentEditable={false}
          // Keep clicks inside the form away from ProseMirror's selection handling.
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute left-0 top-full z-40 mt-1 flex w-56 cursor-default flex-col gap-2 rounded-md border border-hearth-border bg-hearth-panel2 p-2.5 text-xs text-hearth-text shadow-card"
        >
          <LifecycleField label="Plays" hint="Retarget this cue to another of the scene's assets — no delete + re-drag">
            <select
              value={targets.some((t) => t.value === ref) ? ref : '::current'}
              onChange={(e) => {
                const t = targets.find((o) => o.value === e.target.value)
                if (t) updateAttributes({ ref: t.value, label: `${CUE_ICON[kind]} ${t.display}` })
              }}
              className="min-w-0 flex-1 rounded border border-hearth-border bg-hearth-bg px-1.5 py-0.5"
            >
              {!targets.some((t) => t.value === ref) && (
                <option value="::current" disabled>
                  {ref} (not in scene)
                </option>
              )}
              {targets.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.display}
                </option>
              ))}
            </select>
          </LifecycleField>
          {kind === 'amb' && (
            <>
          <LifecycleField label="Fades up to" hint="% of full volume — pre-mix beds against each other">
            <input
              type="number"
              min={0}
              max={100}
              placeholder="bed default"
              value={volume == null ? '' : Math.round(volume * 100)}
              onChange={(e) => {
                const v = e.target.value
                updateAttributes({
                  volume: v === '' ? null : Math.min(1, Math.max(0, Number(v) / 100))
                })
              }}
              className="w-16 rounded border border-hearth-border bg-hearth-bg px-1.5 py-0.5"
            />
            <span className="text-hearth-muted">%</span>
          </LifecycleField>
          <LifecycleField label="Fade in" hint="seconds to reach the target volume">
            <SecondsInput ms={fadeInMs} onChange={(ms) => updateAttributes({ fadeInMs: ms })} />
          </LifecycleField>
          <LifecycleField label="Fade out" hint="seconds to die away when it stops">
            <SecondsInput ms={fadeOutMs} onChange={(ms) => updateAttributes({ fadeOutMs: ms })} />
          </LifecycleField>
          <LifecycleField label="Stops" hint="section = fades out when the teleprompter passes the next heading">
            <select
              value={until === 'section' ? 'section' : 'manual'}
              onChange={(e) => updateAttributes({ until: e.target.value === 'section' ? 'section' : null })}
              className="flex-1 rounded border border-hearth-border bg-hearth-bg px-1.5 py-0.5"
            >
              <option value="manual">when toggled off</option>
              <option value="section">at end of section</option>
            </select>
          </LifecycleField>
            </>
          )}
        </span>
      )}
    </NodeViewWrapper>
  )
}

function LifecycleField({
  label,
  hint,
  children
}: {
  label: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <label title={hint} className="flex items-center gap-2">
      <span className="w-16 flex-none text-hearth-muted">{label}</span>
      {children}
    </label>
  )
}

/** Duration input in seconds, stored as ms (null = engine default, ~0.8s). */
function SecondsInput({ ms, onChange }: { ms: number | null; onChange: (ms: number | null) => void }) {
  return (
    <>
      <input
        type="number"
        min={0}
        step={0.5}
        placeholder="0.8"
        value={ms == null ? '' : ms / 1000}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' ? null : Math.max(0, Math.round(Number(v) * 1000)))
        }}
        className="w-16 rounded border border-hearth-border bg-hearth-bg px-1.5 py-0.5"
      />
      <span className="text-hearth-muted">s</span>
    </>
  )
}
