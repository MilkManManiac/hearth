import type { Scene, ScriptNode } from '../../shared/types'
import { useStore } from '../store'

const CUE_STYLE: Record<string, string> = {
  music: 'border-hearth-ember/60 bg-hearth-ember/15 text-hearth-ember hover:bg-hearth-ember/30',
  sfx: 'border-hearth-gold/60 bg-hearth-gold/10 text-hearth-gold hover:bg-hearth-gold/25',
  image: 'border-sky-500/50 bg-sky-500/10 text-sky-300 hover:bg-sky-500/25'
}

export default function ScriptPanel({ scene }: { scene: Scene }) {
  const fireCue = useStore((s) => s.fireCue)
  const script = scene.script ?? []
  if (script.length === 0) return null

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-hearth-muted">
        Read-aloud
      </h3>
      <div className="rounded-md border border-hearth-border bg-hearth-panel/60 p-4 text-[17px] leading-loose text-hearth-text">
        {script.map((node, i) => renderNode(node, i, fireCue))}
      </div>
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
