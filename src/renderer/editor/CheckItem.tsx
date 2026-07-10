import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'

/**
 * A checklist line inside the editor: live checkbox + editable text. The
 * secrets-&-clues unit — tick it when it lands at the table; unchecked items
 * carry into the next session's prep.
 */
export default function CheckItem({ node, updateAttributes }: NodeViewProps) {
  const checked = !!node.attrs.checked
  return (
    <NodeViewWrapper as="div" className="script-check flex items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        contentEditable={false}
        onMouseDown={(e) => {
          // Toggle without moving the text selection / blurring the editor.
          e.preventDefault()
          e.stopPropagation()
          updateAttributes({ checked: !checked })
        }}
        onChange={() => {}}
        className="mt-[0.45em] h-3.5 w-3.5 shrink-0 cursor-pointer accent-hearth-ember"
      />
      <NodeViewContent
        as="div"
        className={`min-w-0 flex-1 ${checked ? 'text-hearth-muted line-through decoration-hearth-muted/50' : ''}`}
      />
    </NodeViewWrapper>
  )
}
