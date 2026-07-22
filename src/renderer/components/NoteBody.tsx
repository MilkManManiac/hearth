import type { CSSProperties, ReactNode } from 'react'
import {
  scriptHighlightColor,
  scriptTextColor,
  type ScriptBlock,
  type ScriptDoc,
  type ScriptInline
} from '../../shared/types'
import { cueDisplayLabel } from '../lib/cueMeta'
import NoteLinkPill from './NoteLinkPill'
import StatRefPill from './StatRefPill'

/**
 * Read-only renderer for a note's ScriptDoc body. [[Links]] are live (plain
 * click jumps, hover peeks); checklists tick live when `onToggleCheck` is
 * wired; cues (shouldn't occur in notes) degrade to plain labels.
 * Two sizes: compact (right panel, peek cards — default) and `page` (the full
 * note page's read mode).
 */
export default function NoteBody({
  doc,
  className,
  onToggleCheck,
  page = false
}: {
  doc: ScriptDoc
  className?: string
  /** Wire this to persist checklist ticks (path = block indices, callouts descend). */
  onToggleCheck?: (path: number[], checked: boolean) => void
  /** Full-page reading typography instead of the compact panel size. */
  page?: boolean
}) {
  return (
    <div className={className}>
      {doc.map((b, i) => renderBlock(b, i, [i], page, onToggleCheck))}
    </div>
  )
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
  if (node.type === 'statref') {
    return <StatRefPill key={key} kind={node.kind} refId={node.ref} label={node.label} />
  }
  return (
    <span key={key} className="mx-0.5 rounded bg-hearth-panel2 px-1 text-xs text-hearth-muted">
      {cueDisplayLabel(node.label, node.ref)}
    </span>
  )
}

const HEADING_COMPACT: Record<number, string> = {
  1: 'mt-3 mb-1 text-lg font-semibold text-hearth-text',
  2: 'mt-2.5 mb-1 text-base font-semibold text-hearth-text',
  3: 'mt-2 mb-0.5 text-sm font-semibold text-hearth-muted'
}
const HEADING_PAGE: Record<number, string> = {
  1: 'mt-5 mb-1.5 font-display text-2xl font-semibold text-hearth-text',
  2: 'mt-4 mb-1 text-lg font-semibold text-hearth-text',
  3: 'mt-3 mb-1 text-base font-semibold text-hearth-muted'
}

function renderBlock(
  block: ScriptBlock,
  key: number,
  path: number[],
  page: boolean,
  onToggleCheck?: (path: number[], checked: boolean) => void
): ReactNode {
  if (block.type === 'callout') {
    return (
      <div
        key={key}
        className={`script-callout my-2 rounded-r border-l-2 border-hearth-gold/60 bg-hearth-gold/5 text-hearth-muted ${
          page ? 'px-3.5 py-2 text-[14px] leading-relaxed' : 'px-2.5 py-1.5 text-[13px]'
        }`}
      >
        {block.content.map((b, i) => renderBlock(b, i, [...path, i], page, onToggleCheck))}
      </div>
    )
  }
  const inlines = block.content.map((n, i) => renderInline(n, i))
  if (block.type === 'check') {
    return (
      <div key={key} className={`my-1 flex items-start gap-2 ${page ? 'text-[15px]' : 'text-sm'}`}>
        <input
          type="checkbox"
          checked={!!block.checked}
          disabled={!onToggleCheck}
          onChange={(e) => onToggleCheck?.(path, e.target.checked)}
          title={onToggleCheck ? 'Tick when it lands at the table' : undefined}
          className="mt-[0.3em] h-3.5 w-3.5 shrink-0 cursor-pointer accent-hearth-ember disabled:cursor-default"
        />
        <span
          className={
            block.checked ? 'text-hearth-muted line-through decoration-hearth-muted/50' : 'text-hearth-text'
          }
        >
          {inlines}
        </span>
      </div>
    )
  }
  if (block.type === 'heading') {
    const cls = (page ? HEADING_PAGE : HEADING_COMPACT)[block.level]
    if (block.level === 1) return <h3 key={key} className={cls}>{inlines}</h3>
    if (block.level === 2) return <h4 key={key} className={cls}>{inlines}</h4>
    return <h5 key={key} className={cls}>{inlines}</h5>
  }
  return (
    <p key={key} className={`text-hearth-text ${page ? 'my-2 text-[15.5px] leading-7' : 'my-1.5 text-sm leading-6'}`}>
      {inlines}
    </p>
  )
}
