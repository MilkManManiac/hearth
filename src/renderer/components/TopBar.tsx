import { engine, useStore } from '../store'

function Slider({
  label,
  value,
  onChange
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-hearth-muted">
      <span className="w-14 text-right">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28"
      />
    </label>
  )
}

function Btn({
  onClick,
  children,
  title
}: {
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="rounded border border-hearth-border bg-hearth-panel2 px-3 py-1.5 text-sm text-hearth-text transition-colors hover:border-hearth-ember hover:text-hearth-ember"
    >
      {children}
    </button>
  )
}

export default function TopBar() {
  const {
    campaign,
    currentSceneId,
    status,
    chooseCampaign,
    importAssets,
    revealCampaign,
    openPresenter,
    stopAll,
    probeAssets,
    openLibrary
  } = useStore()

  const folderName = campaign.path ? campaign.path.split(/[\\/]/).pop() : 'no campaign'

  // Resolve the active music track's label for the "now playing" indicator.
  const currentScene = campaign.scenes.find((s) => s.id === currentSceneId)
  const nowPlaying = status.activeMusicId
    ? currentScene?.music?.find((m) => m.id === status.activeMusicId)?.label ?? status.activeMusicId
    : null

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hearth-border bg-hearth-panel px-4 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.35)]">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 font-display text-xl font-semibold tracking-wide text-hearth-ember">
          <span className="text-base drop-shadow-[0_0_8px_rgba(224,138,60,0.6)]">🔥</span>
          Hearth
        </span>
        <button
          onClick={chooseCampaign}
          title="Choose campaign folder"
          className="rounded bg-hearth-panel2 px-2 py-1 text-xs text-hearth-muted hover:text-hearth-text"
        >
          📁 {folderName}
        </button>
        {nowPlaying && (
          <span
            className="flex items-center gap-1.5 rounded bg-hearth-panel2 px-2 py-0.5 text-xs text-hearth-muted"
            title="Music now playing"
          >
            <span className="inline-block h-1.5 w-1.5 animate-flicker rounded-full bg-hearth-ember" />
            <span className="max-w-[12rem] truncate text-hearth-text">{nowPlaying}</span>
          </span>
        )}
        {status.ducked && (
          <span className="rounded bg-hearth-emberdim/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-hearth-gold">
            ducking
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Btn onClick={openLibrary} title="Browse, search & audition the asset library">📚 Library</Btn>
        <Btn onClick={() => importAssets('music')} title="Import music files">+ Music</Btn>
        <Btn onClick={() => importAssets('ambience')} title="Import ambience loops">+ Ambience</Btn>
        <Btn onClick={() => importAssets('sfx')} title="Import sound effects">+ SFX</Btn>
      </div>

      <div className="ml-auto flex flex-col gap-1">
        <div className="flex gap-4">
          <Slider label="Master" value={status.masterVolume} onChange={(v) => engine.setMasterVolume(v)} />
          <Slider label="Music" value={status.musicVolume} onChange={(v) => engine.setMusicVolume(v)} />
        </div>
        <div className="flex gap-4">
          <Slider label="Ambience" value={status.ambienceVolume} onChange={(v) => engine.setAmbienceVolume(v)} />
          <Slider label="SFX" value={status.sfxVolume} onChange={(v) => engine.setSfxVolume(v)} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Btn onClick={openPresenter} title="Open the player-facing presenter window">🖥 Presenter</Btn>
        <Btn onClick={probeAssets} title="Check every referenced asset loads">Probe</Btn>
        <Btn onClick={revealCampaign} title="Open campaign folder on disk">Reveal</Btn>
        <button
          onClick={stopAll}
          className="rounded border border-hearth-emberdim bg-hearth-emberdim/20 px-3 py-1.5 text-sm text-hearth-gold hover:bg-hearth-emberdim/40"
        >
          ⏹ Stop all
        </button>
      </div>
    </header>
  )
}
