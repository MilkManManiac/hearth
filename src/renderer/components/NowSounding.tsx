import { engine, useStore } from '../store'
import { VolumeFader } from './Mixer'

/** "music/nox-rain-strong.ogg" → "nox-rain-strong" */
function stem(file: string): string {
  return (file.split('/').pop() ?? file).replace(/\.[^.]+$/, '')
}

function Chip({
  icon,
  label,
  className,
  volume,
  defaultVolume,
  onVolume,
  onStop,
  stopTitle
}: {
  icon: string
  label: string
  className: string
  volume: number | undefined
  defaultVolume: number
  onVolume: (v: number) => void
  onStop: () => void
  stopTitle: string
}) {
  return (
    <span className={`flex items-center gap-1.5 rounded-full border py-0.5 pl-2.5 pr-1 text-xs transition-colors ${className}`}>
      <span aria-hidden>{icon}</span>
      <span className="max-w-[9rem] truncate">{label}</span>
      {/* The mid-read fix: every audible thing has its fader RIGHT HERE — no
          scrolling the board hunting for the too-loud sound. Live-only. */}
      <span className="w-16">
        <VolumeFader value={volume} defaultValue={defaultVolume} onChange={onVolume} />
      </span>
      <button
        onClick={onStop}
        title={stopTitle}
        className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] leading-none opacity-60 hover:bg-black/30 hover:opacity-100"
      >
        ✕
      </button>
    </span>
  )
}

/**
 * The trust anchor: one always-visible strip listing EVERYTHING currently
 * audible — the music track, every ambience bed, every held SFX loop — each
 * with a live volume fader and its own kill switch. Sounds orphaned from other
 * scenes (a loop started before a scene switch) still show here, so nothing
 * can play invisibly.
 */
export default function NowSounding() {
  const status = useStore((s) => s.status)
  const scenes = useStore((s) => s.campaign.scenes)
  const stopAll = useStore((s) => s.stopAll)

  const hasAudio =
    !!status.activeMusicId || status.ambienceFiles.length > 0 || status.loopingSfxIds.length > 0
  if (!hasAudio) return null

  // Labels/volumes can come from any scene — the sounding item may belong to a
  // scene that is no longer armed (that's exactly when showing it matters most).
  // Staple music uses the file path as its id; show the stem, not the path.
  const musicTrack = scenes.flatMap((s) => s.music ?? []).find((m) => m.id === status.activeMusicId)
  const musicLabel = status.activeMusicId
    ? musicTrack?.label ??
      (status.activeMusicId.includes('/') ? stem(status.activeMusicId) : status.activeMusicId)
    : null
  const ambLayer = (file: string) =>
    scenes.flatMap((s) => s.ambience ?? []).find((a) => a.file === file)
  const sfxItem = (id: string) => scenes.flatMap((s) => s.sfx ?? []).find((x) => x.id === id)

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-hearth-border bg-hearth-panel px-4 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
        Now sounding
      </span>
      {musicLabel && (
        <Chip
          icon="♪"
          label={musicLabel}
          className="border-hearth-ember/60 bg-hearth-ember/10 text-hearth-ember"
          volume={musicTrack?.volume}
          defaultVolume={0.6}
          onVolume={(v) => engine.setActiveMusicVolume(v)}
          onStop={() => engine.stopMusic()}
          stopTitle="Fade this track out"
        />
      )}
      {status.ambienceFiles.map((file) => (
        <Chip
          key={file}
          icon="〜"
          label={stem(file)}
          className="border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
          volume={ambLayer(file)?.volume}
          defaultVolume={0.4}
          onVolume={(v) => engine.setAmbienceLayerVolume(file, v)}
          onStop={() => engine.stopAmbienceLayer(file)}
          stopTitle="Fade this bed out"
        />
      ))}
      {status.loopingSfxIds.map((id) => (
        <Chip
          key={id}
          icon="🔁"
          label={sfxItem(id)?.label ?? id}
          className="border-hearth-gold/60 bg-hearth-gold/10 text-hearth-gold"
          volume={sfxItem(id)?.volume}
          defaultVolume={0.9}
          onVolume={(v) => engine.setSfxLoopVolume(id, v)}
          onStop={() => engine.stopSfxLoop(id)}
          stopTitle="Stop this loop"
        />
      ))}
      {status.ducked && (
        <span
          className="rounded bg-hearth-emberdim/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-hearth-gold"
          title="Music is dipped while a sound effect plays"
        >
          ducking
        </span>
      )}
      <button
        onClick={stopAll}
        title="Fade everything out (Esc)"
        className="ml-auto rounded border border-hearth-emberdim bg-hearth-emberdim/20 px-2 py-0.5 text-[11px] text-hearth-gold hover:bg-hearth-emberdim/40"
      >
        ⏹ All
      </button>
    </div>
  )
}
