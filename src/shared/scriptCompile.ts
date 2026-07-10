import type {
  CueInline,
  CueKind,
  LegacyScriptNode,
  ScriptBlock,
  ScriptDoc,
  ScriptInline,
  ScriptMark
} from './types'

const CUE_RE = /\{\{\s*(music|sfx|image|amb)\s*:\s*([^}]+?)\s*\}\}/g

const CUE_ICON: Record<CueKind, string> = {
  music: '▶',
  sfx: '🔊',
  image: '🖼',
  amb: '〜'
}

function cueLabel(kind: CueKind, ref: string): string {
  return `${CUE_ICON[kind]} ${ref}`
}

/** "3s" / "2.5s" → ms; a bare number is already ms. Undefined on nonsense. */
function parseDurationMs(v: string): number | undefined {
  const m = /^(\d+(?:\.\d+)?)(s|ms)?$/.exec(v.trim())
  if (!m) return undefined
  const n = parseFloat(m[1])
  return m[2] === 's' ? Math.round(n * 1000) : Math.round(n)
}

/** "40%" or "0.4" → 0..1. Undefined on nonsense. */
function parseVolume(v: string): number | undefined {
  const pct = v.trim().endsWith('%')
  const n = parseFloat(v)
  if (Number.isNaN(n)) return undefined
  const vol = pct ? n / 100 : n
  return Math.min(1, Math.max(0, vol))
}

/**
 * Build a cue from the text between `{{kind:` and `}}`. The ref may carry
 * `|`-separated lifecycle options (amb cues only), e.g.
 * `{{amb:rain|vol=40%|in=3s|out=6s|until=section}}`. Unknown options are
 * ignored so a typo degrades to a plain cue instead of breaking the script.
 */
function buildCue(kind: CueKind, raw: string): CueInline {
  const [ref, ...optParts] = raw.split('|').map((s) => s.trim())
  const cue: CueInline = { type: 'cue', kind, ref, label: cueLabel(kind, ref) }
  if (kind !== 'amb') return cue
  for (const part of optParts) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim().toLowerCase()
    const val = part.slice(eq + 1)
    if (key === 'vol' || key === 'volume') cue.volume = parseVolume(val) ?? cue.volume
    else if (key === 'in') cue.fadeInMs = parseDurationMs(val) ?? cue.fadeInMs
    else if (key === 'out') cue.fadeOutMs = parseDurationMs(val) ?? cue.fadeOutMs
    else if (key === 'until' && val.trim() === 'section') cue.until = 'section'
  }
  return cue
}

// ---------------------------------------------------------------------------
// Inline parsing: **bold**, *italic* / _italic_, and {{cue}} markers.
// A small, forgiving subset — read-aloud prose is not aggressively parsed.
// ---------------------------------------------------------------------------

function run(text: string, marks: ScriptMark[]): ScriptInline {
  return marks.length ? { type: 'text', text, marks } : { type: 'text', text }
}

const LINK_RE = /\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/g

/**
 * Innermost inline pass: split out [[wiki-links]] (`[[note-id]]` or
 * `[[note-id|label]]`), leaving the rest as marked text runs. Links are
 * atomic — emphasis marks around them apply to the surrounding text only.
 */
