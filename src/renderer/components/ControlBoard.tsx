import { useStore } from '../store'
import TopBar from './TopBar'
import SceneList from './SceneList'
import MusicPalette from './MusicPalette'
import SfxGrid from './SfxGrid'
import ScriptPanel from './ScriptPanel'
import ImageStrip from './ImageStrip'

export default function ControlBoard() {
  const { campaign, currentSceneId, status } = useStore()
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
              <ScriptPanel scene={scene} />
              <SfxGrid scene={scene} />
            </>
          )}
        </main>

        <aside className="w-72 space-y-5 overflow-y-auto border-l border-hearth-border bg-hearth-panel/40 p-4">
          {scene && <ImageStrip scene={scene} />}
          <AmbienceIndicator />
        </aside>
      </div>
    </div>
  )
}

function AmbienceIndicator() {
  const ambienceFiles = useStore((s) => s.status.ambienceFiles)
  if (ambienceFiles.length === 0) return null
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-hearth-muted">
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
