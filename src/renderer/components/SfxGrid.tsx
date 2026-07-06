import { useEffect } from 'react'
import type { Scene } from '../../shared/types'
import { useStore } from '../store'
import { LoopButton, VolumeFader } from './Mixer'

export default function SfxGrid({ scene }: { scene: Scene }) {
  const playSfx = useStore((s) => s.playSfx)
  const setSfxItemVolume = useStore((s) => s.setSfxItemVolume)
  const setSfxItemLoop = useStore((s) => s.setSfxItemLoop)
  const loopingSfxIds = useStore((s) => s.status.loopingSfxIds)
  const sfx = scene.sfx ?? []

  // Hotkeys: single-character keys defined on the scene's sfx fire them.
  useEffect(() => {
    const map = new Map(sfx.filter((s) => s.hotkey).map((s) => [s.hotkey!.toLowerCase(), s.id]))
    if (map.size === 0) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      const id = map.get(e.key.toLowerCase())
      if (id) {
        e.preventDefault()
        playSfx(id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sfx, playSfx])

  if (sfx.length === 0) return null

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-hearth-muted">
        Sound effects
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {sfx.map((s) => {
          const looping = loopingSfxIds.includes(s.id)
          return (
            <div
              key={s.id}
              className={`group flex flex-col gap-1.5 rounded-md border px-3 py-2 transition-colors ${
                looping
                  ? 'border-hearth-ember bg-hearth-ember/15'
                  : 'border-hearth-border bg-hearth-panel2 hover:border-hearth-ember hover:bg-hearth-ember/10'
              }`}
            >
              <button
                onClick={() => playSfx(s.id)}
                className="flex items-center justify-between text-left text-sm text-hearth-text"
              >
                <span className="truncate">
                  <span className={`mr-1.5 ${looping ? 'text-hearth-ember' : 'text-hearth-muted group-hover:text-hearth-ember'}`}>
                    {looping ? '⏹' : '🔊'}
                  </span>
                  {s.label}
                </span>
                {s.hotkey && (
                  <kbd className="ml-2 flex-none rounded bg-hearth-bg px-1.5 py-0.5 text-[10px] text-hearth-muted">
                    {s.hotkey}
                  </kbd>
                )}
              </button>
              <div className="flex items-center gap-2">
                <VolumeFader value={s.volume} defaultValue={0.9} onChange={(v) => setSfxItemVolume(s.id, v)} />
                <LoopButton on={!!s.loop} onClick={() => setSfxItemLoop(s.id, !s.loop)} title="Loop (hold) this sound" />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
