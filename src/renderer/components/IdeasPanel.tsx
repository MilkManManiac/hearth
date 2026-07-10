import { useState } from 'react'
import type { Scene, SceneIdea } from '../../shared/types'
import { useStore } from '../store'
import GrowArea from './GrowArea'

export default function IdeasPanel({ scene }: { scene: Scene }) {
  const updateScene = useStore((s) => s.updateScene)
  const buildMode = useStore((s) => s.uiMode === 'build')
  const [draft, setDraft] = useState('')
  const ideas = scene.ideas ?? []

  const mutate = (fn: (list: SceneIdea[]) => SceneIdea[]) =>
    updateScene(scene.id, (s) => ({ ...s, ideas: fn(s.ideas ?? []) }))

  const add = () => {
    const text = draft.trim()
    if (!text) return
    mutate((list) => [...list, { id: crypto.randomUUID(), text, done: false }])
    setDraft('')
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {ideas.length === 0 && (
          <li className="text-xs text-hearth-muted">
            Jot down things that might happen here — check them off as you use them.
          </li>
        )}
        {ideas.map((idea) => (
          <IdeaRow
            key={idea.id}
            idea={idea}
            onToggle={() =>
              mutate((list) => list.map((i) => (i.id === idea.id ? { ...i, done: !i.done } : i)))
            }
            onEdit={(text) =>
              mutate((list) => list.map((i) => (i.id === idea.id ? { ...i, text } : i)))
            }
            onRemove={() => mutate((list) => list.filter((i) => i.id !== idea.id))}
          />
        ))}
      </ul>
      {/* Authoring is build-mode; run mode keeps the checkboxes (session
          tracking) and Ctrl+J quick capture for new thoughts. */}
      {buildMode && (
        <div className="flex gap-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Add an idea…"
            className="min-w-0 flex-1 rounded border border-hearth-border bg-hearth-bg px-2 py-1 text-sm text-hearth-text placeholder:text-hearth-muted focus:border-hearth-ember focus:outline-none"
          />
          <button
            onClick={add}
            className="rounded border border-hearth-border bg-hearth-panel2 px-2 text-sm text-hearth-muted hover:text-hearth-ember"
          >
            +
          </button>
        </div>
      )}
    </div>
  )
}

function IdeaRow({
  idea,
  onToggle,
  onEdit,
  onRemove
}: {
  idea: SceneIdea
  onToggle: () => void
  onEdit: (text: string) => void
  onRemove: () => void
}) {
  const [text, setText] = useState(idea.text)
  return (
    <li className="group flex items-start gap-2 rounded px-1 py-0.5 transition-colors hover:bg-hearth-panel2/40">
      <input
        type="checkbox"
        checked={!!idea.done}
        onChange={onToggle}
        className="mt-1 h-3.5 w-3.5 shrink-0 accent-hearth-ember"
      />
      {/* Wrapping, growing text — long ideas stay fully readable. */}
      <GrowArea
        value={text}
        onChange={setText}
        onBlur={() => text !== idea.text && onEdit(text)}
        className={`min-w-0 flex-1 text-sm leading-snug ${
          idea.done ? 'text-hearth-muted line-through' : 'text-hearth-text'
        }`}
      />
      <button
        onClick={onRemove}
        className="shrink-0 text-hearth-muted opacity-40 hover:text-red-400 group-hover:opacity-100"
        title="Remove"
      >
        ×
      </button>
    </li>
  )
}
