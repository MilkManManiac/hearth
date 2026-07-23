import type { JSONContent } from '@tiptap/core'
import type {
  CueKind,
  ScriptBlock,
  ScriptDoc,
  ScriptInline,
  ScriptMark
} from '../../shared/types'

// ---------------------------------------------------------------------------
// ScriptDoc (our framework-neutral tree) <-> TipTap/ProseMirror JSON.
// This is the only place that knows both shapes; the editor speaks TipTap JSON,
// disk speaks ScriptDoc.
// ---------------------------------------------------------------------------

function markToJSON(m: ScriptMark): { type: string; attrs?: Record<string, unknown> } {
  switch (m.type) {
    case 'bold':
      return { type: 'bold' }
    case 'italic':
      return { type: 'italic' }
    case 'color':
      return { type: 'scriptColor', attrs: { value: m.value } }
    case 'highlight':
      return { type: 'scriptHighlight', attrs: { value: m.value } }
  }
}

function inlineToJSON(node: ScriptInline): JSONContent | null {
  if (node.type === 'link') {
    return { type: 'noteLink', attrs: { ref: node.ref, label: node.label ?? '' } }
  }
  if (node.type === 'statref') {
    return { type: 'statRef', attrs: { kind: node.kind, ref: node.ref, label: node.label ?? '' } }
  }
  if (node.type === 'cue') {
    return {
      type: 'cue',
      attrs: {
        kind: node.kind,
        ref: node.ref,
        label: node.label ?? '',
        volume: node.volume ?? null,
        fadeInMs: node.fadeInMs ?? null,
        fadeOutMs: node.fadeOutMs ?? null,
        until: node.until ?? null
      }
    }
  }
  if (!node.text) return null // ProseMirror forbids empty text nodes
  const marks = node.marks?.map(markToJSON)
  return marks && marks.length ? { type: 'text', text: node.text, marks } : { type: 'text', text: node.text }
}

function inlinesToJSON(content: ScriptInline[]): JSONContent[] {
  return content.map(inlineToJSON).filter((n): n is JSONContent => n !== null)
}

function blockToJSON(block: Exclude<ScriptBlock, { type: 'bullet' }>): JSONContent {
  switch (block.type) {
    case 'paragraph': {
      const content = inlinesToJSON(block.content)
      return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
    }
    case 'heading': {
      const content = inlinesToJSON(block.content)
      const base = { type: 'heading', attrs: { level: block.level } }
      return content.length ? { ...base, content } : base
    }
    case 'callout':
      return { type: 'callout', content: blocksToJSON(block.content) }
    case 'check': {
      const content = inlinesToJSON(block.content)
      const base = { type: 'check', attrs: { checked: !!block.checked } }
      return content.length ? { ...base, content } : base
    }
  }
}

/**
 * Blocks → TipTap, re-grouping consecutive flat `bullet` blocks into the
 * bulletList/orderedList structure ProseMirror's schema requires.
 */
function blocksToJSON(blocks: ScriptBlock[]): JSONContent[] {
  const out: JSONContent[] = []
  let run: { ordered: boolean; items: JSONContent[] } | null = null
  const flush = (): void => {
    if (run) out.push({ type: run.ordered ? 'orderedList' : 'bulletList', content: run.items })
    run = null
  }
  for (const b of blocks) {
    if (b.type === 'bullet') {
      const ordered = !!b.ordered
      if (!run || run.ordered !== ordered) {
        flush()
        run = { ordered, items: [] }
      }
      const content = inlinesToJSON(b.content)
      run.items.push({
        type: 'listItem',
        content: [content.length ? { type: 'paragraph', content } : { type: 'paragraph' }]
      })
      continue
    }
    flush()
    out.push(blockToJSON(b))
  }
  flush()
  return out
}

