import { useEffect, useState } from 'react'
import type { Scene } from '../../shared/types'
import { pushRecent } from '../lib/prefs'
import { engine, useStore } from '../store'
import { LoopButton, VolumeFader } from './Mixer'
import SectionHeader from './SectionHeader'

export default function MusicPalette({ scene }: { scene: Scene }) {
  const { status, switchMusic } = useStore()
  const setPlaylistEnabled = useStore((s) => s.setPlaylistEnabled)
  const setTrackVolume = useStore((s) => s.setTrackVolume)
  const setTrackLoop = useStore((s) => s.setTrackLoop)
  const removeTrack = useStore((s) => s.removeTrack)
  const openLibrary = useStore((s) => s.openLibrary)
  const savePlaylistPreset = useStore((s) => s.savePlaylistPreset)
  const buildMode = useStore((s) => s.uiMode === 'build')
  const tracks = scene.music ?? []
  const playlistOn = !!scene.playlist?.enabled
  // Inline "save these tracks as a campaign-wide playlist" mini-form.
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  const commitPreset = (): void => {
    if (presetName.trim()) {
      void savePlaylistPreset(presetName, tracks.map((t) => t.file))
    }
    setSavingPreset(false)
    setPresetName('')
  }

  return (
    <section>
      <SectionHeader icon="♪" title="Music">
        {tracks.length > 0 && (
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
        )}
        {buildMode && (
          <button
            onClick={() => openLibrary('music')}
            title="Add music from the library"
            className="rounded-full border border-hearth-border px-2 py-0.5 text-[11px] text-hearth-muted hover:border-hearth-ember hover:text-hearth-ember"
          >
            + Add music
          </button>
        )}
        {buildMode && tracks.length > 0 && (
          savingPreset ? (
            <input
              autoFocus
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onBlur={commitPreset}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') commitPreset()
                if (e.key === 'Escape') setSavingPreset(false)
              }}
              placeholder="playlist name…"
              className="w-36 rounded-full border border-hearth-ember bg-hearth-bg px-2 py-0.5 text-[11px] text-hearth-text focus:outline-none"
            />
          ) : (
            <button
              onClick={() => setSavingPreset(true)}
              title="Save these tracks as a campaign-wide playlist, playable from the dock in any scene"
              className="rounded-full border border-hearth-border px-2 py-0.5 text-[11px] text-hearth-muted hover:border-hearth-ember hover:text-hearth-ember"
            >
              💾 Save as playlist
            </button>
          )
        )}
      </SectionHeader>

      {playlistOn && tracks.length > 0 && <NowPlayingStrip scene={scene} />}

      {tracks.length === 0 ? (
        <p className="rounded-md border border-dashed border-hearth-border bg-hearth-panel/40 px-3 py-2 text-xs text-hearth-muted">
          No music yet — click <span className="text-hearth-ember">+ Add music</span> to pull tracks from the library.
        </p>
      ) : (
      <div className="flex flex-wrap items-start gap-2">
        {tracks.map((track) => {
          const active = status.activeMusicId === track.id
          return (
            <div
              key={track.id}
              className={`group flex w-44 flex-col gap-1.5 rounded-md border px-3 py-2 shadow-card transition-all ${
                active
                  ? 'border-hearth-ember bg-hearth-ember/15 shadow-ember'
                  : 'border-hearth-border bg-hearth-panel2 hover:border-hearth-ember/60'
              }`}
            >
              <button
                onClick={() => {
                  switchMusic(track.id)
                  pushRecent(track.file)
                }}
                className={`flex items-center text-left text-sm ${active ? 'text-hearth-ember' : 'text-hearth-text'}`}
              >
                <span className="mr-1">{active ? '♪' : '▶'}</span>
                <span className="truncate">{track.label}</span>
                {track.default && !active && !playlistOn && (
                  <span className="ml-1 flex-none text-[10px] text-hearth-muted">default</span>
                )}
              </button>
              <div className="flex items-center gap-2">
                <VolumeFader
                  value={track.volume}
                  defaultValue={0.7}
                  onChange={(v) => setTrackVolume(track.id, v)}
                />
                <LoopButton
                  on={track.loop !== false}
                  onClick={() => setTrackLoop(track.id, track.loop === false)}
                  title="Loop this track"
                />
                {buildMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeTrack(track.id)
                    }}
                    title="Remove from this scene (the file stays in the library)"
                    className="flex-none text-xs text-hearth-muted opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      )}
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
