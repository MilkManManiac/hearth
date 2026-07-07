import { engine, useStore } from '../store'

/** "music/nox-rain-strong.ogg" → "nox-rain-strong" */
function stem(file: string): string {
  return (file.split('/').pop() ?? file).replace(/\.[^.]+$/, '')
}

const CHIP =
  'flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors'

function Chip({
  icon,
  label,
  className,
  onStop,
  stopTitle
}: {
  icon: string
  label: string
  className: string
  onStop: () => void
  stopTitle: string
}) {
  return (
    <span className={`${CHIP} ${className}`}>
      <span aria-hidden>{icon}</span>
      <span className="max-w-[11rem] truncate">{label}</span>
      <button
        onClick={onStop}
        title={stopTitle}
        className="-mr-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] leading-none opacity-60 hover:bg-black/30 hover:opacity-100"
      >
        ✕
      </button>
    </span>
  )
}

/**
 * The trust anchor: one always-visible strip listing EVERYTHING currently
 * audible — the music track, every ambience bed, every held SFX loop — each
 * with its own kill switch. Sounds orphaned from other scenes (a loop started
 * before a scene switch) still show here, so nothing can play invisibly.
 */
export default function NowSounding() {
  const status = useStore((s) => s.status)
  const scenes = useStore((s) => s.campaign.scenes)
  const stopAll = useStore((s) => s.stopAll)

  const hasAudio =
    !!status.activeMusicId || status.ambienceFiles.length > 0 || status.loopingSfxIds.length > 0
  if (!hasAudio) return null

  // Labels can come from any scene — the sounding item may belong to a scene
  // that is no longer armed (that's exactly when showing it matters most).
  // Staple music uses the file path as its id; show the stem, not the path.
  const musicLabel = status.activeMusicId
    ? scenes.flatMap((s) => s.music ?? []).find((m) => m.id === status.activeMusicId)?.label ??
      (status.activeMusicId.includes('/') ? stem(status.activeMusicId) : status.activeMusicId)
    : null
  const sfxLabel = (id: string) =>
    scenes.flatMap((s) => s.sfx ?? []).find((x) => x.id === id)?.label ?? id

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
          onStop={() => engine.stopAmbienceLayer(file)}
          stopTitle="Fade this bed out"
        />
      ))}
      {status.loopingSfxIds.map((id) => (
        <Chip
          key={id}
          icon="🔁"
          label={sfxLabel(id)}
          className="border-hearth-gold/60 bg-hearth-gold/10 text-hearth-gold"
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
