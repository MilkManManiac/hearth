import { useEffect, useState } from 'react'
import { NOTE_KINDS, NOTE_KIND_ORDER, type Scene } from '../../shared/types'
import { useStore } from '../store'
import NoteBody from './NoteBody'
import TopBar from './TopBar'
import SceneList from './SceneList'
import MusicPalette from './MusicPalette'
import SfxGrid from './SfxGrid'
import AmbienceMixer from './AmbienceMixer'
import ScriptPanel from './ScriptPanel'
import ImageStrip from './ImageStrip'
import IdeasPanel from './IdeasPanel'
import CastPanel from './CastPanel'
import Toasts from './Toasts'
import LibraryPanel from './LibraryPanel'
import SoundConsole from './SoundConsole'
import NotesRail from './NotesRail'
import NoteView from './NoteView'
import QuickSwitcher from './QuickSwitcher'
import QuickCapture from './QuickCapture'

/** A collapsed side rail: a slim strip that re-expands its panel. */
function CollapsedRail({
  side,
  icon,
  title,
  onClick
}: {
  side: 'left' | 'right'
  icon: string
  title: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex w-7 flex-none flex-col items-center gap-2 bg-hearth-panel pt-3 text-hearth-muted transition-colors hover:text-hearth-ember ${
        side === 'left' ? 'border-r border-hearth-border' : 'border-l border-hearth-border'
      }`}
    >
      <span className="text-xs">{side === 'left' ? '▸' : '◂'}</span>
      <span className="text-sm" aria-hidden>
        {icon}
      </span>
    </button>
  )
}

export default function ControlBoard() {
  const { campaign, currentSceneId, liveSceneId, goLive } = useStore()
  const runMode = useStore((s) => s.uiMode === 'run')
  const leftTab = useStore((s) => s.leftTab)
  const currentNoteId = useStore((s) => s.currentNoteId)
  const scene = campaign.scenes.find((s) => s.id === currentSceneId) ?? null
  const isLive = !!scene && scene.id === liveSceneId
  // Notes tab + a selected note → the main area shows the note page.
  const note =
    leftTab === 'notes' ? (campaign.notes.find((n) => n.id === currentNoteId) ?? null) : null
  // Side rails collapse to slim strips (persisted) — full width for the script.
  const [leftOpen, setLeftOpen] = useState(localStorage.getItem('hearth:leftRail') !== '0')
  const [rightOpen, setRightOpen] = useState(localStorage.getItem('hearth:rightRail') !== '0')
  const toggleLeft = () => {
    localStorage.setItem('hearth:leftRail', leftOpen ? '0' : '1')
    setLeftOpen(!leftOpen)
  }
  const toggleRight = () => {
    localStorage.setItem('hearth:rightRail', rightOpen ? '0' : '1')
    setRightOpen(!rightOpen)
  }

  return (
    <div className="hearth-ambient flex h-full flex-col text-hearth-text">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        {leftOpen ? (
          leftTab === 'notes' ? (
            <NotesRail onCollapse={toggleLeft} />
          ) : (
            <SceneList onCollapse={toggleLeft} />
          )
        ) : (
          <CollapsedRail
            side="left"
            icon={leftTab === 'notes' ? '📓' : '🎬'}
            title={leftTab === 'notes' ? 'Show notes' : 'Show scenes'}
            onClick={toggleLeft}
          />
        )}

        <main className="flex-1 space-y-6 overflow-y-auto p-6">
          {note ? (
            <NoteView key={note.id} note={note} />
          ) : leftTab === 'notes' ? (
            <NotesEmptyState hasNotes={campaign.notes.length > 0} />
          ) : !scene ? (
            <EmptyState hasCampaign={!!campaign.path} />
          ) : (
            <>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="font-display text-3xl font-semibold tracking-tight text-hearth-text">
                    {scene.name}
                  </h2>
                  {isLive ? (
                    <span
                      className="flex items-center gap-1.5 rounded-full border border-hearth-ember/60 bg-hearth-ember/10 px-2.5 py-1 text-xs text-hearth-ember"
                      title="This scene's atmosphere is playing"
                    >
                      <span className="inline-block h-1.5 w-1.5 animate-flicker rounded-full bg-hearth-ember" />
                      live
                    </span>
                  ) : (
                    <button
                      onClick={goLive}
                      title="Start this scene's atmosphere: crossfade to its default track and start its ambience beds. Until then, selecting a scene is silent."
                      className="rounded-full border border-hearth-ember bg-hearth-ember/15 px-3 py-1 text-sm text-hearth-ember shadow-ember transition-colors hover:bg-hearth-ember/30"
                    >
                      ▶ Go live
                    </button>
                  )}
                </div>
                <div className="mt-2 h-px w-full bg-gradient-to-r from-hearth-ember/50 via-hearth-border to-transparent" />
                {scene.dmNotes && (
                  <p className="mt-3 rounded border-l-2 border-hearth-emberdim/60 bg-hearth-panel/40 px-3 py-2 text-sm italic text-hearth-muted">
                    {scene.dmNotes}
                  </p>
                )}
              </div>
              {/* Run mode: the script owns the screen — ALL sound control
                  lives in the Sound Console at the bottom. Build mode shows
                  the full authoring palettes. */}
              {runMode ? (
                <ScriptPanel key={scene.id} scene={scene} />
              ) : (
                <>
                  <MusicPalette scene={scene} />
                  <ScriptPanel key={scene.id} scene={scene} />
                  <SfxGrid scene={scene} />
                  <AmbienceMixer scene={scene} />
                </>
              )}
            </>
          )}
        </main>

        {scene &&
          (rightOpen ? (
            <RightPanel scene={scene} onCollapse={toggleRight} />
          ) : (
            <CollapsedRail side="right" icon="🗂" title="Show images / ideas / cast" onClick={toggleRight} />
          ))}
      </div>
      <SoundConsole />
      <LibraryPanel />
      <QuickSwitcher />
      <QuickCapture />
      <Toasts />
    </div>
  )
}

type Tab = 'images' | 'ideas' | 'cast' | 'notes'

function RightPanel({ scene, onCollapse }: { scene: Scene; onCollapse: () => void }) {
  const [tab, setTab] = useState<Tab>('images')
  const currentNoteId = useStore((s) => s.currentNoteId)
  const ideaCount = scene.ideas?.length ?? 0
  const castCount = scene.entities?.length ?? 0

  // Picking a note (quick switcher, session header) surfaces it here — in run
  // mode this is how notes appear without taking the script off the screen.
  useEffect(() => {
    if (currentNoteId) setTab('notes')
  }, [currentNoteId])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'images', label: 'Images' },
    { id: 'ideas', label: `Ideas${ideaCount ? ` ${ideaCount}` : ''}` },
    { id: 'cast', label: `Cast${castCount ? ` ${castCount}` : ''}` },
    { id: 'notes', label: '📓' }
  ]

  return (
    <aside className="flex w-80 flex-col border-l border-hearth-border bg-hearth-panel/40">
      <div className="flex border-b border-hearth-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 border-b-2 px-2 py-2 text-xs transition-colors ${
              tab === t.id
                ? 'border-hearth-ember text-hearth-ember'
                : 'border-transparent text-hearth-muted hover:text-hearth-text'
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={onCollapse}
          title="Collapse this panel"
          className="border-b-2 border-transparent px-2 text-xs text-hearth-muted hover:text-hearth-ember"
        >
          ▸
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'images' && <ImageStrip scene={scene} />}
        {tab === 'ideas' && <IdeasPanel scene={scene} />}
        {tab === 'cast' && <CastPanel scene={scene} />}
        {tab === 'notes' && <NotesPeek />}
      </div>
    </aside>
  )
}

/**
 * The right panel's notes tab: pick any campaign note and read it beside the
 * script — Ctrl+K also lands notes here in run mode. Read-only on purpose;
 * editing happens on the full note page (or via Ctrl+J capture).
 */
function NotesPeek() {
  const notes = useStore((s) => s.campaign.notes)
  const currentNoteId = useStore((s) => s.currentNoteId)
  const selectNote = useStore((s) => s.selectNote)
  const setLeftTab = useStore((s) => s.setLeftTab)
  const buildMode = useStore((s) => s.uiMode === 'build')
  const note = notes.find((n) => n.id === currentNoteId) ?? null

  if (notes.length === 0) {
    return (
      <p className="text-xs text-hearth-muted">
        No notes yet — open 📓 Notes in the left rail (build mode) to start your campaign
        notebook, or press <kbd className="rounded border border-hearth-border px-1">Ctrl+J</kbd>{' '}
        to log something to the session.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <select
        value={note?.id ?? ''}
        onChange={(e) => selectNote(e.target.value || null)}
        className="w-full rounded border border-hearth-border bg-hearth-panel2 px-2 py-1 text-sm text-hearth-text"
      >
        <option value="">— pick a note —</option>
        {NOTE_KIND_ORDER.map((kind) => {
          const items = notes.filter((n) => n.kind === kind)
          if (items.length === 0) return null
          return (
            <optgroup key={kind} label={NOTE_KINDS[kind].plural}>
              {items.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </optgroup>
          )
        })}
      </select>
      {note && (
        <>
          <div className="flex items-center gap-2 text-sm font-semibold text-hearth-text">
            <span aria-hidden>{NOTE_KINDS[note.kind]?.icon}</span>
            <span className="flex-1 truncate">{note.title}</span>
            {buildMode && (
              <button
                onClick={() => setLeftTab('notes')}
                title="Open the full note page for editing"
                className="text-xs text-hearth-muted hover:text-hearth-ember"
              >
                ✎ Edit
              </button>
            )}
          </div>
          <NoteBody doc={note.body ?? []} />
        </>
      )}
    </div>
  )
}

function NotesEmptyState({ hasNotes }: { hasNotes: boolean }) {
  return (
    <div className="mx-auto mt-28 max-w-md text-center text-hearth-muted">
      <div className="mb-4 text-5xl drop-shadow-[0_0_18px_rgba(224,138,60,0.45)]">📓</div>
      <h2 className="mb-2 font-display text-2xl font-semibold text-hearth-text">
        {hasNotes ? 'No note selected' : 'Your campaign notebook'}
      </h2>
      <p className="text-sm leading-relaxed">
        {hasNotes
          ? 'Pick a note on the left, or create one with + New note.'
          : 'Sessions, NPCs, locations, factions, plot threads — everything you need at the table, one click away. Hit + New note on the left to start.'}
      </p>
    </div>
  )
}

function EmptyState({ hasCampaign }: { hasCampaign: boolean }) {
  return (
    <div className="mx-auto mt-28 max-w-md text-center text-hearth-muted">
      <div className="mb-4 text-5xl drop-shadow-[0_0_18px_rgba(224,138,60,0.45)]">🔥</div>
      <h2 className="mb-2 font-display text-2xl font-semibold text-hearth-text">
        {hasCampaign ? 'No scene selected' : 'Welcome to Hearth'}
      </h2>
      <p className="text-sm leading-relaxed">
        {hasCampaign
          ? 'Pick a scene on the left, or drop a scene JSON into the scenes/ folder — it appears here automatically. See AUTHORING.md in the campaign folder for the format.'
          : 'Choose a campaign folder from the top bar to gather round and get started.'}
      </p>
    </div>
  )
}
