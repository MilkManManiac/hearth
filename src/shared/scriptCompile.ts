import type { ScriptNode } from './types'

const CUE_RE = /\{\{\s*(music|sfx|image)\s*:\s*([^}]+?)\s*\}\}/g

const CUE_ICON: Record<string, string> = {
  music: '▶',
  sfx: '🔊',
  image: '🖼'
}

/**
 * Compile read-aloud prose with inline cue markers into structured script nodes.
 *
 *   "Shapes drop {{sfx:shriek}} and a voice cries out {{music:combat}}."
 *
 * becomes text/cue/text/cue/text nodes. Cue labels default to an icon + ref,
 * but scenes can override by providing a structured `script` directly.
 */
export function compileScriptText(text: string): ScriptNode[] {
  const nodes: ScriptNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  CUE_RE.lastIndex = 0
  while ((match = CUE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    }
    const kind = match[1] as 'music' | 'sfx' | 'image'
    const ref = match[2].trim()
    nodes.push({ type: 'cue', kind, ref, label: `${CUE_ICON[kind]} ${ref}` })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    nodes.push({ type: 'text', text: text.slice(lastIndex) })
  }
  return nodes
}
