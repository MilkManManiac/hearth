import { useStore } from '../store'

interface Row {
  keys: string[]
  what: string
}

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: 'Anywhere',
    rows: [
      { keys: ['Ctrl', 'K'], what: 'Find any scene, note, or SRD monster/spell (fuzzy)' },
      { keys: ['Ctrl', 'J'], what: 'Quick capture — one line straight into the session log' },
      { keys: ['Esc'], what: 'Panic: fade ALL sound out (in a text field: just leave the field)' },
      { keys: ['?'], what: 'This cheat-sheet' }
    ]
  },
  {
    title: 'Teleprompter (read-aloud)',
    rows: [
      { keys: ['Space'], what: 'Fire the next cue (the ember ring marks it)' },
      { keys: ['Shift', 'Space'], what: 'Skip past the next cue without firing it' },
      { keys: ['→', '/', '←'], what: 'Skip forward / rewind the cue pointer' },
      { keys: ['1–9'], what: 'Fire a scene SFX by its hotkey (run mode)' }
    ]
  },
  {
    title: 'Notes & links',
    rows: [
      { keys: ['click'], what: 'Follow a [[link]] (reading views) — hover ~½s to peek without leaving' },
      { keys: ['Alt', '←/→'], what: 'Back / forward through notes you visited (mouse side-buttons too)' },
      { keys: ['Ctrl', 'click'], what: 'Follow a link while EDITING a note or script' },
      { keys: ['[['], what: 'In an editor: link autocomplete (unmatched name = create the note)' }
    ]
  },
  {
    title: 'Scenes & mixing',
    rows: [
      { keys: ['dbl-click'], what: 'A scene row: arm it AND go live (single click arms silently)' },
      { keys: ['dbl-click'], what: 'Any volume fader: reset it to its default' },
      { keys: ['Ctrl', 'Z'], what: 'Undo in the script/note editors' }
    ]
  },
  {
    title: 'One-stop shop (TopBar buttons)',
    rows: [
      { keys: ['📖'], what: 'Rules — the full 2024 SRD: monsters, spells, classes, conditions (offline)' },
      { keys: ['🛡'], what: 'Party — character sheets + the AC/HP/passives dashboard' },
      { keys: ['⚔'], what: 'Right panel tab — encounter tracker (SRD search, initiative, XP budget)' },
      { keys: ['🗺'], what: 'Hover a scene image — fog-of-war map; 📤 sends reveals to the presenter' }
    ]
  }
]

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-hearth-border bg-hearth-bg px-1.5 py-0.5 font-mono text-[11px] text-hearth-text">
      {children}
    </kbd>
  )
}

/** The `?` cheat-sheet: every shortcut in one place — the discoverability net. */
export default function ShortcutsHelp() {
  const open = useStore((s) => s.helpOpen)
  const setOpen = useStore((s) => s.setHelpOpen)
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[10vh]"
      onMouseDown={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <div
        className="max-h-[75vh] w-[38rem] max-w-[92vw] overflow-y-auto rounded-lg border border-hearth-border bg-hearth-panel p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-hearth-text">⌨ Shortcuts</h2>
          <button onClick={() => setOpen(false)} className="text-hearth-muted hover:text-hearth-ember">
            ✕
          </button>
        </div>
        <div className="space-y-4">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
                {s.title}
              </div>
              <div className="space-y-1">
                {s.rows.map((r, i) => (
                  <div key={i} className="flex items-baseline gap-3 text-sm">
                    <span className="flex w-32 flex-none flex-wrap items-center gap-1">
                      {r.keys.map((k, j) => (
                        <Kbd key={j}>{k}</Kbd>
                      ))}
                    </span>
                    <span className="text-hearth-muted">{r.what}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-hearth-border pt-2 text-[11px] text-hearth-muted/70">
          Esc or click away to close · press <Kbd>?</Kbd> anytime
        </p>
      </div>
    </div>
  )
}
