import { useEffect, useRef, useState } from 'react'
import type { Character } from '../../shared/types'
import { loadKind, type ClassEntry, type NamedEntry } from '../lib/compendium'
import CharacterSheet from './CharacterSheet'
import { EntryArticle, SpellCard } from './StatBlock'
import type { Spell } from '../lib/compendium'
import { loadSpells } from '../lib/compendium'

// ONESTOP-PLAN C5 — the player-facing portal page (plain browser, no
// Electron). Talks to Hearth over HTTP: GET the roster, POST character saves,
// SSE to hear about changes from the DM/other players. Same CharacterSheet
// component the DM uses — one sheet, two doors.

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
  return r.json()
}

export default function PlayerApp() {
  const [characters, setCharacters] = useState<Character[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(localStorage.getItem('hearth:myCharacter'))
  const [classes, setClasses] = useState<ClassEntry[]>([])
  const [species, setSpecies] = useState<NamedEntry[]>([])
  const [backgrounds, setBackgrounds] = useState<NamedEntry[]>([])
  const [spellCard, setSpellCard] = useState<Spell | null>(null)
  const [speciesCard, setSpeciesCard] = useState<NamedEntry | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Don't let an SSE refetch clobber the keystrokes you just typed.
  const lastEdit = useRef(0)

  const refetch = () =>
    api<Character[]>('/api/characters')
      .then((cs) => {
        if (Date.now() - lastEdit.current > 3000) setCharacters(cs)
      })
      .catch((e) => setError((e as Error).message))

  useEffect(() => {
    void api<Character[]>('/api/characters').then(setCharacters).catch((e) => setError((e as Error).message))
    loadKind('class').then((r) => setClasses(r as unknown as ClassEntry[]))
    loadKind('species').then(setSpecies)
    loadKind('background').then(setBackgrounds)
    const es = new EventSource('/api/events')
    es.onmessage = () => void refetch()
    return () => es.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selected = characters?.find((c) => c.id === selectedId) ?? null

  const patch = (p: Partial<Character>) => {
    if (!selected) return
    lastEdit.current = Date.now()
    const updated = { ...selected, ...p }
    setCharacters((cs) => (cs ?? []).map((c) => (c.id === selected.id ? updated : c)))
    void fetch(`/api/character/${selected.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    }).catch((e) => setError((e as Error).message))
  }

  return (
    <div className="hearth-ambient min-h-screen text-hearth-text">
      <header className="flex items-center gap-2 border-b border-hearth-border bg-hearth-panel px-4 py-2.5">
        <span className="flex items-center gap-1.5 font-display text-lg font-semibold text-hearth-ember">
          <span className="drop-shadow-[0_0_8px_rgba(224,138,60,0.6)]">🔥</span> Hearth
        </span>
        <span className="text-xs text-hearth-muted">— your character, live at the table</span>
        {selected && (
          <button
            onClick={() => {
              setSelectedId(null)
              localStorage.removeItem('hearth:myCharacter')
            }}
            className="ml-auto rounded border border-hearth-border bg-hearth-panel2 px-2 py-1 text-xs text-hearth-muted hover:text-hearth-text"
          >
            ⇄ switch character
          </button>
        )}
      </header>

      <main className="mx-auto max-w-3xl p-4">
        {error && (
          <p className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error} — is the DM's Hearth running with the portal on?
          </p>
        )}

        {!characters ? (
          <p className="text-sm text-hearth-muted">Reaching the hearth…</p>
        ) : !selected ? (
          <>
            <h2 className="mb-3 font-display text-xl font-semibold text-hearth-text">Who are you?</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {characters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedId(c.id)
                    localStorage.setItem('hearth:myCharacter', c.id)
                  }}
                  className="rounded-md border border-hearth-border bg-hearth-panel px-3 py-2 text-left transition-colors hover:border-hearth-ember"
                >
                  <div className="text-base font-semibold text-hearth-text">{c.name}</div>
                  <div className="text-xs text-hearth-muted">
                    {c.player ? `${c.player} · ` : ''}level {c.level} · {c.hp}/{c.maxHp} HP
                  </div>
                </button>
              ))}
              {characters.length === 0 && (
                <p className="text-sm text-hearth-muted">
                  No characters yet — ask the DM to add you in 🛡 Party (or wait, they might be typing).
                </p>
              )}
            </div>
          </>
        ) : (
          <CharacterSheet
            key={selected.id}
            c={selected}
            classes={classes}
            species={species}
            backgrounds={backgrounds}
            cb={{
              onPatch: patch,
              onOpenSpell: (key) => void loadSpells().then((all) => setSpellCard(all.find((s) => s.key === key) ?? null)),
              onOpenSpecies: (key) => setSpeciesCard(species.find((s) => s.key === key) ?? null)
            }}
          />
        )}
      </main>

      {(spellCard || speciesCard) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            setSpellCard(null)
            setSpeciesCard(null)
          }}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg border border-hearth-border bg-hearth-panel p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {spellCard && <SpellCard s={spellCard} />}
            {speciesCard && <EntryArticle e={speciesCard} />}
            <button
              onClick={() => {
                setSpellCard(null)
                setSpeciesCard(null)
              }}
              className="mt-3 w-full rounded border border-hearth-border bg-hearth-panel2 py-1 text-xs text-hearth-muted hover:text-hearth-text"
            >
              close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
