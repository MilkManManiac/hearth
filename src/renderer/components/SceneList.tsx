import { useState } from 'react'
import { useStore } from '../store'

/** Built-in starting points; ids must match SCENE_TEMPLATES in main/campaign.ts. */
const TEMPLATES = [
  { id: 'blank', icon: '📄', label: 'Blank' },
  { id: 'tavern', icon: '🍺', label: 'Tavern' },
  { id: 'combat', icon: '⚔️', label: 'Combat' },
  { id: 'dungeon', icon: '🕯️', label: 'Dungeon Crawl' }
]

export default function SceneList() {
  const { campaign, currentSceneId, selectScene, duplicateScene, createScene } = useStore()
  const [picking, setPicking] = useState(false)

  return (
    <aside className="flex w-60 flex-col border-r border-hearth-border bg-hearth-panel">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-hearth-muted">
        Scenes ({campaign.scenes.length})
      </div>
      <div className="flex-1 overflow-y-auto">
        {campaign.scenes.length === 0 && (
          <p className="px-3 py-2 text-xs text-hearth-muted">
            No scenes yet. Add JSON files to the <code>scenes/</code> folder — they appear here
            automatically.
          </p>
        )}
        {campaign.scenes.map((scene) => {
          const active = scene.id === currentSceneId
          return (
            // div, not button: the row holds a nested duplicate button.
            <div
              key={scene.id}
              role="button"
              tabIndex={0}
              onClick={() => selectScene(scene.id)}
              onKeyDown={(e) => e.key === 'Enter' && selectScene(scene.id)}
              className={`group flex w-full cursor-pointer items-center border-l-2 px-3 py-2 text-left text-sm transition-colors ${
                active
                  ? 'border-hearth-ember bg-gradient-to-r from-hearth-ember/15 to-transparent font-medium text-hearth-text shadow-[inset_2px_0_10px_-4px_rgba(224,138,60,0.6)]'
                  : 'border-transparent text-hearth-muted hover:bg-hearth-panel2/50 hover:text-hearth-text'
              }`}
            >
              <span className="flex-1 truncate">{scene.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  duplicateScene(scene.id)
                }}
                title={`Duplicate "${scene.name}"`}
                aria-label={`Duplicate "${scene.name}"`}
                className="ml-1 shrink-0 rounded px-1 text-xs text-hearth-muted opacity-0 transition-opacity hover:text-hearth-ember group-hover:opacity-100"
              >
                ⧉
              </button>
            </div>
          )
        })}
      </div>
      <div className="border-t border-hearth-border p-2">
        {picking && (
          <div className="mb-2 overflow-hidden rounded-md border border-hearth-border bg-hearth-panel2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setPicking(false)
                  createScene(t.id)
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-hearth-muted transition-colors hover:bg-hearth-ember/10 hover:text-hearth-text"
              >
                <span className="mr-2" aria-hidden>
                  {t.icon}
                </span>
                {t.label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setPicking((p) => !p)}
          className="w-full rounded-md border border-dashed border-hearth-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-hearth-muted transition-colors hover:border-hearth-ember/50 hover:text-hearth-text"
        >
          + New Scene
        </button>
      </div>
      {campaign.errors.length > 0 && (
        <div className="border-t border-hearth-border px-3 py-2 text-[11px] text-red-400">
          <div className="mb-1 font-semibold">Load errors</div>
          {campaign.errors.map((e, i) => (
            <div key={i} className="truncate" title={e}>
              {e}
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
