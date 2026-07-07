import { useEffect, useState } from 'react'
import { assetDisplayName, categoryMeta, type AssetKind, type PlaylistPreset } from '../../shared/types'
import { pushRecent, useFavorites } from '../lib/prefs'
import { engine, useStore } from '../store'
import { VolumeFader } from './Mixer'

/** "music/nox-rain-strong.ogg" → "nox-rain-strong" */
function stem(file: string): string {
  return (file.split('/').pop() ?? file).replace(/\.[^.]+$/, '')
}

/** Stable empty fallback — a `?? []` inside a selector would loop React. */
const NO_PRESETS: PlaylistPreset[] = []

const KIND_ICON: Record<AssetKind, string> = { music: '♪', ambience: '〜', sfx: '🔊' }
const KIND_CHIP: Record<AssetKind, string> = {
  music: 'border-hearth-ember/60 text-hearth-ember hover:bg-hearth-ember/20',
  ambience: 'border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/20',
  sfx: 'border-hearth-gold/60 text-hearth-gold hover:bg-hearth-gold/20'
}
const KIND_LIT: Record<AssetKind, string> = {
  music: 'bg-hearth-ember/20 shadow-ember',
  ambience: 'bg-emerald-500/20',
  sfx: 'bg-hearth-gold/20'
}

export interface Mood {
  icon: string
  label: string
}

/** The category doubles as a mood tag (tension, somber, combat, tavern…). */
function MoodDot({ mood }: { mood: Mood | null | undefined }) {
  if (!mood) return null
  return (
    <span title={`Mood: ${mood.label}`} aria-label={`Mood: ${mood.label}`} className="-ml-0.5 text-[11px] opacity-80">
      {mood.icon}
    </span>
  )
}

function RowLabel({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="w-16 flex-none pt-1 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted"
    >
      {children}
    </span>
  )
}

/** A playing item: name + a small (deliberately imprecise) fader + kill. */
function NowChip({
  icon,
  label,
  className,
  mood,
  volume,
  defaultVolume,
  onVolume,
  onNext,
  onStop,
  stopTitle
}: {
  icon: string
  label: string
  className: string
  mood?: Mood | null
  volume: number | undefined
  defaultVolume: number
  onVolume: (v: number) => void
  onNext?: () => void
  onStop: () => void
  stopTitle: string
}) {
  return (
    <span className={`flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-1 text-sm transition-colors ${className}`}>
      <span aria-hidden>{icon}</span>
      <MoodDot mood={mood} />
      <span className="max-w-[10rem] truncate">{label}</span>
      <span className="w-12">
        <VolumeFader value={volume} defaultValue={defaultVolume} onChange={onVolume} />
      </span>
      {onNext && (
        <button
          onClick={onNext}
          title="Next track"
          className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] leading-none opacity-70 hover:bg-black/30 hover:opacity-100"
        >
          ⏭
        </button>
      )}
      <button
        onClick={onStop}
        title={stopTitle}
        className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] leading-none opacity-60 hover:bg-black/30 hover:opacity-100"
      >
        ✕
      </button>
    </span>
  )
}

/** A fire/toggle chip for the run-mode scene row and the staples row. */
function FireChip({
  kind,
  label,
  lit,
  mood,
  onClick,
  title,
  extra
}: {
  kind: AssetKind
  label: string
  lit: boolean
  mood?: Mood | null
  onClick: () => void
  title: string
  extra?: React.ReactNode
}) {
  return (
    <span
      className={`group flex items-center rounded-full border text-sm transition-colors ${KIND_CHIP[kind]} ${
        lit ? KIND_LIT[kind] : 'bg-hearth-panel2/60'
      }`}
    >
      <button onClick={onClick} title={title} className="flex items-center gap-1.5 py-1 pl-2.5 pr-2">
        <span aria-hidden>{lit ? '⏹' : KIND_ICON[kind]}</span>
        <MoodDot mood={mood} />
        <span className="max-w-[9rem] truncate">{label}</span>
      </button>
      {extra}
    </span>
  )
}

/**
 * The Sound Console: the always-visible bottom deck that IS the live player.
 * Rows (each only when it has content):
 *   NOW      everything audible, each with a small fader + kill switch
 *   SCENE    (Run mode) the armed scene's tracks / beds / SFX as fire chips —
 *            the whole live surface without scrolling the board mid-read
 *   PLAYLISTS campaign-wide presets (auto-advancing, work in any scene)
 *   STAPLES  ★-favorited library sounds, fireable anywhere
 */
