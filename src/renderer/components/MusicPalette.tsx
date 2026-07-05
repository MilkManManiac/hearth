import type { Scene } from '../../shared/types'
import { useStore } from '../store'

export default function MusicPalette({ scene }: { scene: Scene }) {
  const { status, switchMusic } = useStore()
  const stopAll = useStore((s) => s.stopAll)
  const tracks = scene.music ?? []
  if (tracks.length === 0) return null

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-hearth-muted">Music</h3>
      <div className="flex flex-wrap gap-2">
        {tracks.map((track) => {
          const active = status.activeMusicId === track.id
          return (
            <button
              key={track.id}
              onClick={() => switchMusic(track.id)}
              className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                active
                  ? 'border-hearth-ember bg-hearth-ember/15 text-hearth-ember'
                  : 'border-hearth-border bg-hearth-panel2 text-hearth-text hover:border-hearth-ember/60'
              }`}
            >
              <span className="mr-1">{active ? '♪' : '▶'}</span>
              {track.label}
              {track.default && !active && (
                <span className="ml-1 text-[10px] text-hearth-muted">default</span>
              )}
            </button>
          )
        })}
        <button
          onClick={() => stopAll()}
          className="rounded-md border border-hearth-border bg-transparent px-3 py-2 text-sm text-hearth-muted hover:text-hearth-text"
          title="Fade out music and ambience"
        >
          ⏹ Silence
        </button>
      </div>
    </section>
  )
}
