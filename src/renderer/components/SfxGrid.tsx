import { useEffect } from 'react'
import type { Scene, SfxItem } from '../../shared/types'
import { isTypingTarget } from '../lib/keys'
import { pushRecent, useRecents } from '../lib/prefs'
import { useStore } from '../store'
import { LoopButton, VolumeFader } from './Mixer'
import SectionHeader from './SectionHeader'

export default function SfxGrid({ scene }: { scene: Scene }) {
  const playSfx = useStore((s) => s.playSfx)
  const setSfxItemVolume = useStore((s) => s.setSfxItemVolume)
  const setSfxItemLoop = useStore((s) => s.setSfxItemLoop)
  const removeSfxItem = useStore((s) => s.removeSfxItem)
  const buildMode = useStore((s) => s.uiMode === 'build')
  const loopingSfxIds = useStore((s) => s.status.loopingSfxIds)
  const openLibrary = useStore((s) => s.openLibrary)
  const recents = useRecents()
  const sfx = scene.sfx ?? []

  const fire = (item: SfxItem) => {
    playSfx(item.id)
    pushRecent(item.file)
  }

  // Recently fired SFX that live on this scene — quick re-fire chips.
  const recentSfx = recents
    .map((f) => sfx.find((s) => s.file === f))
    .filter((s): s is SfxItem => !!s)

  // Hotkeys: single-character keys defined on the scene's sfx fire them.
  useEffect(() => {
    const map = new Map(sfx.filter((s) => s.hotkey).map((s) => [s.hotkey!.toLowerCase(), s]))
    if (map.size === 0) return
    const onKey = (e: KeyboardEvent) => {
      // A modal owns the keyboard — K/J in Triage must not fire scene SFX.
      const st = useStore.getState()
      if (st.libraryOpen || st.triage || st.discordOpen || st.switcherOpen || st.captureOpen) return
      if (isTypingTarget(e.target)) return
      const item = map.get(e.key.toLowerCase())
      if (item) {
        e.preventDefault()
        playSfx(item.id)
        pushRecent(item.file)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sfx, playSfx])

  return (
    <section>
      <SectionHeader icon="🔊" title="Sound effects">
        {buildMode && (
          <button
            onClick={() => openLibrary('sfx')}
            title="Add a sound effect from the library"
            className="rounded-full border border-hearth-border px-2 py-0.5 text-[11px] text-hearth-muted hover:border-hearth-ember hover:text-hearth-ember"
          >
            + Add sound
          </button>
        )}
      </SectionHeader>
      {recentSfx.length > 0 && sfx.length > 4 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-hearth-muted/70">Recent</span>
          {recentSfx.slice(0, 6).map((s) => (
            <button
              key={s.id}
              onClick={() => fire(s)}
              title="Fire again"
              className="rounded-full border border-hearth-border bg-hearth-panel2 px-2 py-0.5 text-[11px] text-hearth-muted transition-colors hover:border-hearth-ember hover:text-hearth-ember"
            >
              🔊 {s.label}
            </button>
          ))}
        </div>
      )}
      {sfx.length === 0 ? (
        <p className="rounded-md border border-dashed border-hearth-border bg-hearth-panel/40 px-3 py-2 text-xs text-hearth-muted">
          No sound effects yet — click <span className="text-hearth-ember">+ Add sound</span> to pull from the library.
        </p>
      ) : (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {sfx.map((s) => {
          const looping = loopingSfxIds.includes(s.id)
          return (
            <div
              key={s.id}
              className={`group flex flex-col gap-1.5 rounded-md border px-3 py-2 shadow-card transition-all ${
                looping
                  ? 'border-hearth-ember bg-hearth-ember/15 shadow-ember'
                  : 'border-hearth-border bg-hearth-panel2 hover:border-hearth-ember hover:bg-hearth-ember/10'
              }`}
            >
              <button
                onClick={() => fire(s)}
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
                {buildMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeSfxItem(s.id)
                    }}
                    title="Remove from this scene (the file stays in the library)"
                    className="flex-none text-xs text-hearth-muted opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      )}
    </section>
  )
}
