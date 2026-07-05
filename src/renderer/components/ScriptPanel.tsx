import { useEffect, useState } from 'react'
import type { Scene, ScriptNode } from '../../shared/types'
import { useStore } from '../store'
import ScriptEditor from './ScriptEditor'

const CUE_STYLE: Record<string, string> = {
  music: 'border-hearth-ember/60 bg-hearth-ember/15 text-hearth-ember hover:bg-hearth-ember/30',
  sfx: 'border-hearth-gold/60 bg-hearth-gold/10 text-hearth-gold hover:bg-hearth-gold/25',
  image: 'border-sky-500/50 bg-sky-500/10 text-sky-300 hover:bg-sky-500/25'
}

export default function ScriptPanel({ scene }: { scene: Scene }) {
  const fireCue = useStore((s) => s.fireCue)
  const updateScene = useStore((s) => s.updateScene)
  const [editing, setEditing] = useState(false)

  // Leave edit mode when switching scenes.
  useEffect(() => setEditing(false), [scene.id])

  const script = scene.script ?? []

  const handleSave = (nodes: ScriptNode[]) => {
    updateScene(scene.id, (s) => ({ ...s, script: nodes, scriptText: undefined }))
    setEditing(false)
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-hearth-muted">
          Read-aloud
        </h3>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-hearth-muted hover:text-hearth-ember"
          >
            ✎ Edit
          </button>
        )}
      </div>

      {editing ? (
        <ScriptEditor scene={scene} onSave={handleSave} onCancel={() => setEditing(false)} />
      ) : script.length === 0 ? (
        <p className="rounded-md border border-dashed border-hearth-border bg-hearth-panel/40 p-4 text-sm text-hearth-muted">
          No read-aloud text yet. Click <span className="text-hearth-ember">✎ Edit</span> to write
          one and drag in sound cues.
        </p>
      ) : (
        <div className="rounded-md border border-hearth-border bg-hearth-panel/60 p-4 text-[17px] leading-loose text-hearth-text">
          {script.map((node, i) => renderNode(node, i, fireCue))}
        </div>
      )}
    </section>
  )
}

function renderNode(
  node: ScriptNode,
  i: number,
  fireCue: (n: Extract<ScriptNode, { type: 'cue' }>) => void
) {
  if (node.type === 'text') {
    return (
      <span key={i} className="whitespace-pre-wrap">
        {node.text}
      </span>
    )
  }
  return (
    <button
      key={i}
      onClick={() => fireCue(node)}
      className={`mx-1 inline-flex items-center gap-1 rounded border px-2 py-0.5 align-middle text-sm transition-colors ${CUE_STYLE[node.kind]}`}
      title={`${node.kind}: ${node.ref}`}
    >
      {node.label ?? node.ref}
    </button>
  )
}
