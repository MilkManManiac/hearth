import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import type { CueKind } from '../../shared/types'

const KIND_CLASS: Record<CueKind, string> = {
  music: 'border-hearth-ember/60 bg-hearth-ember/15 text-hearth-ember',
  sfx: 'border-hearth-gold/60 bg-hearth-gold/10 text-hearth-gold',
  image: 'border-sky-500/50 bg-sky-500/10 text-sky-300'
}

/**
 * Inline atomic cue chip rendered inside the editor. The whole node is
 * draggable (ProseMirror handles repositioning); the × deletes it, and the
 * node also deletes as a unit via Backspace/Delete when selected.
 */
export default function CueChip({ node, deleteNode, selected }: NodeViewProps) {
  const kind = (node.attrs.kind as CueKind) ?? 'sfx'
  const label = (node.attrs.label as string) || (node.attrs.ref as string)

  return (
    <NodeViewWrapper
      as="span"
      className={`cue-chip mx-0.5 inline-flex cursor-grab select-none items-center gap-1 rounded border px-1.5 py-0.5 align-middle text-sm ${
        KIND_CLASS[kind]
      } ${selected ? 'ring-2 ring-hearth-ember/70' : ''}`}
      data-drag-handle
      contentEditable={false}
    >
      <span>{label}</span>
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
    </NodeViewWrapper>
  )
}
