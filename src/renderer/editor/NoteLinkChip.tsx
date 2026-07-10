import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { NOTE_KINDS } from '../../shared/types'
import { openNoteLink } from '../components/NoteLinkPill'
import { useStore } from '../store'

/**
 * Inline atomic [[wiki-link]] chip inside the editor. Shows the target note's
 * live title (or the authored label override). Plain click selects the node
 * like any atom (so Backspace deletes it); Ctrl/Cmd+click follows the link —
 * the same convention as editing in Obsidian/VS Code.
 */
export default function NoteLinkChip({ node, selected }: NodeViewProps) {
  const ref = (node.attrs.ref as string) ?? ''
  const label = (node.attrs.label as string) || ''
  const target = useStore((s) => s.campaign.notes.find((n) => n.id === ref))
  const display = label || target?.title || ref
  const icon = target ? (NOTE_KINDS[target.kind]?.icon ?? '📝') : '∅'

  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      onClick={(e: React.MouseEvent) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault()
          e.stopPropagation()
          openNoteLink(ref)
        }
      }}
      title={
        target
          ? `${NOTE_KINDS[target.kind]?.label ?? 'Note'}: ${target.title} — Ctrl+click to open`
          : `No note "${ref}" exists yet`
      }
      className={`mx-px inline-flex cursor-pointer select-none items-baseline gap-1 rounded px-0.5 align-baseline ${
        target
          ? 'text-hearth-gold underline decoration-hearth-gold/40 decoration-dotted underline-offset-2 hover:bg-hearth-gold/10'
          : 'border border-dashed border-hearth-border text-hearth-muted'
      } ${selected ? 'ring-2 ring-hearth-ember/70' : ''}`}
    >
      <span aria-hidden className="text-[0.85em]">
        {icon}
      </span>
      {display}
    </NodeViewWrapper>
  )
}
