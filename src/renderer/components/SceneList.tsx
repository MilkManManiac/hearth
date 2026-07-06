import { useStore } from '../store'

export default function SceneList() {
  const { campaign, currentSceneId, selectScene } = useStore()

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
            <button
              key={scene.id}
              onClick={() => selectScene(scene.id)}
              className={`block w-full border-l-2 px-3 py-2 text-left text-sm transition-colors ${
                active
                  ? 'border-hearth-ember bg-gradient-to-r from-hearth-ember/15 to-transparent font-medium text-hearth-text shadow-[inset_2px_0_10px_-4px_rgba(224,138,60,0.6)]'
                  : 'border-transparent text-hearth-muted hover:bg-hearth-panel2/50 hover:text-hearth-text'
              }`}
            >
              {scene.name}
            </button>
          )
        })}
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
