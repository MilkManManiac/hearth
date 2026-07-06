import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  scriptHighlightColor,
  scriptTextColor,
  type CueInline,
  type Scene,
  type ScriptBlock,
  type ScriptDoc,
  type ScriptInline
} from '../../shared/types'
import { useStore } from '../store'
import ScriptEditor, { type EnsureAsset } from './ScriptEditor'
import SectionHeader from './SectionHeader'

const CUE_STYLE: Record<string, string> = {
  music: 'border-hearth-ember/60 bg-hearth-ember/15 text-hearth-ember hover:bg-hearth-ember/30',
  sfx: 'border-hearth-gold/60 bg-hearth-gold/10 text-hearth-gold hover:bg-hearth-gold/25',
  image: 'border-sky-500/50 bg-sky-500/10 text-sky-300 hover:bg-sky-500/25'
}

const HEADING_CLASS: Record<number, string> = {
  1: 'mt-3 mb-1 text-2xl font-semibold text-hearth-text',
  2: 'mt-3 mb-1 text-xl font-semibold text-hearth-text',
  3: 'mt-2 mb-1 text-lg font-semibold text-hearth-muted'
}

export default function ScriptPanel({ scene }: { scene: Scene }) {
  const fireCue = useStore((s) => s.fireCue)
  const updateScene = useStore((s) => s.updateScene)
  const library = useStore((s) => s.campaign.library)
  const [editing, setEditing] = useState(false)

  // Leave edit mode when switching scenes.
  useEffect(() => setEditing(false), [scene.id])

  const script: ScriptDoc = scene.script ?? []

  // Autosave path — persist the doc, stay in edit mode.
  const handleSave = (doc: ScriptDoc) => {
    updateScene(scene.id, (s) => ({ ...s, script: doc, scriptText: undefined }))
  }

  // Auto-register a library asset dropped into the script that isn't on the scene yet.
  const ensureAsset: EnsureAsset = (entry) => {
    updateScene(scene.id, (s) => {
      const list = entry.kind === 'music' ? s.music ?? [] : s.sfx ?? []
      if (list.some((x) => x.id === entry.id || x.file === entry.file)) return s
      const item = { id: entry.id, label: entry.label, file: entry.file }
      return entry.kind === 'music'
        ? { ...s, music: [...(s.music ?? []), item] }
        : { ...s, sfx: [...(s.sfx ?? []), item] }
    })
  }

  const isEmpty = script.length === 0 || (script.length === 1 && script[0].type === 'paragraph' && script[0].content.length === 0)

  return (
    <section>
      <SectionHeader icon="📖" title="Read-aloud">
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-hearth-muted hover:text-hearth-ember">
            ✎ Edit
          </button>
        )}
      </SectionHeader>

      {editing ? (
        <ScriptEditor
          scene={scene}
          library={library}
          onSave={handleSave}
          onEnsureAsset={ensureAsset}
          onDone={() => setEditing(false)}
        />
      ) : isEmpty ? (
        <p className="rounded-md border border-dashed border-hearth-border bg-hearth-panel/40 p-4 text-sm text-hearth-muted">
          No read-aloud text yet. Click <span className="text-hearth-ember">✎ Edit</span> to write one and drag in
          sound cues.
        </p>
      ) : (
        <div className="rounded-md border border-hearth-border bg-hearth-panel/60 p-5 font-display text-[18px] leading-loose text-hearth-text shadow-card">
          {script.map((block, i) => renderBlock(block, i, fireCue))}
        </div>
      )}
    </section>
  )
}

function inlineFormat(node: Extract<ScriptInline, { type: 'text' }>): { className: string; style: CSSProperties } {
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

function renderInline(node: ScriptInline, key: number, fireCue: (n: CueInline) => void): ReactNode {
  if (node.type === 'text') {
    const { className, style } = inlineFormat(node)
    return (
      <span key={key} className={className} style={style}>
        {node.text}
      </span>
    )
  }
  return (
    <button
      key={key}
      onClick={() => fireCue(node)}
      className={`mx-1 inline-flex items-center gap-1 rounded border px-2 py-0.5 align-middle text-sm transition-colors ${CUE_STYLE[node.kind]}`}
      title={`${node.kind}: ${node.ref}`}
    >
      {node.label ?? node.ref}
    </button>
  )
}

function renderBlock(block: ScriptBlock, key: number, fireCue: (n: CueInline) => void): ReactNode {
  if (block.type === 'callout') {
    return (
      <div
        key={key}
        className="script-callout my-2 rounded border-l-2 border-hearth-gold/60 bg-hearth-gold/5 px-3 py-1.5 text-[15px] text-hearth-muted"
      >
        {block.content.map((b, i) => renderBlock(b, i, fireCue))}
      </div>
    )
  }
  const inlines = block.content.map((n, i) => renderInline(n, i, fireCue))
  if (block.type === 'heading') {
    const cls = HEADING_CLASS[block.level]
    if (block.level === 1) return <h1 key={key} className={cls}>{inlines}</h1>
    if (block.level === 2) return <h2 key={key} className={cls}>{inlines}</h2>
    return <h3 key={key} className={cls}>{inlines}</h3>
  }
  return (
    <p key={key} className="my-1">
      {inlines}
    </p>
  )
}
