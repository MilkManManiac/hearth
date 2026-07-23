import { type Scene } from '../../shared/types'
import { pushRecent } from '../lib/prefs'
import { useStore } from '../store'

/** "ambience/nox-rain-strong.ogg" → "nox-rain-strong" */
function stem(file: string): string {
  return (file.split('/').pop() ?? file).replace(/\.[^.]+$/, '')
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-hearth-muted">
      {children}
    </h3>
  )
}

function PaletteRow({
  label,
  lit,
  onClick,
  title,
  suffix
}: {
  label: string
  lit: boolean
  onClick: () => void
  title: string
  suffix?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`mb-1 flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-[13px] transition-colors ${
        lit
          ? 'border-hearth-ember/50 bg-hearth-ember/10 text-hearth-text'
          : 'border-transparent text-hearth-muted hover:border-hearth-border hover:bg-hearth-panel2 hover:text-hearth-text'
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 flex-none rounded-full ${lit ? 'bg-hearth-ember shadow-ember' : 'bg-hearth-border'}`}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {suffix && <span className="flex-none text-[11px] text-hearth-muted/70">{suffix}</span>}
    </button>
  )
}

/**
 * The scene's sound palette as a right-rail column (run-screen redesign):
 * everything you MIGHT tap lives here, so the bottom console can slim down to
 * only what's actually sounding. Same actions as the old console rows —
 * music crossfades (one at a time), beds toggle and layer, SFX fire.
 */
export default function ScenePaletteRail({ scene }: { scene: Scene }) {
  const status = useStore((s) => s.status)
  const switchMusic = useStore((s) => s.switchMusic)
  const toggleAmbience = useStore((s) => s.toggleAmbience)
  const playSfx = useStore((s) => s.playSfx)

  const music = scene.music ?? []
  const ambience = scene.ambience ?? []
  const sfx = scene.sfx ?? []

  if (music.length === 0 && ambience.length === 0 && sfx.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-hearth-muted">
        This scene has no sound palette yet — switch to build mode to add music, beds, and SFX
        (or drag them in from 📚 Library).
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {music.length > 0 && (
        <section>
          <SectionHead>♪ Music — this scene</SectionHead>
          {music.map((t) => {
            const lit = status.activeMusicId === t.id
            return (
              <PaletteRow
                key={t.id}
                label={t.label}
                lit={lit}
                onClick={() => {
                  switchMusic(t.id)
                  pushRecent(t.file)
                }}
                title={lit ? 'Playing' : `Crossfade to ${t.label}`}
              />
            )
          })}
        </section>
      )}

      {ambience.length > 0 && (
        <section>
          <SectionHead>〜 Ambience</SectionHead>
          {ambience.map((a) => {
            const lit = status.ambienceFiles.includes(a.file)
            return (
              <PaletteRow
                key={a.file}
                label={stem(a.file)}
                lit={lit}
                suffix="∞"
                onClick={() => {
                  if (!lit) pushRecent(a.file)
                  toggleAmbience(a.file)
                }}
                title={lit ? 'Stop this bed' : 'Start this bed (loops, layers freely)'}
              />
            )
          })}
        </section>
      )}

      {sfx.length > 0 && (
        <section>
          <SectionHead>⚡ SFX</SectionHead>
          <div className="grid grid-cols-2 gap-1.5">
            {sfx.map((s) => {
              const lit = status.loopingSfxIds.includes(s.id)
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    playSfx(s.id)
                    pushRecent(s.file)
                  }}
                  title={s.loop ? 'Tap to start/stop this loop' : `Fire ${s.label}`}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-center text-[12px] transition-colors ${
                    lit
                      ? 'border-hearth-gold/70 bg-hearth-gold/15 text-hearth-gold'
                      : 'border-hearth-border bg-hearth-panel text-hearth-muted hover:border-hearth-gold/60 hover:text-hearth-text'
                  }`}
                >
                  {s.hotkey && (
                    <kbd className="rounded border border-white/25 bg-black/25 px-1 py-px font-mono text-[9px] uppercase leading-none opacity-80">
                      {s.hotkey}
                    </kbd>
                  )}
                  <span className="truncate">{s.label}</span>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