function parseLinks(text: string, marks: ScriptMark[]): ScriptInline[] {
  const out: ScriptInline[] = []
  let last = 0
  let m: RegExpExecArray | null
  LINK_RE.lastIndex = 0
  while ((m = LINK_RE.exec(text)) !== null) {
    if (m.index > last) out.push(run(text.slice(last, m.index), marks))
    const link: ScriptInline = { type: 'link', ref: m[1].trim() }
    if (m[2]) link.label = m[2].trim()
    out.push(link)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(run(text.slice(last), marks))
  return out
}

/** Split a plain string on *italic* / _italic_, carrying base marks through. */
function parseItalic(text: string, marks: ScriptMark[]): ScriptInline[] {
  const out: ScriptInline[] = []
  for (const part of text.split(/(\*[^*]+\*|_[^_]+_)/g)) {
    if (!part) continue
    if (/^[*_].+[*_]$/.test(part)) {
      out.push(...parseLinks(part.slice(1, -1), [...marks, { type: 'italic' }]))
    } else {
      out.push(...parseLinks(part, marks))
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
    out.push(buildCue(m[1] as CueKind, m[2].trim()))
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
const CHECK_RE = /^[-*]\s+\[([ xX])\]\s+(.*)$/

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

    const c = CHECK_RE.exec(line)
    if (c) {
      const block: ScriptBlock = { type: 'check', content: parseInline(c[2]) }
      if (c[1] !== ' ') block.checked = true
      blocks.push(block)
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
      !QUOTE_RE.test(lines[i]) &&
      !CHECK_RE.test(lines[i])
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

/** Flatten a ScriptDoc to plain text (search indexing; cue labels included). */
export function docText(doc: ScriptDoc | undefined): string {
  if (!doc) return ''
  const parts: string[] = []
  const walk = (blocks: ScriptBlock[]): void => {
    for (const b of blocks) {
      if (b.type === 'callout') {
        walk(b.content)
        continue
      }
      for (const n of b.content) parts.push(n.type === 'text' ? n.text : (n.label ?? n.ref))
      parts.push('\n')
    }
  }
  walk(doc)
  return parts.join(' ')
}

/** All [[link]] refs in a doc, in order (descending into callouts). May repeat. */
export function docLinks(doc: ScriptDoc | undefined): string[] {
  if (!doc) return []
  const refs: string[] = []
  const walk = (blocks: ScriptBlock[]): void => {
    for (const b of blocks) {
      if (b.type === 'callout') {
        walk(b.content)
        continue
      }
      for (const n of b.content) if (n.type === 'link') refs.push(n.ref)
    }
  }
  walk(doc)
  return refs
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c)

/**
 * Case-insensitive word-boundary search for `needle` in `hay` starting at
 * `from`. Boundary = the adjacent chars aren't letters/digits (so "Kena"
 * doesn't match inside "Kennarea"). Returns -1 when absent.
 */
function findMention(hay: string, needle: string, from: number): number {
  const h = hay.toLowerCase()
  const n = needle.toLowerCase()
  let i = h.indexOf(n, from)
  while (i !== -1) {
    if (!isWordChar(hay[i - 1]) && !isWordChar(hay[i + n.length])) return i
    i = h.indexOf(n, i + 1)
  }
  return -1
}

/** True if any text run in the doc mentions `title` (word-boundary, case-insensitive). */
export function docMentions(doc: ScriptDoc | undefined, title: string): boolean {
  if (!doc || title.trim().length < 3) return false
  let found = false
  const walk = (blocks: ScriptBlock[]): void => {
    for (const b of blocks) {
      if (found) return
      if (b.type === 'callout') {
        walk(b.content)
        continue
      }
      for (const n of b.content) {
        if (n.type === 'text' && findMention(n.text, title, 0) !== -1) {
          found = true
          return
        }
      }
    }
  }
  walk(doc)
  return found
}

/**
 * Replace every plain-text mention of `title` with a [[link]] to `ref`
 * (the "unlinked mentions → link it" action). The matched text becomes the
 * link's label when its casing differs from the title, so prose is preserved
 * verbatim; marks on the split run carry to the surrounding text only.
 * Returns the new doc and how many mentions were linked (0 = unchanged input).
 */
export function linkifyMentions(doc: ScriptDoc, title: string, ref: string): { doc: ScriptDoc; count: number } {
  let count = 0
  const linkifyInlines = (content: ScriptInline[]): ScriptInline[] => {
    const out: ScriptInline[] = []
    for (const n of content) {
      if (n.type !== 'text') {
        out.push(n)
        continue
      }
      let rest = n.text
      let i = findMention(rest, title, 0)
      while (i !== -1) {
        if (i > 0) out.push(n.marks?.length ? { type: 'text', text: rest.slice(0, i), marks: n.marks } : { type: 'text', text: rest.slice(0, i) })
        const matched = rest.slice(i, i + title.length)
        const link: ScriptInline = { type: 'link', ref }
        if (matched !== title) link.label = matched
        out.push(link)
        count++
        rest = rest.slice(i + title.length)
        i = findMention(rest, title, 0)
      }
      if (rest) out.push(n.marks?.length ? { type: 'text', text: rest, marks: n.marks } : { type: 'text', text: rest })
    }
    return out
  }
  const walkBlocks = (blocks: ScriptBlock[]): ScriptBlock[] =>
    blocks.map((b) =>
      b.type === 'callout'
        ? { ...b, content: walkBlocks(b.content) }
        : { ...b, content: linkifyInlines(b.content) }
    )
  const next = walkBlocks(doc)
  return { doc: count > 0 ? next : doc, count }
}

/**
 * All unchecked checklist items in a doc (descending into callouts) — the
 * "unfinished business" that carries forward into the next session's prep.
 */
export function docUncheckedItems(doc: ScriptDoc | undefined): Extract<ScriptBlock, { type: 'check' }>[] {
  if (!doc) return []
  const out: Extract<ScriptBlock, { type: 'check' }>[] = []
  const walk = (blocks: ScriptBlock[]): void => {
    for (const b of blocks) {
      if (b.type === 'callout') walk(b.content)
      else if (b.type === 'check' && !b.checked) out.push(b)
    }
  }
  walk(doc)
  return out
}

/**
 * Immutably set a check block's `checked` at a block-index path (indices
 * descend through callout content). Non-check targets return the doc unchanged
 * — the read-only renderers use this to persist live ticks.
 */
export function setCheckedAt(doc: ScriptDoc, path: number[], checked: boolean): ScriptDoc {
  if (path.length === 0) return doc
  const walk = (blocks: ScriptBlock[], depth: number): ScriptBlock[] =>
    blocks.map((b, i) => {
      if (i !== path[depth]) return b
      if (depth === path.length - 1) return b.type === 'check' ? { ...b, checked } : b
      return b.type === 'callout' ? { ...b, content: walk(b.content, depth + 1) } : b
    })
  return walk(doc, 0)
}

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'callout', 'check'])

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
