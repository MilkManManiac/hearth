import type { CSSProperties, ReactNode } from 'react'
import {
  scriptHighlightColor,
  scriptTextColor,
  type ScriptBlock,
  type ScriptDoc,
  type ScriptInline
} from '../../shared/types'
import NoteLinkPill from './NoteLinkPill'

/**
 * Compact read-only renderer for a note's ScriptDoc body — used where the full
 * TipTap editor is overkill (the run-mode right panel). [[Links]] are live
 * (click to jump); cues (shouldn't occur in notes) degrade to plain labels.
 */
export default function NoteBody({ doc, className }: { doc: ScriptDoc; className?: string }) {
  return <div className={className}>{doc.map((b, i) => renderBlock(b, i))}</div>
}

function inlineStyle(node: Extract<ScriptInline, { type: 'text' }>): {
  className: string
  style: CSSProperties
} {
  const cls = ['whitespace-pre-wrap']
  const style: CSSProperties = {}
  for (const m of node.marks ?? []) {
    if (m.type === 'bold') cls.push('font-semibold')
    else if (m.type === 'italic') cls.push('italic')
    else if (m.type === 'color') style.color = scriptTextColor(m.value)
    else if (m.type === 'highlight') {
      style.backgroundColor = scriptHighlightColor(m.value)
      style.borderRadius = '2px'
    }
  }
  return { className: cls.join(' '), style }
}

function renderInline(node: ScriptInline, key: number): ReactNode {
  if (node.type === 'text') {
    const { className, style } = inlineStyle(node)
    return (
      <span key={key} className={className} style={style}>
        {node.text}
      </span>
    )
  }
  if (node.type === 'link') {
    return <NoteLinkPill key={key} refId={node.ref} label={node.label} />
  }
  return (
    <span key={key} className="mx-0.5 rounded bg-hearth-panel2 px-1 text-xs text-hearth-muted">
      {node.label ?? node.ref}
    </span>
  )
}

const HEADING_CLASS: Record<number, string> = {
  1: 'mt-3 mb-1 text-lg font-semibold text-hearth-text',
  2: 'mt-2.5 mb-1 text-base font-semibold text-hearth-text',
  3: 'mt-2 mb-0.5 text-sm font-semibold text-hearth-muted'
}

function renderBlock(block: ScriptBlock, key: number): ReactNode {
  if (block.type === 'callout') {
    return (
      <div
        key={key}
        className="script-callout my-2 rounded-r border-l-2 border-hearth-gold/60 bg-hearth-gold/5 px-2.5 py-1.5 text-[13px] text-hearth-muted"
      >
        {block.content.map((b, i) => renderBlock(b, i))}
      </div>
    )
  }
  const inlines = block.content.map((n, i) => renderInline(n, i))
  if (block.type === 'heading') {
    const cls = HEADING_CLASS[block.level]
    if (block.level === 1) return <h3 key={key} className={cls}>{inlines}</h3>
    if (block.level === 2) return <h4 key={key} className={cls}>{inlines}</h4>
    return <h5 key={key} className={cls}>{inlines}</h5>
  }
  return (
    <p key={key} className="my-1.5 text-sm leading-6 text-hearth-text">
      {inlines}
    </p>
  )
}
