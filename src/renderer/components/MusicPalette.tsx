import { useEffect, useState } from 'react'
import type { Scene } from '../../shared/types'
import { engine, useStore } from '../store'

export default function MusicPalette({ scene }: { scene: Scene }) {
  const { status, switchMusic } = useStore()
  const stopAll = useStore((s) => s.stopAll)
  const setPlaylistEnabled = useStore((s) => s.setPlaylistEnabled)
  const tracks = scene.music ?? []
  if (tracks.length === 0) return null

  const playlistOn = !!scene.playlist?.enabled

  return (
    <section>
      <div className="mb-2 flex items-center gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-hearth-muted">Music</h3>
        <button
          onClick={() => setPlaylistEnabled(!playlistOn)}
          title={
            playlistOn
              ? 'Playlist mode: tracks auto-advance in order. Click for palette (tap-to-switch).'
              : 'Palette mode: tap a track to switch. Click for playlist (auto-advance).'
          }
          className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
            playlistOn
              ? 'border-hearth-ember bg-hearth-emberdim/30 text-hearth-ember'
              : 'border-hearth-border text-hearth-muted hover:text-hearth-text'
          }`}
        >
          {playlistOn ? '▤ Playlist' : '▦ Palette'}
        </button>
      </div>

      {playlistOn && <NowPlayingStrip scene={scene} />}

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
              {track.default && !active && !playlistOn && (
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

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function NowPlayingStrip({ scene }: { scene: Scene }) {
  const status = useStore((s) => s.status)
  const playlistStep = useStore((s) => s.playlistStep)
  const setPlaylistShuffle = useStore((s) => s.setPlaylistShuffle)
  const setPlaylistLoop = useStore((s) => s.setPlaylistLoop)
  const playlistOrder = useStore((s) => s.playlistOrder)
  const playlistPos = useStore((s) => s.playlistPos)

  // Poll the engine for progress while something is playing.
  const [progress, setProgress] = useState<{ elapsed: number; duration: number } | null>(null)
  useEffect(() => {
    if (!status.activeMusicId) {
      setProgress(null)
      return
    }
    const tick = () => setProgress(engine.musicProgress())
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [status.activeMusicId])

  const track = scene.music?.find((m) => m.id === status.activeMusicId)
  const shuffle = !!scene.playlist?.shuffle
  const loop = scene.playlist?.loop !== false
  const pct = progress && progress.duration > 0 ? (progress.elapsed / progress.duration) * 100 : 0

  return (
    <div className="mb-3 flex items-center gap-3 rounded-md border border-hearth-border bg-hearth-panel/60 px-3 py-2">
      <button
        onClick={() => playlistStep(-1)}
        title="Previous track"
        className="text-hearth-muted transition-colors hover:text-hearth-ember"
      >
        ⏮
      </button>
      <button
        onClick={() => playlistStep(1)}
        title="Next track"
        className="text-hearth-muted transition-colors hover:text-hearth-ember"
      >
        ⏭
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm text-hearth-text">
            {track ? track.label : '— nothing playing —'}
          </span>
          <span className="flex-none text-[11px] tabular-nums text-hearth-muted">
            {progress ? `${fmt(progress.elapsed)} / ${fmt(progress.duration)}` : ''}
            <span className="ml-2 text-hearth-muted/70">
              {playlistOrder.length > 0 ? `${playlistPos + 1}/${playlistOrder.length}` : ''}
            </span>
          </span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded bg-hearth-bg">
          <div
            className="h-full bg-hearth-ember/80 transition-[width] duration-500 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <button
        onClick={() => setPlaylistShuffle(!shuffle)}
        title={shuffle ? 'Shuffle on' : 'Shuffle off'}
        className={`text-sm transition-colors ${shuffle ? 'text-hearth-ember' : 'text-hearth-muted hover:text-hearth-text'}`}
      >
        🔀
      </button>
      <button
        onClick={() => setPlaylistLoop(!loop)}
        title={loop ? 'Loop playlist on' : 'Loop playlist off (stops after last track)'}
        className={`text-sm transition-colors ${loop ? 'text-hearth-ember' : 'text-hearth-muted hover:text-hearth-text'}`}
      >
        🔁
      </button>
    </div>
  )
}
