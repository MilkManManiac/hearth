import { useEffect, useRef, useState } from 'react'
import type { CampaignMap, Character, PartyStash, RollEvent, TokenDecor } from '../../shared/types'
import { loadKind, type ClassEntry, type NamedEntry } from '../lib/compendium'
import { portalKey } from '../lib/asset'
import CharacterSheet from './CharacterSheet'
import StashBox from './StashBox'
import { RollFeed } from './GameLog'
import { PresenterMap, usePings } from './MapEditor'
import { EntryArticle, SpellCard } from './StatBlock'
import type { Spell } from '../lib/compendium'
import { loadSpells } from '../lib/compendium'

// ONESTOP-PLAN C5 — the player-facing portal page (plain browser, no
// Electron). Talks to Hearth over HTTP: GET the roster, POST character saves,
// SSE to hear about changes from the DM/other players. Same CharacterSheet
// component the DM uses — one sheet, two doors.
//
// AUTH (P0): every request carries the campaign key from the DM's link
// (?key=..., remembered in localStorage); mutations of a character also carry
// its CLAIM token — minted by the server the first time this browser picks
// that character. See playerServer.ts for the server side.

/** This browser's claim tokens, characterId → token. */
function claimsMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem('hearth:claims') ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function saveClaimToken(id: string, token: string): void {
  const m = claimsMap()
  m[id] = token
  localStorage.setItem('hearth:claims', JSON.stringify(m))
}

/** Headers for portal requests: key always, claim when mutating a character. */
function authHeaders(characterId?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'x-hearth-key': portalKey() }
  const t = characterId ? claimsMap()[characterId] : undefined
  if (t) h['x-hearth-claim'] = t
  return h
}

class ApiError extends Error {
  constructor(msg: string, public status: number) {
    super(msg)
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } })
  if (!r.ok) throw new ApiError(`${url}: HTTP ${r.status}`, r.status)
  return r.json()
}

