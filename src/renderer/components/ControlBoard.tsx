import { useState } from 'react'
import type { Scene } from '../../shared/types'
import { useStore } from '../store'
import TopBar from './TopBar'
import SceneList from './SceneList'
import MusicPalette from './MusicPalette'
import SfxGrid from './SfxGrid'
import ScriptPanel from './ScriptPanel'
import ImageStrip from './ImageStrip'
import IdeasPanel from './IdeasPanel'
import CastPanel from './CastPanel'
import Toasts from './Toasts'
import LibraryPanel from './LibraryPanel'

export default function ControlBoard() {
  const { campaign, currentSceneId } = useStore()
  const scene = campaign.scenes.find((s) => s.id === currentSceneId) ?? null

  return (
    <div className="flex h-full flex-col bg-hearth-bg text-hearth-text">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <SceneList />

        <main className="flex-1 space-y-6 overflow-y-auto p-6">
          {!scene ? (
            <EmptyState hasCampaign={!!campaign.path} />
          ) : (
            <>
              <div>
                <h2 className="text-2xl font-semibold text-hearth-text">{scene.name}</h2>
                {scene.dmNotes && (
                  <p className="mt-1 rounded border border-hearth-border/60 bg-hearth-panel/40 px-3 py-2 text-sm text-hearth-muted">
                    {scene.dmNotes}
                  </p>
                )}
              </div>
              <MusicPalette scene={scene} />
              <ScriptPanel key={scene.id} scene={scene} />
              <SfxGrid scene={scene} />
            </>
          )}
        </main>

        {scene && <RightPanel scene={scene} />}
      </div>
      <LibraryPanel />
      <Toasts />
    </div>
  )
}

type Tab = 'images' | 'ideas' | 'cast'

function RightPanel({ scene }: { scene: Scene }) {
  const [tab, setTab] = useState<Tab>('images')
  const ideaCount = scene.ideas?.length ?? 0
  const castCount = scene.entities?.length ?? 0

  const tabs: { id: Tab; label: string }[] = [
    { id: 'images', label: 'Images' },
    { id: 'ideas', label: `Ideas${ideaCount ? ` ${ideaCount}` : ''}` },
    { id: 'cast', label: `Cast & Loot${castCount ? ` ${castCount}` : ''}` }
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
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'images' && <ImageStrip scene={scene} />}
        {tab === 'ideas' && <IdeasPanel scene={scene} />}
        {tab === 'cast' && <CastPanel scene={scene} />}
      </div>

      <AmbienceIndicator />
    </aside>
  )
}

function AmbienceIndicator() {
  const ambienceFiles = useStore((s) => s.status.ambienceFiles)
  if (ambienceFiles.length === 0) return null
  return (
    <section className="border-t border-hearth-border p-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-hearth-muted">
        Ambience (looping)
      </h3>
      <ul className="space-y-1">
        {ambienceFiles.map((f) => (
          <li key={f} className="flex items-center gap-2 text-xs text-hearth-muted">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-hearth-ember" />
            {f.split('/').pop()}
          </li>
        ))}
      </ul>
    </section>
  )
}

function EmptyState({ hasCampaign }: { hasCampaign: boolean }) {
  return (
    <div className="mx-auto mt-24 max-w-md text-center text-hearth-muted">
      <div className="mb-3 text-4xl">🔥</div>
      <h2 className="mb-2 text-lg text-hearth-text">
        {hasCampaign ? 'No scene selected' : 'Welcome to Hearth'}
      </h2>
      <p className="text-sm">
        {hasCampaign
          ? 'Pick a scene on the left, or add a scene JSON file to the scenes/ folder. See AUTHORING.md in the campaign folder for the format.'
          : 'Choose a campaign folder from the top bar to get started.'}
      </p>
    </div>
  )
}
