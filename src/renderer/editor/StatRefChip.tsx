import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import type { StatRefInline } from '../../shared/types'
import { CUE_BADGE_CLASS } from '../lib/cueMeta'
import { STAT_CHIP_CLASS, STAT_TEXT, STAT_TITLE } from '../lib/statRef'

/**
 * Editor chip for a monster/trap stat-block ref. Drag to reposition, × to
 * delete; ⚙ edits the instance label ("Mimic A") — labeled chips of the same
 * monster track HP separately in run mode.
 */
export default function StatRefChip({ node, deleteNode, selected, updateAttributes }: NodeViewProps) {
  const kind = (node.attrs.kind as StatRefInline['kind']) ?? 'monster'
  const ref = node.attrs.ref as string
  const label = (node.attrs.label as string) || ''
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  return (
    <NodeViewWrapper
      as="span"
      ref={rootRef}
      className={`cue-chip relative mx-0.5 inline-flex cursor-grab select-none items-center gap-1.5 rounded border px-1.5 py-0.5 align-middle text-sm ${
        STAT_CHIP_CLASS[kind]
      } ${selected ? 'ring-2 ring-hearth-ember/70' : ''}`}
      data-drag-handle
      contentEditable={false}
      title={STAT_TITLE[kind]}
    >
      <span aria-hidden className={CUE_BADGE_CLASS}>
        {STAT_TEXT[kind]}
      </span>
      <span>{label || ref}</span>
      <button
        type="button"
        title='Instance label — name this copy ("Mimic A") so it tracks its own HP'
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={`flex h-4 w-4 items-center justify-center rounded-full text-[11px] leading-none hover:bg-black/30 ${
          label || open ? 'opacity-100' : 'opacity-50 hover:opacity-100'
        }`}
      >
        ⚙
      </button>
      <button
        type="button"
        title="Remove stat-block ref"
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
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute left-0 top-full z-40 mt-1 flex w-56 cursor-default flex-col gap-2 rounded-md border border-hearth-border bg-hearth-panel2 p-2.5 text-xs text-hearth-text shadow-card"
        >
          <label className="flex items-center gap-2" title="Shown on the chip; separate labels = separate HP pools">
            <span className="w-14 flex-none text-hearth-muted">Label</span>
            <input
              type="text"
              placeholder={ref}
              value={label}
              onChange={(e) => updateAttributes({ label: e.target.value })}
              className="min-w-0 flex-1 rounded border border-hearth-border bg-hearth-bg px-1.5 py-0.5"
            />
          </label>
          <label className="flex items-center gap-2" title="Compendium/homebrew key this chip points at">
            <span className="w-14 flex-none text-hearth-muted">Ref</span>
            <input
              type="text"
              value={ref}
              onChange={(e) => updateAttributes({ ref: e.target.value })}
              className="min-w-0 flex-1 rounded border border-hearth-border bg-hearth-bg px-1.5 py-0.5"
            />
          </label>
        </span>
      )}
    </NodeViewWrapper>
  )
}
