import { useEffect, useState } from 'react'
import type { Character } from '../../shared/types'
import { passive } from '../lib/character'
import { loadKind, type ClassEntry, type NamedEntry } from '../lib/compendium'
import { submitRoll, wireRollFeed } from '../lib/rollStore'
import { useStore } from '../store'
import CharacterSheet from './CharacterSheet'
import DangerButton from './DangerButton'

// ONESTOP-PLAN C4 — the DM-side character home: dashboard strip + sheets.
// The sheet itself lives in CharacterSheet.tsx, shared with the browser-based
// player portal (C5) — here it saves over Electron IPC.

export default function PartyPanel() {
  const open = useStore((s) => s.partyOpen)
  const setOpen = useStore((s) => s.setPartyOpen)
  const characters = useStore((s) => s.campaign.characters)
  const createCharacter = useStore((s) => s.createCharacter)
  const updateCharacter = useStore((s) => s.updateCharacter)
  const deleteCharacter = useStore((s) => s.deleteCharacter)
  const openCompendium = useStore((s) => s.openCompendium)
  const portal = useStore((s) => s.portalStatus)
  const togglePortal = useStore((s) => s.togglePortal)
  const pushToast = useStore((s) => s.pushToast)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [classes, setClasses] = useState<ClassEntry[]>([])
  const [species, setSpecies] = useState<NamedEntry[]>([])
  const [backgrounds, setBackgrounds] = useState<NamedEntry[]>([])

  useEffect(() => {
    if (!open) return
    wireRollFeed()
    loadKind('class').then((r) => setClasses(r as unknown as ClassEntry[]))
    loadKind('species').then(setSpecies)
    loadKind('background').then(setBackgrounds)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  const selected = characters.find((c) => c.id === selectedId) ?? characters[0] ?? null

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
      <div
        className="flex h-full max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-hearth-border bg-hearth-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-hearth-border px-4 py-2.5">
          <h2 className="font-display text-lg font-semibold text-hearth-text">🛡 The Party</h2>
          <span className="text-xs text-hearth-muted">2024 rules · SRD 5.2.1 · local files</span>
          <button
            onClick={() => {
              void togglePortal()
            }}
            title={
              portal?.running
                ? `Players connect at ${portal.url} — click to stop the portal`
                : 'Start the player portal: a local web page where each player opens THEIR character in a browser (LAN; tunnel for remote players)'
            }
            className={`ml-auto flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs transition-colors ${
              portal?.running
                ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                : 'border-hearth-border bg-hearth-panel2 text-hearth-muted hover:border-hearth-ember hover:text-hearth-ember'
            }`}
          >
            {portal?.running && <span className="inline-block h-1.5 w-1.5 animate-flicker rounded-full bg-emerald-400" />}
            🌐 Player portal {portal?.running ? 'ON' : 'OFF'}
          </button>
          {portal?.running && (
            <button
              onClick={() => {
                void navigator.clipboard.writeText(portal.url)
                pushToast(`Copied ${portal.url} — send it to your players`, 'info')
              }}
              className="rounded border border-hearth-border bg-hearth-panel2 px-2 py-1 text-xs text-hearth-text hover:border-hearth-ember"
              title="Copy the player link"
            >
              {portal.url} ⧉
            </button>
          )}
          <button onClick={() => setOpen(false)} className="rounded px-2 py-1 text-hearth-muted hover:text-hearth-text" title="Close (Esc)">
            ✕
          </button>
        </div>

        {/* Dashboard strip: the at-a-glance grid DDB never shipped. */}
        {characters.length > 0 && (
          <div className="flex gap-2 overflow-x-auto border-b border-hearth-border bg-hearth-panel2/40 px-4 py-2">
            {characters.map((c) => (
              <DashboardCard key={c.id} c={c} active={selected?.id === c.id} onClick={() => setSelectedId(c.id)} />
            ))}
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {/* Roster */}
          <div className="flex w-48 flex-none flex-col border-r border-hearth-border">
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {characters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`flex w-full flex-col px-3 py-1.5 text-left text-sm transition-colors ${
                    selected?.id === c.id ? 'bg-hearth-ember/15 text-hearth-text' : 'text-hearth-muted hover:text-hearth-text'
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="text-[10px] text-hearth-muted/70">
                    {c.player ? `${c.player} · ` : ''}lvl {c.level}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                const name = window.prompt('Character name?')
                if (name?.trim()) void createCharacter(name.trim()).then((id) => id && setSelectedId(id))
              }}
              className="border-t border-hearth-border px-3 py-2 text-left text-xs text-hearth-muted hover:text-hearth-ember"
            >
              + New character
            </button>
          </div>

          {/* Sheet */}
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            {selected ? (
              <CharacterSheet
                key={selected.id}
                c={selected}
                classes={classes}
                species={species}
                backgrounds={backgrounds}
                cb={{
                  onPatch: (p) => void updateCharacter(selected.id, (x) => ({ ...x, ...p })),
                  onOpenSpell: (key) => openCompendium({ kind: 'spell', key }),
                  onOpenSpecies: (key) => openCompendium({ kind: 'species', key }),
                  onRoll: submitRoll
                }}
                headerExtra={
                  <DangerButton
                    onConfirm={() => void deleteCharacter(selected.id)}
                    className="rounded border border-transparent px-1 text-xs text-hearth-muted/60 hover:text-red-400"
                    title="Delete character (file → recycle bin)"
                    armedLabel="🗑 Sure?"
                  >
                    🗑
                  </DangerButton>
                }
              />
            ) : (
              <p className="text-sm text-hearth-muted">
                No characters yet — hit <span className="text-hearth-ember">+ New character</span> and build your party.
                Characters are JSON files in the campaign's characters/ folder (Claude can author them too).
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** The DDB-gap fix: name, AC, HP bar, passives, conditions — one glance. */
function DashboardCard({ c, active, onClick }: { c: Character; active: boolean; onClick: () => void }) {
  const pct = c.maxHp > 0 ? Math.max(0, Math.min(1, c.hp / c.maxHp)) : 0
  return (
    <button
      onClick={onClick}
      className={`w-44 flex-none rounded-md border px-2 py-1.5 text-left transition-colors ${
        active ? 'border-hearth-ember bg-hearth-ember/10' : 'border-hearth-border bg-hearth-panel hover:border-hearth-ember/50'
      }`}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-hearth-text">{c.name}</span>
        <span className="flex-none text-[10px] text-hearth-muted">AC {c.ac}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40">
        <div
          className={`h-full ${pct <= 0.25 ? 'bg-red-500' : pct <= 0.5 ? 'bg-hearth-gold' : 'bg-emerald-500'}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-hearth-muted">
        <span>
          {c.hp}/{c.maxHp}
          {c.tempHp ? ` +${c.tempHp}` : ''}
        </span>
        <span title="Passive Perception / Insight / Investigation">
          👁{passive(c, 'perception')} · 💡{passive(c, 'insight')} · 🔍{passive(c, 'investigation')}
        </span>
      </div>
      {(c.conditions?.length ?? 0) > 0 && (
        <div className="mt-0.5 truncate text-[10px] text-purple-300">{c.conditions!.join(', ')}</div>
      )}
    </button>
  )
}