/** "Build a new character" (D2): create by name, then the sheet's owed-choices chips guide the build. */
function NewCharacterRow({ onCreated, onError }: { onCreated: (id: string) => void; onError: (e: string) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async () => {
    const clean = name.trim()
    if (!clean || busy) return
    setBusy(true)
    try {
      const r = await api<{ characterId: string; token?: string }>('/api/character-create', {
        method: 'POST',
        body: JSON.stringify({ name: clean })
      })
      // The server minted our claim with the character — this browser owns it.
      if (r.token) saveClaimToken(r.characterId, r.token)
      onCreated(r.characterId)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-4 flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void create()}
        placeholder="New character name…"
        className="min-w-0 flex-1 rounded border border-hearth-border bg-hearth-bg px-2 py-1.5 text-sm text-hearth-text placeholder:text-hearth-muted/40 focus:border-hearth-ember focus:outline-none"
      />
      <button
        onClick={() => void create()}
        disabled={!name.trim() || busy}
        className="rounded border border-hearth-ember bg-hearth-ember/15 px-3 py-1.5 text-sm text-hearth-ember hover:bg-hearth-ember/30 disabled:opacity-40"
        title="Creates the character — then the ⚠ chips on the sheet walk you through class, species, scores, skills, and spells"
      >
        ＋ Build
      </button>
    </div>
  )
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
  // Ember Table view (M2): live-follows the DM's live map. HP rings /
  // conditions / initiative arrive PRE-COMPUTED from the server (P0: the raw
  // encounter never reaches this browser).
  const [view, setView] = useState<'sheet' | 'table'>('sheet')
  const [liveMap, setLiveMap] = useState<CampaignMap | null>(null)
  const [tableView, setTableView] = useState<{
    decor: Record<string, TokenDecor>
    initiative?: { names: string[]; turn: number }
  }>({ decor: {} })
  // 401 = the link is missing its ?key= — ask for the door code.
  const [needKey, setNeedKey] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  // Ember E2: drag-your-token is the default; 📍/📏 are explicit modes so a
  // stray phone tap never pings the whole table by accident.
  const [tableMode, setTableMode] = useState<'move' | 'ping' | 'ruler'>('move')
  const [pings, addPing] = usePings()
  // Pings we sent — the server echoes them back over SSE; don't double-pulse.
  const myPingIds = useRef<Set<string>>(new Set())
  const [rolls, setRolls] = useState<RollEvent[]>([])
  const [logOpen, setLogOpen] = useState(false)
  const [unseen, setUnseen] = useState(0)
  // Party stash (M4): shared items + coins, live via the same SSE refetch.
  const [party, setParty] = useState<PartyStash | null>(null)
  const [stashOpen, setStashOpen] = useState(false)
  // Don't let an SSE refetch clobber the keystrokes you just typed.
  const lastEdit = useRef(0)
  const logOpenRef = useRef(false)
  logOpenRef.current = logOpen

  const addRoll = (r: RollEvent) => {
    setRolls((rs) => (rs.some((x) => x.id === r.id) ? rs : [...rs.slice(-299), r]))
    if (!logOpenRef.current) setUnseen((n) => n + 1)
  }

  const sendRoll = (roll: RollEvent) => {
    addRoll(roll)
    void fetch('/api/roll', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(roll)
    }).catch(() => undefined)
  }

  const fetchTable = () =>
    api<{ map: CampaignMap | null; decor?: Record<string, TokenDecor>; initiative?: { names: string[]; turn: number } }>(
      '/api/table'
    )
      .then((t) => {
        setLiveMap(t.map)
        setTableView({ decor: t.decor ?? {}, initiative: t.initiative })
      })
      .catch(() => undefined)

  const refetch = () => {
    void fetchTable()
    void api<PartyStash>('/api/party').then(setParty).catch(() => undefined)
    return api<Character[]>('/api/characters')
      .then((cs) => {
        if (Date.now() - lastEdit.current > 3000) setCharacters(cs)
      })
      .catch((e) => setError((e as Error).message))
  }

  useEffect(() => {
    void api<Character[]>('/api/characters')
      .then(setCharacters)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) setNeedKey(true)
        else setError((e as Error).message)
      })
    void fetchTable()
    void api<PartyStash>('/api/party').then(setParty).catch(() => undefined)
    loadKind('class').then((r) => setClasses(r as unknown as ClassEntry[]))
    loadKind('species').then(setSpecies)
    loadKind('background').then(setBackgrounds)
    void api<RollEvent[]>('/api/rolls').then(setRolls).catch(() => undefined)
    // EventSource can't set headers — the key rides the query string.
    const es = new EventSource(`/api/events?key=${portalKey()}`)
    es.onmessage = () => void refetch()
    es.addEventListener('roll', (e) => {
      try {
        addRoll(JSON.parse((e as MessageEvent).data) as RollEvent)
      } catch {
        /* malformed roll event — ignore */
      }
    })
    // Ember E2: pings from the DM and other players pulse on the table view.
    es.addEventListener('ping', (e) => {
      try {
        const p = JSON.parse((e as MessageEvent).data) as { id: string; x: number; y: number; color?: string; label?: string }
        if (!myPingIds.current.has(p.id)) addPing(p)
      } catch {
        /* malformed ping event — ignore */
      }
    })
    return () => es.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selected = characters?.find((c) => c.id === selectedId) ?? null

  // Picking a character CLAIMS it: the server hands this browser the token
  // (or refuses if another device got there first).
  const pickCharacter = async (id: string) => {
    try {
      const r = await api<{ token?: string }>('/api/claim', {
        method: 'POST',
        body: JSON.stringify({ characterId: id, token: claimsMap()[id] })
      })
      if (r.token) saveClaimToken(id, r.token)
      setSelectedId(id)
      localStorage.setItem('hearth:myCharacter', id)
      setError(null)
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 403
          ? 'That character is claimed on another device — ask the DM to hit ⟲ claims.'
          : (e as Error).message
      )
    }
  }

  const patch = (p: Partial<Character>) => {
    if (!selected) return
    lastEdit.current = Date.now()
    const updated = { ...selected, ...p }
    setCharacters((cs) => (cs ?? []).map((c) => (c.id === selected.id ? updated : c)))
    void fetch(`/api/character/${selected.id}`, {
      method: 'POST',
      headers: authHeaders(selected.id),
      body: JSON.stringify(updated)
    })
      .then((r) => {
        if (r.status === 403) setError('This character is claimed on another device — ask the DM to hit ⟲ claims.')
      })
      .catch((e) => setError((e as Error).message))
  }

  // Ember E2 (M5): my token on the live map — the only one I may drag.
  const myToken = liveMap?.tokens?.find((t) => !t.hidden && t.characterId && t.characterId === selectedId)

  const moveMyToken = (tokenId: string, x: number, y: number) => {
    if (!selectedId) return
    // Optimistic: the drop sticks immediately; a refused move refetches truth.
    setLiveMap((m) => (m ? { ...m, tokens: (m.tokens ?? []).map((t) => (t.id === tokenId ? { ...t, x, y } : t)) } : m))
    void fetch('/api/table/move-token', {
      method: 'POST',
      headers: authHeaders(selectedId),
      body: JSON.stringify({ tokenId, characterId: selectedId, x, y })
    })
      .then((r) => {
        if (!r.ok) void refetch()
      })
      .catch(() => void refetch())
  }

  const sendPing = (x: number, y: number) => {
    // No crypto.randomUUID — http:// on LAN is an insecure context.
    const id = `${Date.now()}-${Math.random()}`
    myPingIds.current.add(id)
    setTimeout(() => myPingIds.current.delete(id), 10_000)
    const ping = { id, x, y, color: myToken?.color, label: selected?.name, mapId: liveMap?.id }
    addPing(ping)
    void fetch('/api/table/ping', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(ping)
    }).catch(() => undefined)
  }

  return (
    <div className="hearth-ambient min-h-screen text-hearth-text">
      <header className="flex items-center gap-2 border-b border-hearth-border bg-hearth-panel px-4 py-2.5">
        <span className="flex items-center gap-1.5 font-display text-lg font-semibold text-hearth-ember">
          <span className="drop-shadow-[0_0_8px_rgba(224,138,60,0.6)]">🔥</span> Hearth
        </span>
        <span className="text-xs text-hearth-muted">— your character, live at the table</span>
        <button
          onClick={() => setView('table')}
          title={liveMap ? `The table is live: ${liveMap.name}` : 'The table is dark — the DM has no map live'}
          className="ml-auto flex items-center gap-1.5 rounded border border-hearth-border bg-hearth-panel2 px-2 py-1 text-xs text-hearth-muted hover:border-hearth-ember hover:text-hearth-ember"
        >
          {liveMap && <span className="inline-block h-1.5 w-1.5 animate-flicker rounded-full bg-red-400" />}
          🗺 Table
        </button>
        {selected && (
          <button
            onClick={() => {
              setSelectedId(null)
              localStorage.removeItem('hearth:myCharacter')
            }}
            className="rounded border border-hearth-border bg-hearth-panel2 px-2 py-1 text-xs text-hearth-muted hover:text-hearth-text"
          >
            ⇄ switch
          </button>
        )}
      </header>

      {/* 🗺 The Table (M2): live-follows the DM's live map — fog zones clear
          in real time, initiative on top, PC HP rings. Full-bleed for phones. */}
      {view === 'table' && (
        <div className="fixed inset-0 z-30 bg-black">
          {liveMap && liveMap.image ? (
            <PresenterMap
              file={liveMap.image}
              strokes={liveMap.strokes}
              zones={liveMap.zones}
              tokens={liveMap.tokens}
              grid={liveMap.grid}
              overlays={liveMap.overlays}
              decor={tableView.decor}
              initiative={tableView.initiative}
              pings={pings}
              interact={{
                myCharacterId: selectedId,
                mode: tableMode,
                onMoveToken: moveMyToken,
                onPing: sendPing
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-white/30">
              The table is dark — waiting for the DM to go live…
            </div>
          )}
          <button
            onClick={() => setView('sheet')}
            className="absolute bottom-4 left-4 z-40 rounded-full border border-white/20 bg-black/70 px-3 py-2 text-sm text-white/80 hover:border-hearth-ember"
          >
            ← my sheet
          </button>
          {/* E2 tool pills: drag-my-token / ping / measure. */}
          {liveMap && liveMap.image && (
            <div className="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 overflow-hidden rounded-full border border-white/20 bg-black/70">
              {(
                [
                  {
                    m: 'move' as const,
                    icon: '🖐',
                    title: myToken
                      ? 'Move — drag your own token (gold halo). Only yours.'
                      : 'Move — your character has no token on this map yet (ask the DM)'
                  },
                  { m: 'ping' as const, icon: '📍', title: 'Ping — tap the map; everyone sees a pulse with your name' },
                  { m: 'ruler' as const, icon: '📏', title: 'Measure — drag to read the distance in feet' }
                ] as const
              ).map(({ m, icon, title }) => (
                <button
                  key={m}
                  onClick={() => setTableMode(m)}
                  title={title}
                  className={`px-3.5 py-2 text-sm transition-colors ${
                    tableMode === m ? 'bg-hearth-ember/80 text-black' : 'text-white/70 hover:text-white'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <main className="mx-auto max-w-3xl p-4">
        {error && (
          <p className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error} — is the DM's Hearth running with the portal on?
          </p>
        )}

        {needKey ? (
          <div className="mx-auto mt-12 max-w-sm text-center">
            <div className="mb-3 text-4xl">🗝</div>
            <h2 className="mb-1 font-display text-xl font-semibold text-hearth-text">This hearth has a door code</h2>
            <p className="mb-4 text-sm text-hearth-muted">
              Open the FULL link the DM sent (it ends in <code>?key=…</code>), or paste the code here.
            </p>
            <div className="flex gap-2">
              <input
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && keyInput.trim()) window.location.href = `/?key=${keyInput.trim()}`
                }}
                placeholder="door code"
                className="min-w-0 flex-1 rounded border border-hearth-border bg-hearth-bg px-2 py-1.5 text-center font-mono text-sm text-hearth-text focus:border-hearth-ember focus:outline-none"
              />
              <button
                onClick={() => keyInput.trim() && (window.location.href = `/?key=${keyInput.trim()}`)}
                disabled={!keyInput.trim()}
                className="rounded border border-hearth-ember bg-hearth-ember/15 px-3 py-1.5 text-sm text-hearth-ember hover:bg-hearth-ember/30 disabled:opacity-40"
              >
                Enter
              </button>
            </div>
          </div>
        ) : !characters ? (
          <p className="text-sm text-hearth-muted">Reaching the hearth…</p>
        ) : !selected ? (
          <>
            <h2 className="mb-3 font-display text-xl font-semibold text-hearth-text">Who are you?</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {characters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => void pickCharacter(c.id)}
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
                  No characters yet — build one below, or ask the DM.
                </p>
              )}
            </div>
            <NewCharacterRow
              onCreated={(id) => {
                setSelectedId(id)
                localStorage.setItem('hearth:myCharacter', id)
                void refetch()
              }}
              onError={setError}
            />
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
              onOpenSpecies: (key) => setSpeciesCard(species.find((s) => s.key === key) ?? null),
              onRoll: sendRoll,
              onStashItem: (itemId) =>
                void fetch('/api/party/transfer-item', {
                  method: 'POST',
                  headers: authHeaders(selected.id),
                  body: JSON.stringify({ itemId, from: selected.id, to: 'stash', who: selected.name })
                }).then(() => refetch())
            }}
          />
        )}
      </main>

      {/* Game Log + Party stash drawers, phone-friendly. */}
      {selected && (
        <>
          <button
            onClick={() => {
              setStashOpen((v) => !v)
              setLogOpen(false)
            }}
            className="fixed bottom-4 right-16 z-40 flex items-center gap-1 rounded-full border border-hearth-border bg-hearth-panel px-3 py-2 text-sm shadow-2xl hover:border-hearth-gold"
            title="Party stash — shared loot and coins; taking is logged for the table"
          >
            🎒
            {(party?.items.length ?? 0) > 0 && (
              <span className="rounded-full bg-hearth-gold px-1.5 text-[10px] font-bold text-black">{party!.items.length}</span>
            )}
          </button>
          {stashOpen && party && (
            <div className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-h-[60vh] max-w-3xl flex-col gap-2 overflow-y-auto rounded-t-lg border border-hearth-border bg-hearth-panel p-3 shadow-2xl">
              <div className="flex items-center">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
                  🎒 Party stash — takes go to {selected.name}
                </span>
                <button onClick={() => setStashOpen(false)} className="ml-auto px-1 text-xs text-hearth-muted hover:text-hearth-text">
                  ✕
                </button>
              </div>
              <StashBox
                stash={party}
                takeToName={selected.name}
                actions={{
                  onTake: (item, qty) =>
                    void fetch('/api/party/transfer-item', {
                      method: 'POST',
                      headers: authHeaders(selected.id),
                      body: JSON.stringify({ itemId: item.id, from: 'stash', to: selected.id, qty, who: selected.name })
                    }).then(() => refetch()),
                  onCoins: (direction, coin, amount) =>
                    void fetch('/api/party/transfer-coins', {
                      method: 'POST',
                      headers: authHeaders(selected.id),
                      body: JSON.stringify({
                        from: direction === 'take' ? 'stash' : selected.id,
                        to: direction === 'take' ? selected.id : 'stash',
                        coin,
                        amount,
                        who: selected.name
                      })
                    }).then(() => refetch())
                }}
              />
            </div>
          )}
          <button
            onClick={() => {
              setLogOpen((v) => !v)
              setStashOpen(false)
              setUnseen(0)
            }}
            className="fixed bottom-4 right-4 z-40 flex items-center gap-1 rounded-full border border-hearth-border bg-hearth-panel px-3 py-2 text-sm shadow-2xl hover:border-hearth-ember"
            title="Game Log — the whole table's rolls"
          >
            🎲
            {unseen > 0 && (
              <span className="rounded-full bg-hearth-ember px-1.5 text-[10px] font-bold text-black">{unseen}</span>
            )}
          </button>
          {logOpen && (
            <div className="fixed inset-x-0 bottom-0 z-30 mx-auto flex h-[45vh] max-w-3xl flex-col gap-2 rounded-t-lg border border-hearth-border bg-hearth-panel p-3 shadow-2xl">
              <div className="flex items-center">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">Game Log</span>
                <button onClick={() => setLogOpen(false)} className="ml-auto px-1 text-xs text-hearth-muted hover:text-hearth-text">
                  ✕
                </button>
              </div>
              <RollFeed rolls={rolls} />
            </div>
          )}
        </>
      )}

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