export default function SoundConsole() {
  const status = useStore((s) => s.status)
  const scenes = useStore((s) => s.campaign.scenes)
  const assets = useStore((s) => s.campaign.library.assets)
  const presetsRaw = useStore((s) => s.campaign.library.playlists)
  const presets = presetsRaw ?? NO_PRESETS
  const currentSceneId = useStore((s) => s.currentSceneId)
  const runMode = useStore((s) => s.uiMode === 'run')
  const stopAll = useStore((s) => s.stopAll)
  const switchMusic = useStore((s) => s.switchMusic)
  const playSfx = useStore((s) => s.playSfx)
  const toggleAmbience = useStore((s) => s.toggleAmbience)
  const fireFavorite = useStore((s) => s.fireFavorite)
  const togglePresetPlaylist = useStore((s) => s.togglePresetPlaylist)
  const presetStep = useStore((s) => s.presetStep)
  const playlistStep = useStore((s) => s.playlistStep)
  const deletePlaylistPreset = useStore((s) => s.deletePlaylistPreset)
  const activePresetId = useStore((s) => s.activePresetId)
  const buildMode = !runMode
  const favorites = useFavorites()
  const [staplesOpen, setStaplesOpen] = useState(localStorage.getItem('hearth:staplesOpen') !== '0')

  const scene = scenes.find((s) => s.id === currentSceneId) ?? null
  const staples = favorites
    .map((file) => assets.find((a) => a.file === file))
    .filter((a): a is NonNullable<typeof a> => !!a && !a.trash)

  // Run mode hides the SFX grid, so its single-key hotkeys re-home here.
  useEffect(() => {
    if (!runMode || !scene) return
    const map = new Map((scene.sfx ?? []).filter((s) => s.hotkey).map((s) => [s.hotkey!.toLowerCase(), s]))
    if (map.size === 0) return
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState()
      if (st.libraryOpen || st.triage || st.discordOpen) return
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const item = map.get(e.key.toLowerCase())
      if (item) {
        e.preventDefault()
        playSfx(item.id)
        pushRecent(item.file)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [runMode, scene, playSfx])

  // Next-track control for the playing music chip: preset queue first, then
  // the scene's own playlist mode.
  const nextTrack = activePresetId
    ? () => presetStep(1)
    : scene?.playlist?.enabled && status.activeMusicId
      ? () => playlistStep(1)
      : undefined

  const hasNow =
    !!status.activeMusicId || status.ambienceFiles.length > 0 || status.loopingSfxIds.length > 0
  const hasScene =
    runMode &&
    !!scene &&
    ((scene.music?.length ?? 0) > 0 || (scene.ambience?.length ?? 0) > 0 || (scene.sfx?.length ?? 0) > 0)
  if (!hasNow && !hasScene && presets.length === 0 && staples.length === 0) return null

  // NOW-row label/volume lookups can hit any scene — the sounding item may
  // belong to a scene that's no longer armed (exactly when showing it matters).
  const musicTrack = scenes.flatMap((s) => s.music ?? []).find((m) => m.id === status.activeMusicId)
  const musicLabel = status.activeMusicId
    ? musicTrack?.label ??
      (status.activeMusicId.includes('/') ? stem(status.activeMusicId) : status.activeMusicId)
    : null
  const ambLayer = (file: string) => scenes.flatMap((s) => s.ambience ?? []).find((a) => a.file === file)
  const sfxItem = (id: string) => scenes.flatMap((s) => s.sfx ?? []).find((x) => x.id === id)

  // The library category doubles as the mood tag (tension/somber/combat/
  // tavern…). Bulk-utility categories aren't moods — skip them.
  const moodOf = (file: string | null | undefined): Mood | null => {
    if (!file) return null
    const c = assets.find((x) => x.file === file)?.category
    if (!c || c === 'footsteps' || c === 'voices') return null
    const m = categoryMeta(c)
    return { icon: m.icon, label: m.label }
  }

  const toggleStaples = (): void => {
    localStorage.setItem('hearth:staplesOpen', staplesOpen ? '0' : '1')
    setStaplesOpen(!staplesOpen)
  }

  return (
    <div className="max-h-56 space-y-1.5 overflow-y-auto border-t-2 border-hearth-ember/30 bg-hearth-panel px-4 py-2 shadow-[0_-4px_16px_rgba(0,0,0,0.35)]">
      {/* NOW — everything audible */}
      {hasNow && (
        <div className="flex flex-wrap items-center gap-2">
          <RowLabel title="Everything currently audible — adjust or kill each without leaving the script">
            Now
          </RowLabel>
          {musicLabel && (
            <NowChip
              icon="♪"
              label={musicLabel}
              className="border-hearth-ember/60 bg-hearth-ember/10 text-hearth-ember"
              mood={moodOf(musicTrack?.file ?? (status.activeMusicId?.includes('/') ? status.activeMusicId : null))}
              volume={musicTrack?.volume}
              defaultVolume={0.6}
              onVolume={(v) => engine.setActiveMusicVolume(v)}
              onNext={nextTrack}
              onStop={() => engine.stopMusic()}
              stopTitle="Fade this track out"
            />
          )}
          {status.ambienceFiles.map((file) => (
            <NowChip
              key={file}
              icon="〜"
              label={stem(file)}
              className="border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
              mood={moodOf(file)}
              volume={ambLayer(file)?.volume}
              defaultVolume={0.4}
              onVolume={(v) => engine.setAmbienceLayerVolume(file, v)}
              onStop={() => engine.stopAmbienceLayer(file)}
              stopTitle="Fade this bed out"
            />
          ))}
          {status.loopingSfxIds.map((id) => (
            <NowChip
              key={id}
              icon="🔁"
              label={sfxItem(id)?.label ?? id}
              className="border-hearth-gold/60 bg-hearth-gold/10 text-hearth-gold"
              mood={moodOf(sfxItem(id)?.file)}
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
            className="ml-auto rounded border border-hearth-emberdim bg-hearth-emberdim/20 px-2.5 py-1 text-xs text-hearth-gold hover:bg-hearth-emberdim/40"
          >
            ⏹ All
          </button>
        </div>
      )}

      {/* SCENE — the armed scene's whole palette, fireable from down here (Run mode) */}
      {hasScene && scene && (
        <div className="flex flex-wrap items-center gap-2">
          <RowLabel title="This scene's sounds — fire them from here without scrolling the board">
            Scene
          </RowLabel>
          {(scene.music ?? []).map((t) => (
            <FireChip
              key={t.id}
              kind="music"
              label={t.label}
              mood={moodOf(t.file)}
              lit={status.activeMusicId === t.id}
              onClick={() => {
                switchMusic(t.id)
                pushRecent(t.file)
              }}
              title={status.activeMusicId === t.id ? 'Playing' : `Crossfade to ${t.label}`}
            />
          ))}
          {(scene.ambience ?? []).map((a) => (
            <FireChip
              key={a.file}
              kind="ambience"
              label={stem(a.file)}
              mood={moodOf(a.file)}
              lit={status.ambienceFiles.includes(a.file)}
              onClick={() => {
                if (!status.ambienceFiles.includes(a.file)) pushRecent(a.file)
                toggleAmbience(a.file)
              }}
              title={status.ambienceFiles.includes(a.file) ? 'Stop this bed' : 'Start this bed'}
            />
          ))}
          {(scene.sfx ?? []).map((s) => (
            <FireChip
              key={s.id}
              kind="sfx"
              label={s.label}
              mood={moodOf(s.file)}
              lit={status.loopingSfxIds.includes(s.id)}
              onClick={() => {
                playSfx(s.id)
                pushRecent(s.file)
              }}
              title={s.loop ? 'Tap to start/stop this loop' : `Fire ${s.label}`}
            />
          ))}
        </div>
      )}

      {/* PLAYLISTS — campaign-wide presets */}
      {presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <RowLabel title="Campaign-wide playlists — auto-advance, work in any scene">🎜 Lists</RowLabel>
          {presets.map((p) => {
            const active = p.id === activePresetId
            return (
              <span
                key={p.id}
                className={`group flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors ${
                  active
                    ? 'border-hearth-ember bg-hearth-ember/20 text-hearth-ember shadow-ember'
                    : 'border-hearth-ember/50 bg-hearth-panel2/60 text-hearth-ember/90 hover:bg-hearth-ember/15'
                }`}
              >
                <button
                  onClick={() => togglePresetPlaylist(p.id)}
                  title={active ? `Stop "${p.name}"` : `Play "${p.name}" (${p.files.length} tracks, auto-advances)`}
                  className="flex items-center gap-1"
                >
                  <span aria-hidden>{active ? '⏹' : '▶'}</span>
                  <span className="max-w-[10rem] truncate">{p.name}</span>
                  <span className="text-hearth-muted/70">{p.files.length}</span>
                </button>
                {active && (
                  <button onClick={() => presetStep(1)} title="Next track" className="px-0.5 hover:text-hearth-gold">
                    ⏭
                  </button>
                )}
                {buildMode && !active && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete playlist "${p.name}"? (Tracks stay in the library.)`)) {
                        void deletePlaylistPreset(p.id)
                      }
                    }}
                    title="Delete this playlist"
                    className="px-0.5 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}

      {/* STAPLES — ★ favorites, fireable anywhere */}
      {staples.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={toggleStaples}
            title={staplesOpen ? 'Collapse staples' : 'Expand staples'}
            className="w-16 flex-none pt-1 text-left text-[10px] font-semibold uppercase tracking-wider text-hearth-gold"
          >
            ★ Staples <span className="text-hearth-muted">{staplesOpen ? '▾' : `${staples.length}`}</span>
          </button>
          {staplesOpen &&
            staples.map((a) => {
              const lit =
                (a.kind === 'music' && status.activeMusicId === a.file) ||
                (a.kind === 'ambience' && status.ambienceFiles.includes(a.file))
              return (
                <FireChip
                  key={a.file}
                  kind={a.kind}
                  label={assetDisplayName(a)}
                  mood={moodOf(a.file)}
                  lit={lit}
                  onClick={() => {
                    fireFavorite(a.file)
                    pushRecent(a.file)
                  }}
                  title={
                    a.kind === 'sfx'
                      ? `Fire ${assetDisplayName(a)}`
                      : lit
                        ? `Stop ${assetDisplayName(a)}`
                        : `Play ${assetDisplayName(a)} (works in any scene)`
                  }
                />
              )
            })}
        </div>
      )}
    </div>
  )
}
