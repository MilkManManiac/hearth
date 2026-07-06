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
  if (node.type === 'cue') {
    return { type: 'cue', attrs: { kind: node.kind, ref: node.ref, label: node.label ?? '' } }
  }
  if (!node.text) return null // ProseMirror forbids empty text nodes
  const marks = node.marks?.map(markToJSON)
  return marks && marks.length ? { type: 'text', text: node.text, marks } : { type: 'text', text: node.text }
}

function inlinesToJSON(content: ScriptInline[]): JSONContent[] {
  return content.map(inlineToJSON).filter((n): n is JSONContent => n !== null)
}

function blockToJSON(block: ScriptBlock): JSONContent {
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
      return { type: 'callout', content: block.content.map(blockToJSON) }
  }
}

/** ScriptDoc -> a TipTap `doc` JSON node. */
export function docToTiptap(doc: ScriptDoc): JSONContent {
  const content = doc.map(blockToJSON)
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
      return null // strike/code/etc are disabled, but ignore anything unknown
  }
}

function inlineFromJSON(node: JSONContent): ScriptInline | null {
  if (node.type === 'cue') {
    const a = node.attrs ?? {}
    return {
      type: 'cue',
      kind: (a.kind as CueKind) ?? 'sfx',
      ref: String(a.ref ?? ''),
      label: a.label ? String(a.label) : undefined
    }
  }
  if (node.type === 'text') {
    const text = node.text ?? ''
    if (!text) return null
    const marks = (node.marks ?? []).map(markFromJSON).filter((m): m is ScriptMark => m !== null)
    return marks.length ? { type: 'text', text, marks } : { type: 'text', text }
  }
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
      return {
        type: 'callout',
        content: (node.content ?? []).map(blockFromJSON).filter((b): b is ScriptBlock => b !== null)
      }
    default:
      return null
  }
}

/** A TipTap `doc` JSON node -> ScriptDoc. */
export function tiptapToDoc(json: JSONContent): ScriptDoc {
  const blocks = (json.content ?? []).map(blockFromJSON).filter((b): b is ScriptBlock => b !== null)
  return blocks.length ? blocks : [{ type: 'paragraph', content: [] }]
}