/** ScriptDoc -> a TipTap `doc` JSON node. */
export function docToTiptap(doc: ScriptDoc): JSONContent {
  const content = blocksToJSON(doc)
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

// --- reverse ---------------------------------------------------------------

function markFromJSON(m: { type?: string; attrs?: Record<string, unknown> }): ScriptMark | null {
  switch (m.type) {
    case 'bold':
      return { type: 'bold' }
    case 'italic':
      return { type: 'italic' }
    case 'scriptColor':
      return { type: 'color', value: String(m.attrs?.value ?? '') }
    case 'scriptHighlight':
      return { type: 'highlight', value: String(m.attrs?.value ?? '') }
    default:
      warnDropped('mark', m.type)
      return null // strike/code/etc are disabled, but ignore anything unknown
  }
}

/**
 * A mapping miss silently deletes content on the next save — in dev, say so
 * loudly (audit P2): a new node/mark type must be added HERE before it ships.
 */
function warnDropped(what: 'mark' | 'block' | 'inline', type: string | undefined): void {
  if (import.meta.env.DEV) {
    console.warn(`[mapping] dropping unknown ${what} type "${type}" — add it to mapping.ts or it's data loss`)
  }
}

function inlineFromJSON(node: JSONContent): ScriptInline | null {
  if (node.type === 'noteLink') {
    const a = node.attrs ?? {}
    const link: ScriptInline = { type: 'link', ref: String(a.ref ?? '') }
    if (a.label) link.label = String(a.label)
    return link
  }
  if (node.type === 'cue') {
    const a = node.attrs ?? {}
    const num = (v: unknown): number | undefined => {
      const n = Number(v)
      return v == null || v === '' || !Number.isFinite(n) ? undefined : n
    }
    return {
      type: 'cue',
      kind: (a.kind as CueKind) ?? 'sfx',
      ref: String(a.ref ?? ''),
      label: a.label ? String(a.label) : undefined,
      volume: num(a.volume),
      fadeInMs: num(a.fadeInMs),
      fadeOutMs: num(a.fadeOutMs),
      until: a.until === 'section' ? 'section' : undefined
    }
  }
  if (node.type === 'statRef') {
    const a = node.attrs ?? {}
    const sr: ScriptInline = {
      type: 'statref',
      kind: a.kind === 'trap' ? 'trap' : 'monster',
      ref: String(a.ref ?? '')
    }
    if (a.label) sr.label = String(a.label)
    return sr
  }
  if (node.type === 'text') {
    const text = node.text ?? ''
    if (!text) return null
    const marks = (node.marks ?? []).map(markFromJSON).filter((m): m is ScriptMark => m !== null)
    return marks.length ? { type: 'text', text, marks } : { type: 'text', text }
  }
  warnDropped('inline', node.type)
  return null // hardBreak etc. are disabled
}

function inlinesFromJSON(content: JSONContent[] | undefined): ScriptInline[] {
  return (content ?? []).map(inlineFromJSON).filter((n): n is ScriptInline => n !== null)
}

function blockFromJSON(node: JSONContent): ScriptBlock | null {
  switch (node.type) {
    case 'paragraph':
      return { type: 'paragraph', content: inlinesFromJSON(node.content) }
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 1))) as 1 | 2 | 3
      return { type: 'heading', level, content: inlinesFromJSON(node.content) }
    }
    case 'callout':
    case 'blockquote': // safety: if a blockquote slips in, treat it as a callout
      return { type: 'callout', content: blocksFromJSON(node.content) }
    case 'check': {
      const block: ScriptBlock = { type: 'check', content: inlinesFromJSON(node.content) }
      if (node.attrs?.checked) block.checked = true
      return block
    }
    default:
      warnDropped('block', node.type)
      return null
  }
}

/**
 * TipTap blocks → ScriptDoc, flattening bulletList/orderedList structure into
 * flat `bullet` blocks (each listItem paragraph = one bullet; nested lists
 * flatten into the run — v1 keeps the doc model list-depth-free on purpose).
 */
function blocksFromJSON(nodes: JSONContent[] | undefined): ScriptBlock[] {
  const out: ScriptBlock[] = []
  for (const node of nodes ?? []) {
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      const ordered = node.type === 'orderedList'
      for (const item of node.content ?? []) {
        for (const child of item.content ?? []) {
          if (child.type === 'bulletList' || child.type === 'orderedList') {
            out.push(...blocksFromJSON([child]))
          } else {
            const b: ScriptBlock = { type: 'bullet', content: inlinesFromJSON(child.content) }
            if (ordered) b.ordered = true
            out.push(b)
          }
        }
      }
      continue
    }
    const b = blockFromJSON(node)
    if (b) out.push(b)
  }
  return out
}

/** A TipTap `doc` JSON node -> ScriptDoc. */
export function tiptapToDoc(json: JSONContent): ScriptDoc {
  const blocks = blocksFromJSON(json.content)
  return blocks.length ? blocks : [{ type: 'paragraph', content: [] }]
}
