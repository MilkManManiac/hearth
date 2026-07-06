import type { Scene } from '../../shared/types'
import { pushRecent } from '../lib/prefs'
import { useStore } from '../store'
import { LoopButton, VolumeFader } from './Mixer'
import SectionHeader from './SectionHeader'

function basename(file: string): string {
  return file.split('/').pop() ?? file
}

/** Per-layer live mixer for the scene's ambience beds. */
export default function AmbienceMixer({ scene }: { scene: Scene }) {
  const setVolume = useStore((s) => s.setAmbienceLayerVolume)
  const setLoop = useStore((s) => s.setAmbienceLayerLoop)
  const toggleAmbience = useStore((s) => s.toggleAmbience)
  const openLibrary = useStore((s) => s.openLibrary)
  const playing = useStore((s) => s.status.ambienceFiles)
  const layers = scene.ambience ?? []

  return (
    <section>
      <SectionHeader icon="〜" title="Ambience">
        <button
          onClick={() => openLibrary('ambience')}
          title="Add an ambience bed from the library"
          className="rounded-full border border-hearth-border px-2 py-0.5 text-[11px] text-hearth-muted hover:border-hearth-ember hover:text-hearth-ember"
        >
          + Add ambience
        </button>
      </SectionHeader>
      {layers.length === 0 ? (
        <p className="rounded-md border border-dashed border-hearth-border bg-hearth-panel/40 px-3 py-2 text-xs text-hearth-muted">
          No ambience yet — click <span className="text-hearth-ember">+ Add ambience</span> for a looping background bed.
        </p>
      ) : (
      <div className="space-y-1.5">
        {layers.map((layer) => {
          const isPlaying = playing.includes(layer.file)
          return (
            <div
              key={layer.file}
              className={`flex items-center gap-3 rounded-md border px-3 py-2 shadow-card transition-all ${
                isPlaying ? 'border-hearth-ember bg-hearth-ember/15 shadow-ember' : 'border-hearth-border bg-hearth-panel2'
              }`}
            >
              <button
                onClick={() => {
                  if (!isPlaying) pushRecent(layer.file)
                  toggleAmbience(layer.file)
                }}
                title={isPlaying ? 'Click to stop this bed' : 'Click to play this bed'}
                className="flex w-48 flex-none items-center gap-2 text-left"
              >
                <span
                  className={`inline-block h-1.5 w-1.5 flex-none rounded-full ${
                    isPlaying ? 'animate-flicker bg-hearth-ember' : 'bg-hearth-muted/40'
                  }`}
                />
                <span className={`flex-none text-sm ${isPlaying ? 'text-hearth-ember' : 'text-hearth-muted'}`}>
                  {isPlaying ? '⏹' : '▶'}
                </span>
                <span className="truncate text-sm text-hearth-text">{basename(layer.file)}</span>
              </button>
              <div className="flex-1">
                <VolumeFader
                  value={layer.volume}
                  defaultValue={0.4}
                  onChange={(v) => setVolume(layer.file, v)}
                />
              </div>
              <LoopButton
                on={layer.loop !== false}
                onClick={() => setLoop(layer.file, layer.loop === false)}
                title="Loop this ambience bed"
              />
            </div>
          )
        })}
      </div>
      )}
    </section>
  )
}
