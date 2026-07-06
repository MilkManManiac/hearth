import type {
  CueKind,
  LegacyScriptNode,
  ScriptBlock,
  ScriptDoc,
  ScriptInline,
  ScriptMark
} from './types'

const CUE_RE = /\{\{\s*(music|sfx|image)\s*:\s*([^}]+?)\s*\}\}/g

const CUE_ICON: Record<CueKind, string> = {
  music: '▶',
  sfx: '🔊',
  image: '🖼'
}

function cueLabel(kind: CueKind, ref: string): string {
  return `${CUE_ICON[kind]} ${ref}`
}

// ---------------------------------------------------------------------------
// Inline parsing: **bold**, *italic* / _italic_, and {{cue}} markers.
// A small, forgiving subset — read-aloud prose is not aggressively parsed.
// ---------------------------------------------------------------------------

function run(text: string, marks: ScriptMark[]): ScriptInline {
  return marks.length ? { type: 'text', text, marks } : { type: 'text', text }
}

/** Split a plain string on *italic* / _italic_, carrying base marks through. */
function parseItalic(text: string, marks: ScriptMark[]): ScriptInline[] {
  const out: ScriptInline[] = []
  for (const part of text.split(/(\*[^*]+\*|_[^_]+_)/g)) {
    if (!part) continue
    if (/^[*_].+[*_]$/.test(part)) {
      out.push(run(part.slice(1, -1), [...marks, { type: 'italic' }]))
    } else {
      out.push(run(part, marks))
    }
  }
  return out
}

/** Split a plain string on **bold**, then italic within each part. */
function parseEmphasis(text: string, marks: ScriptMark[]): ScriptInline[] {
  const out: ScriptInline[] = []
  for (const part of text.split(/(\*\*[^*]+\*\*)/g)) {
    if (!part) continue
    if (/^\*\*.+\*\*$/.test(part)) {
      out.push(...parseItalic(part.slice(2, -2), [...marks, { type: 'bold' }]))
    } else {
      out.push(...parseItalic(part, marks))
    }
  }
  return out
}

/** Parse a block's inline content: extract cues, then emphasis on the rest. */
function parseInline(text: string): ScriptInline[] {
  const out: ScriptInline[] = []
  let last = 0
  let m: RegExpExecArray | null
  CUE_RE.lastIndex = 0
  while ((m = CUE_RE.exec(text)) !== null) {
    if (m.index > last) out.push(...parseEmphasis(text.slice(last, m.index), []))
    const kind = m[1] as CueKind
    const ref = m[2].trim()
    out.push({ type: 'cue', kind, ref, label: cueLabel(kind, ref) })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(...parseEmphasis(text.slice(last), []))
  return out
}

// ---------------------------------------------------------------------------
// Block parsing: # headings, > [!dm] callouts (nesting blocks), paragraphs.
// ---------------------------------------------------------------------------

const HEADING_RE = /^(#{1,3})\s+(.*)$/
const QUOTE_RE = /^>\s?/

/** Compile markdown-with-cues (the `scriptText` authoring format) into a doc. */
export function compileScriptText(src: string): ScriptDoc {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ScriptBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
      continue
    }

    const h = HEADING_RE.exec(line)
    if (h) {
      const level = Math.min(3, h[1].length) as 1 | 2 | 3
      blocks.push({ type: 'heading', level, content: parseInline(h[2]) })
      i++
      continue
    }

    if (QUOTE_RE.test(line)) {
      const inner: string[] = []
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        inner.push(lines[i].replace(QUOTE_RE, ''))
        i++
      }
      const innerText = inner.join('\n').replace(/^\s*\[!\w+\]\s*/i, '')
      blocks.push({ type: 'callout', content: compileScriptText(innerText) })
      continue
    }

    // Paragraph: gather consecutive plain lines (soft breaks reflow to spaces).
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !HEADING_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i])
    ) {
      para.push(lines[i])
      i++
    }
    blocks.push({ type: 'paragraph', content: parseInline(para.join(' ')) })
  }

  return blocks.length ? blocks : [{ type: 'paragraph', content: [] }]
}

// ---------------------------------------------------------------------------
// Legacy migration: the old flat `LegacyScriptNode[]` → the block tree.
// ---------------------------------------------------------------------------

/** Up-convert a legacy flat script (text/cue runs) into paragraph blocks. */
export function migrateLegacyScript(nodes: LegacyScriptNode[]): ScriptDoc {
  const blocks: ScriptBlock[] = []
  let inline: ScriptInline[] = []
  const flush = () => {
    blocks.push({ type: 'paragraph', content: inline })
    inline = []
  }

  for (const n of nodes) {
    if (n.type === 'cue') {
      inline.push({ type: 'cue', kind: n.kind, ref: n.ref, label: n.label ?? cueLabel(n.kind, n.ref) })
    } else {
      // A newline in legacy text marks a paragraph break.
      const segs = n.text.split(/\n+/)
      segs.forEach((seg, idx) => {
        if (idx > 0) flush()
        if (seg) inline.push({ type: 'text', text: seg })
      })
    }
  }
  flush()

  const nonEmpty = blocks.filter((b) => b.type !== 'paragraph' || b.content.length > 0)
  return nonEmpty.length ? nonEmpty : [{ type: 'paragraph', content: [] }]
}

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'callout'])

/** True if `raw` is already the new block tree (vs. a legacy flat array). */
function isTreeDoc(raw: unknown): raw is ScriptDoc {
  if (!Array.isArray(raw)) return false
  if (raw.length === 0) return true
  return BLOCK_TYPES.has((raw[0] as { type?: string })?.type ?? '')
}

/**
 * Normalize whatever is stored in `scene.script` (tree or legacy flat array)
 * into a `ScriptDoc`. Loader uses this so on-disk legacy scenes migrate live.
 */
export function normalizeScript(raw: unknown): ScriptDoc {
  if (isTreeDoc(raw)) return raw
  if (Array.isArray(raw)) return migrateLegacyScript(raw as LegacyScriptNode[])
  return [{ type: 'paragraph', content: [] }]
}
