import type { Scene } from '../../shared/types'
import { useStore } from '../store'
import { LoopButton, VolumeFader } from './Mixer'

function basename(file: string): string {
  return file.split('/').pop() ?? file
}

/** Per-layer live mixer for the scene's ambience beds. */
export default function AmbienceMixer({ scene }: { scene: Scene }) {
  const setVolume = useStore((s) => s.setAmbienceLayerVolume)
  const setLoop = useStore((s) => s.setAmbienceLayerLoop)
  const playing = useStore((s) => s.status.ambienceFiles)
  const layers = scene.ambience ?? []
  if (layers.length === 0) return null

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-hearth-muted">Ambience</h3>
      <div className="space-y-1.5">
        {layers.map((layer) => {
          const isPlaying = playing.includes(layer.file)
          return (
            <div
              key={layer.file}
              className="flex items-center gap-3 rounded-md border border-hearth-border bg-hearth-panel2 px-3 py-2"
            >
              <span
                className={`inline-block h-1.5 w-1.5 flex-none rounded-full ${
                  isPlaying ? 'animate-pulse bg-hearth-ember' : 'bg-hearth-muted/40'
                }`}
              />
              <span className="w-44 flex-none truncate text-sm text-hearth-text">{basename(layer.file)}</span>
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
    </section>
  )
}
