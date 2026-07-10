import { useState } from 'react'
import { engine, useStore } from '../store'
import TriagePanel from './TriagePanel'
import DiscordPanel from './DiscordPanel'

function Slider({
  label,
  value,
  defaultValue,
  onChange
}: {
  label: string
  value: number
  defaultValue: number
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
        title={`${label} ${Math.round(value * 100)}% — double-click to reset`}
        onDoubleClick={() => onChange(defaultValue)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28"
      />
      <span className="w-8 tabular-nums text-hearth-muted/70">{Math.round(value * 100)}%</span>
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

/** Prep-vs-table workflow tools, folded behind one button to keep the bar calm. */
function ToolsMenu() {
  const [open, setOpen] = useState(false)
  const importAssets = useStore((s) => s.importAssets)
  const openTriage = useStore((s) => s.openTriage)
  const probeAssets = useStore((s) => s.probeAssets)
  const revealCampaign = useStore((s) => s.revealCampaign)

  const items: { icon: string; label: string; title: string; run: () => void }[] = [
    { icon: '📥', label: 'Sound triage…', title: 'Review a drop folder of candidates — keep or cull', run: openTriage },
    { icon: '♪', label: 'Import music…', title: 'Copy music files into the campaign', run: () => importAssets('music') },
    { icon: '〜', label: 'Import ambience…', title: 'Copy ambience loops into the campaign', run: () => importAssets('ambience') },
    { icon: '🔊', label: 'Import SFX…', title: 'Copy sound effects into the campaign', run: () => importAssets('sfx') },
    { icon: '🔎', label: 'Probe assets', title: 'Check every referenced file loads', run: probeAssets },
    { icon: '📂', label: 'Reveal campaign', title: 'Open the campaign folder on disk', run: revealCampaign }
  ]

  return (
    <div className="relative">
      <Btn onClick={() => setOpen((o) => !o)} title="Prep tools: triage, imports, asset checks">
        🧰 Tools {open ? '▴' : '▾'}
      </Btn>
      {open && (
        <>
          {/* click-away layer */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-md border border-hearth-border bg-hearth-panel2 shadow-2xl">
            {items.map((item) => (
              <button
                key={item.label}
                title={item.title}
                onClick={() => {
                  setOpen(false)
                  item.run()
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-hearth-text transition-colors hover:bg-hearth-ember/10 hover:text-hearth-ember"
              >
                <span className="w-5 text-center" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function TopBar() {
  const {
    campaign,
    status,
    chooseCampaign,
    openPresenter,
    stopAll,
    openLibrary,
    openDiscord,
    discordStatus,
    uiMode,
    setUiMode
  } = useStore()

  const folderName = campaign.path ? campaign.path.split(/[\\/]/).pop() : 'no campaign'
  const run = uiMode === 'run'

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hearth-border bg-hearth-panel px-4 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.35)]">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 font-display text-xl font-semibold tracking-wide text-hearth-ember">
          <span className="text-base drop-shadow-[0_0_8px_rgba(224,138,60,0.6)]">🔥</span>
          Hearth
        </span>

        {/* Build ↔ Run: authoring chrome vs. the clean at-the-table view. */}
        <div className="flex overflow-hidden rounded-full border border-hearth-border" role="group">
          <button
            onClick={() => setUiMode('build')}
            title="Build mode: full authoring tools — edit scripts, add/remove sounds, manage scenes"
            className={`px-2.5 py-1 text-xs transition-colors ${
              !run ? 'bg-hearth-ember/20 text-hearth-ember' : 'text-hearth-muted hover:text-hearth-text'
            }`}
          >
            ⚒ Build
          </button>
          <button
            onClick={() => setUiMode('run')}
            title="Run mode: the at-the-table view — just the read-aloud and fire controls, no authoring chrome"
            className={`px-2.5 py-1 text-xs transition-colors ${
              run ? 'bg-hearth-ember/20 text-hearth-ember' : 'text-hearth-muted hover:text-hearth-text'
            }`}
          >
            🎲 Run
          </button>
        </div>

        {!run && (
          <button
            onClick={chooseCampaign}
            title="Choose campaign folder"
            className="rounded bg-hearth-panel2 px-2 py-1 text-xs text-hearth-muted hover:text-hearth-text"
          >
            📁 {folderName}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Btn
          onClick={() => useStore.getState().setSwitcherOpen(true)}
          title="Find any scene or note — fuzzy search everything (Ctrl+K)"
        >
          🔍 Find
          <kbd className="ml-1.5 rounded border border-hearth-border bg-hearth-bg px-1 font-mono text-[9px] text-hearth-muted">
            Ctrl K
          </kbd>
        </Btn>
        <Btn onClick={openLibrary} title="Browse, search & audition the asset library">📚 Library</Btn>
        <Btn
          onClick={() => useStore.getState().openCompendium()}
          title="SRD 5.2.1 rules compendium — monsters, spells, species, classes, items (2024 rules, offline)"
        >
          📖 Rules
        </Btn>
        <Btn
          onClick={() => useStore.getState().setPartyOpen(true)}
          title="The party: character sheets + the at-a-glance dashboard (AC/HP/passives/conditions)"
        >
          🛡 Party
        </Btn>
        {!run && <ToolsMenu />}
        <button
          onClick={() => useStore.getState().setHelpOpen(true)}
          title="Keyboard shortcuts (?)"
          className="rounded-full border border-hearth-border bg-hearth-panel2 px-2 py-1 text-xs text-hearth-muted transition-colors hover:border-hearth-ember hover:text-hearth-ember"
        >
          ?
        </button>
      </div>

      <div className="ml-auto flex flex-col gap-1">
        <div className="flex gap-4">
          <Slider label="Master" value={status.masterVolume} defaultValue={0.9} onChange={(v) => engine.setMasterVolume(v)} />
          <Slider label="Music" value={status.musicVolume} defaultValue={1} onChange={(v) => engine.setMusicVolume(v)} />
        </div>
        <div className="flex gap-4">
          <Slider label="Ambience" value={status.ambienceVolume} defaultValue={1} onChange={(v) => engine.setAmbienceVolume(v)} />
          <Slider label="SFX" value={status.sfxVolume} defaultValue={1} onChange={(v) => engine.setSfxVolume(v)} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={openDiscord}
          title={
            discordStatus?.state === 'joined'
              ? `Streaming to ${discordStatus.guildName} / ${discordStatus.channelName}`
              : 'Stream the mix into a Discord voice channel (experimental)'
          }
          className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm transition-colors ${
            discordStatus?.state === 'joined'
              ? 'border-hearth-ember bg-hearth-ember/15 text-hearth-ember'
              : 'border-hearth-border bg-hearth-panel2 text-hearth-text hover:border-hearth-ember hover:text-hearth-ember'
          }`}
        >
          {discordStatus?.state === 'joined' && (
            <span className="inline-block h-1.5 w-1.5 animate-flicker rounded-full bg-hearth-ember" />
          )}
          🎧 Discord
          {discordStatus?.chronicling && (
            <span
              className="flex items-center gap-1 rounded-full bg-red-500/20 px-1.5 text-[9px] font-bold uppercase tracking-wider text-red-300"
              title={`The Chronicler is recording (${discordStatus.utterances ?? 0} utterances)`}
            >
              <span className="inline-block h-1 w-1 animate-flicker rounded-full bg-red-400" />
              rec
            </span>
          )}
        </button>
        <Btn onClick={openPresenter} title="Open the player-facing presenter window">🖥 Presenter</Btn>
        <button
          onClick={() => engine.setMonitorMuted(!status.monitorMuted)}
          title={
            status.monitorMuted
              ? 'Local speakers muted (the Discord stream still plays) — click to unmute. Auto-unmutes when you leave the voice channel.'
              : 'Mute your local speakers while streaming — players still hear everything, you stop hearing it twice'
          }
          className={`rounded border px-3 py-1.5 text-sm transition-colors ${
            status.monitorMuted
              ? 'border-red-500/60 bg-red-500/15 text-red-300'
              : 'border-hearth-border bg-hearth-panel2 text-hearth-text hover:border-hearth-ember hover:text-hearth-ember'
          }`}
        >
          {status.monitorMuted ? '🔇 Local' : '🔊 Local'}
        </button>
        <button
          onClick={stopAll}
          title="Fade everything out — music, beds, loops, one-shots (Esc)"
          className="rounded border border-hearth-emberdim bg-hearth-emberdim/20 px-3 py-1.5 text-sm text-hearth-gold hover:bg-hearth-emberdim/40"
        >
          ⏹ Stop all
        </button>
      </div>

      {/* Triage review inbox + Discord bridge (fixed-position modals; live
          here because the board root is LibraryPanel's home and the buttons
          are ours). */}
      <TriagePanel />
      <DiscordPanel />
    </header>
  )
}
