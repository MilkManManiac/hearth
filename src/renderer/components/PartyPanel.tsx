import { useEffect, useMemo, useState } from 'react'
import type { Character } from '../../shared/types'
import {
  ABILITY_KEYS,
  ABILITY_LABEL,
  fmtMod,
  mod,
  passive,
  profBonus,
  saveBonus,
  skillBonus,
  SKILL_ABILITY,
  spellSlots,
  suggestedMaxHp,
  type AbilityKey
} from '../lib/character'
import { loadKind, loadSpells, SPELL_LEVEL_LABEL, type ClassEntry, type NamedEntry, type Spell } from '../lib/compendium'
import { fuzzyScore } from '../lib/fuzzy'
import { useStore } from '../store'
import DangerButton from './DangerButton'

// ONESTOP-PLAN C4 — the character home: native 2024-rules sheets (choices
// stored, stats derived) + the at-a-glance party dashboard DDB never built.

const CASTING_ABILITY: Record<string, AbilityKey> = {
  bard: 'cha', cleric: 'wis', druid: 'wis', paladin: 'cha',
  ranger: 'wis', sorcerer: 'cha', warlock: 'cha', wizard: 'int'
}

export default function PartyPanel() {
  const open = useStore((s) => s.partyOpen)
  const setOpen = useStore((s) => s.setPartyOpen)
  const characters = useStore((s) => s.campaign.characters)
  const createCharacter = useStore((s) => s.createCharacter)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [classes, setClasses] = useState<ClassEntry[]>([])
  const [species, setSpecies] = useState<NamedEntry[]>([])
  const [backgrounds, setBackgrounds] = useState<NamedEntry[]>([])

  useEffect(() => {
    if (!open) return
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
        <div className="flex items-center gap-3 border-b border-hearth-border px-4 py-2.5">
          <h2 className="font-display text-lg font-semibold text-hearth-text">🛡 The Party</h2>
          <span className="text-xs text-hearth-muted">2024 rules · SRD 5.2.1 · local files, no subscription</span>
          <button onClick={() => setOpen(false)} className="ml-auto rounded px-2 py-1 text-hearth-muted hover:text-hearth-text" title="Close (Esc)">
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
              <Sheet key={selected.id} c={selected} classes={classes} species={species} backgrounds={backgrounds} />
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

function Sheet({
  c,
  classes,
  species,
  backgrounds
}: {
  c: Character
  classes: ClassEntry[]
  species: NamedEntry[]
  backgrounds: NamedEntry[]
}) {
  const updateCharacter = useStore((s) => s.updateCharacter)
  const deleteCharacter = useStore((s) => s.deleteCharacter)
  const openCompendium = useStore((s) => s.openCompendium)
  const patch = (p: Partial<Character>) => void updateCharacter(c.id, (x) => ({ ...x, ...p }))

  const cls = classes.find((x) => x.key === c.classKey)
  const subclasses = classes.filter((x) => x.subclassOf === c.classKey)
  const sub = classes.find((x) => x.key === c.subclassKey)
  const pb = profBonus(c.level)
  const slots = spellSlots(c, cls)
  const castAbility = c.classKey ? CASTING_ABILITY[c.classKey] : undefined
  const spellDc = castAbility ? 8 + pb + mod(c.abilities[castAbility]) : null
  const spellAtk = castAbility ? pb + mod(c.abilities[castAbility]) : null
  const hpSuggest = suggestedMaxHp(c, cls?.hitDice)
  const features = [...(cls?.features ?? []), ...(sub?.features ?? [])]
    .filter((f) => f.levels.length === 0 || f.levels.some((l) => l <= c.level))
    .sort((a, b) => Math.min(...(a.levels.length ? a.levels : [0])) - Math.min(...(b.levels.length ? b.levels : [0])))

  const [dmg, setDmg] = useState('')
  const applyHp = (sign: 1 | -1) => {
    const n = parseInt(dmg, 10)
    if (!Number.isFinite(n) || n <= 0) return
    setDmg('')
    if (sign === -1 && (c.tempHp ?? 0) > 0) {
      // Temp HP absorbs first (2024 rules).
      const fromTemp = Math.min(c.tempHp ?? 0, n)
      const rest = n - fromTemp
      patch({ tempHp: (c.tempHp ?? 0) - fromTemp, hp: Math.max(0, c.hp - rest) })
      return
    }
    patch({ hp: Math.min(c.maxHp, Math.max(0, c.hp + sign * n)) })
  }

  const longRest = () =>
    patch({
      hp: c.maxHp,
      tempHp: 0,
      slotsUsed: {},
      deathSaves: { success: 0, fail: 0 },
      hitDiceSpent: Math.max(0, (c.hitDiceSpent ?? 0) - Math.max(1, Math.floor(c.level / 2)))
    })

  return (
    <div className="space-y-4 text-sm">
      {/* Identity row */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={c.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="min-w-0 flex-1 rounded bg-transparent font-display text-2xl font-semibold text-hearth-text focus:outline-none focus:ring-1 focus:ring-hearth-ember/50"
        />
        <input
          value={c.player ?? ''}
          onChange={(e) => patch({ player: e.target.value || undefined })}
          placeholder="player"
          className="w-24 rounded border border-hearth-border bg-hearth-bg px-2 py-1 text-xs text-hearth-muted placeholder:text-hearth-muted/40"
        />
        <DangerButton
          onConfirm={() => void deleteCharacter(c.id)}
          className="rounded border border-transparent px-1 text-xs text-hearth-muted/60 hover:text-red-400"
          title="Delete character (file → recycle bin)"
          armedLabel="🗑 Sure?"
        >
          🗑
        </DangerButton>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select value={c.classKey ?? ''} onChange={(e) => patch({ classKey: e.target.value || undefined, subclassKey: undefined })} className="rounded border border-hearth-border bg-hearth-panel2 px-1.5 py-1 text-hearth-text">
          <option value="">— class —</option>
          {classes.filter((x) => !x.subclassOf).map((x) => (
            <option key={x.key} value={x.key}>{x.name}</option>
          ))}
        </select>
        {subclasses.length > 0 && (
          <select value={c.subclassKey ?? ''} onChange={(e) => patch({ subclassKey: e.target.value || undefined })} className="rounded border border-hearth-border bg-hearth-panel2 px-1.5 py-1 text-hearth-text">
            <option value="">— subclass —</option>
            {subclasses.map((x) => (
              <option key={x.key} value={x.key}>{x.name}</option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1 text-hearth-muted">
          Level
          <input
            type="number"
            min={1}
            max={20}
            value={c.level}
            onChange={(e) => patch({ level: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })}
            className="w-12 rounded border border-hearth-border bg-hearth-bg px-1 py-0.5 text-center text-hearth-text"
          />
        </label>
        <select value={c.speciesKey ?? ''} onChange={(e) => patch({ speciesKey: e.target.value || undefined })} className="rounded border border-hearth-border bg-hearth-panel2 px-1.5 py-1 text-hearth-text">
          <option value="">— species —</option>
          {species.map((x) => (
            <option key={x.key} value={x.key}>{x.name}</option>
          ))}
        </select>
        <select value={c.backgroundKey ?? ''} onChange={(e) => patch({ backgroundKey: e.target.value || undefined })} className="rounded border border-hearth-border bg-hearth-panel2 px-1.5 py-1 text-hearth-text">
          <option value="">— background —</option>
          {backgrounds.map((x) => (
            <option key={x.key} value={x.key}>{x.name}</option>
          ))}
        </select>
        <span className="text-hearth-muted">PB +{pb}</span>
        {c.speciesKey && (
          <button onClick={() => openCompendium({ kind: 'species', key: c.speciesKey! })} className="text-hearth-gold hover:text-hearth-ember" title="Species traits (📖)">
            📖
          </button>
        )}
      </div>

      {/* Vitals */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-hearth-border bg-hearth-panel2/40 px-3 py-2">
        <label className="flex items-center gap-1 text-xs text-hearth-muted">
          AC
          <input type="number" value={c.ac} onChange={(e) => patch({ ac: Number(e.target.value) || 0 })} className="w-12 rounded border border-hearth-border bg-hearth-bg px-1 py-0.5 text-center text-sm text-hearth-text" />
        </label>
        <label className="flex items-center gap-1 text-xs text-hearth-muted">
          HP
          <span className="text-sm text-hearth-text">{c.hp}</span>/
          <input
            type="number"
            value={c.maxHp}
            onChange={(e) => patch({ maxHp: Number(e.target.value) || 0, hp: Math.min(c.hp, Number(e.target.value) || 0) })}
            title={hpSuggest != null ? `Suggested max for ${cls?.name} ${c.level} (fixed HP): ${hpSuggest}` : undefined}
            className="w-14 rounded border border-hearth-border bg-hearth-bg px-1 py-0.5 text-center text-sm text-hearth-text"
          />
          {hpSuggest != null && hpSuggest !== c.maxHp && (
            <button onClick={() => patch({ maxHp: hpSuggest, hp: Math.min(c.hp, hpSuggest) })} className="text-[10px] text-hearth-gold hover:text-hearth-ember" title="Apply the suggested max HP">
              → {hpSuggest}
            </button>
          )}
        </label>
        <label className="flex items-center gap-1 text-xs text-hearth-muted">
          Temp
          <input type="number" value={c.tempHp ?? 0} onChange={(e) => patch({ tempHp: Math.max(0, Number(e.target.value) || 0) || undefined })} className="w-12 rounded border border-hearth-border bg-hearth-bg px-1 py-0.5 text-center text-sm text-hearth-text" />
        </label>
        <span className="flex items-center gap-0.5">
          <input
            value={dmg}
            onChange={(e) => setDmg(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyHp(-1)}
            placeholder="dmg/heal"
            className="w-16 rounded border border-hearth-border bg-hearth-bg px-1 py-0.5 text-center text-xs text-hearth-text placeholder:text-hearth-muted/40"
          />
          <button onClick={() => applyHp(-1)} className="rounded bg-red-500/15 px-1.5 text-sm text-red-300 hover:bg-red-500/30" title="Damage (temp HP absorbs first)">−</button>
          <button onClick={() => applyHp(1)} className="rounded bg-emerald-500/15 px-1.5 text-sm text-emerald-300 hover:bg-emerald-500/30" title="Heal">+</button>
        </span>
        <label className="flex items-center gap-1 text-xs text-hearth-muted" title="Hit dice spent / total">
          HD {c.hitDiceSpent ?? 0}/{c.level}
          <button onClick={() => patch({ hitDiceSpent: Math.min(c.level, (c.hitDiceSpent ?? 0) + 1) })} className="rounded bg-hearth-bg px-1 hover:text-hearth-ember">spend</button>
        </label>
        <button onClick={() => patch({ inspiration: !c.inspiration })} className={`rounded-full border px-2 py-0.5 text-xs ${c.inspiration ? 'border-hearth-gold bg-hearth-gold/20 text-hearth-gold' : 'border-hearth-border text-hearth-muted'}`} title="Heroic Inspiration">
          ✨ Insp
        </button>
        <span className="ml-auto flex gap-1.5">
          <button onClick={() => patch({ slotsUsed: c.classKey === 'warlock' ? {} : c.slotsUsed })} className="rounded border border-hearth-border px-2 py-0.5 text-xs text-hearth-muted hover:text-hearth-text" title="Short rest: warlock Pact slots return">
            🌙 Short rest
          </button>
          <button onClick={longRest} className="rounded border border-hearth-ember bg-hearth-ember/15 px-2 py-0.5 text-xs text-hearth-ember hover:bg-hearth-ember/30" title="Long rest: full HP, all slots, half your hit dice back">
            ☀️ Long rest
          </button>
        </span>
      </div>

      {c.hp === 0 && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs">
          <span className="font-semibold text-red-300">Death saves</span>
          {(['success', 'fail'] as const).map((k) => (
            <label key={k} className="flex items-center gap-1 text-hearth-muted">
              {k === 'success' ? '✓' : '✗'}
              {[1, 2, 3].map((n) => (
                <input
                  key={n}
                  type="checkbox"
                  checked={(c.deathSaves?.[k] ?? 0) >= n}
                  onChange={(e) =>
                    patch({ deathSaves: { success: 0, fail: 0, ...c.deathSaves, [k]: e.target.checked ? n : n - 1 } })
                  }
                  className={`h-3.5 w-3.5 ${k === 'fail' ? 'accent-red-500' : 'accent-emerald-500'}`}
                />
              ))}
            </label>
          ))}
        </div>
      )}

      {/* Abilities + saves */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ABILITY_KEYS.map((k) => (
          <div key={k} className="rounded-md border border-hearth-border bg-hearth-panel2/40 px-2 py-1.5 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">{ABILITY_LABEL[k].slice(0, 3)}</div>
            <input
              type="number"
              value={c.abilities[k]}
              onChange={(e) => patch({ abilities: { ...c.abilities, [k]: Number(e.target.value) || 0 } })}
              className="w-full bg-transparent text-center text-lg font-semibold text-hearth-text focus:outline-none"
            />
            <div className="text-xs text-hearth-ember">{fmtMod(mod(c.abilities[k]))}</div>
            <div className="text-[10px] text-hearth-muted" title="Saving throw">
              save {fmtMod(saveBonus(c, k, cls?.savingThrows ?? []))}
              {cls?.savingThrows.includes(k) ? ' ●' : ''}
            </div>
          </div>
        ))}
      </div>

      {/* Skills + conditions side by side */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-hearth-border bg-hearth-panel2/30 p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
            Skills <span className="normal-case">(click ○ → proficient → expertise)</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3">
            {Object.keys(SKILL_ABILITY).map((sk) => {
              const state = c.expertise?.includes(sk) ? 2 : c.skillProfs.includes(sk) ? 1 : 0
              const cycle = () => {
                if (state === 0) patch({ skillProfs: [...c.skillProfs, sk] })
                else if (state === 1) patch({ expertise: [...(c.expertise ?? []), sk] })
                else patch({ skillProfs: c.skillProfs.filter((x) => x !== sk), expertise: (c.expertise ?? []).filter((x) => x !== sk) })
              }
              return (
                <button key={sk} onClick={cycle} className="flex items-center gap-1.5 rounded px-1 py-px text-left text-xs text-hearth-muted hover:bg-hearth-panel2">
                  <span className={state === 2 ? 'text-hearth-gold' : state === 1 ? 'text-hearth-ember' : 'text-hearth-muted/40'}>
                    {state === 2 ? '◉' : state === 1 ? '●' : '○'}
                  </span>
                  <span className="min-w-0 flex-1 truncate capitalize">{sk.replace(/_/g, ' ')}</span>
                  <span className="tabular-nums text-hearth-text">{fmtMod(skillBonus(c, sk))}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-1.5 border-t border-hearth-border pt-1 text-[10px] text-hearth-muted">
            Passives: 👁 Perception {passive(c, 'perception')} · 💡 Insight {passive(c, 'insight')} · 🔍 Investigation {passive(c, 'investigation')}
          </div>
        </div>

        <div className="space-y-3">
          <ConditionsBox c={c} onPatch={patch} />
          {Object.keys(slots).length > 0 && (
            <div className="rounded-md border border-hearth-border bg-hearth-panel2/30 p-2">
              <div className="mb-1 flex items-baseline gap-2 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
                Spell slots
                {spellDc != null && <span className="normal-case">DC {spellDc} · atk {fmtMod(spellAtk!)}</span>}
              </div>
              {Object.entries(slots).map(([lvl, total]) => {
                const used = c.slotsUsed?.[lvl] ?? 0
                return (
                  <div key={lvl} className="flex items-center gap-1.5 py-0.5 text-xs text-hearth-muted">
                    <span className="w-8">{SPELL_LEVEL_LABEL(Number(lvl)).replace('Level ', 'L')}</span>
                    {Array.from({ length: total }, (_, i) => (
                      <input
                        key={i}
                        type="checkbox"
                        checked={i < used}
                        onChange={(e) =>
                          patch({ slotsUsed: { ...c.slotsUsed, [lvl]: e.target.checked ? i + 1 : i } })
                        }
                        title="Tick = expended"
                        className="h-3.5 w-3.5 accent-hearth-ember"
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <SpellsBox c={c} onPatch={patch} />

      {features.length > 0 && (
        <details className="rounded-md border border-hearth-border bg-hearth-panel2/30 p-2" open={false}>
          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
            Class features ({features.length}) — {cls?.name}
            {sub ? ` / ${sub.name}` : ''}
          </summary>
          <div className="mt-1 space-y-1.5">
            {features.map((f) => (
              <p key={f.name} className="text-xs leading-snug text-hearth-muted">
                <span className="font-semibold text-hearth-text">
                  {f.name}
                  {f.levels.length ? ` (${f.levels.filter((l) => l <= c.level).join(', ')})` : ''}.{' '}
                </span>
                {f.desc.length > 400 ? `${f.desc.slice(0, 400)}…` : f.desc}
              </p>
            ))}
          </div>
        </details>
      )}

      {/* Equipment + notes */}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">Equipment (one per line)</span>
          <textarea
            value={(c.equipment ?? []).join('\n')}
            onChange={(e) => patch({ equipment: e.target.value.split('\n') })}
            onBlur={(e) => patch({ equipment: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) })}
            rows={5}
            className="mt-1 w-full rounded border border-hearth-border bg-hearth-bg px-2 py-1 text-xs text-hearth-text focus:border-hearth-ember focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">Notes</span>
          <textarea
            value={c.notes ?? ''}
            onChange={(e) => patch({ notes: e.target.value || undefined })}
            rows={5}
            className="mt-1 w-full rounded border border-hearth-border bg-hearth-bg px-2 py-1 text-xs text-hearth-text focus:border-hearth-ember focus:outline-none"
          />
        </label>
      </div>
    </div>
  )
}

function ConditionsBox({ c, onPatch }: { c: Character; onPatch: (p: Partial<Character>) => void }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (!v) return
    setDraft('')
    onPatch({ conditions: [...(c.conditions ?? []), v] })
  }
  return (
    <div className="rounded-md border border-hearth-border bg-hearth-panel2/30 p-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">Conditions</div>
      <div className="flex flex-wrap items-center gap-1">
        {(c.conditions ?? []).map((x, i) => (
          <button
            key={`${x}:${i}`}
            onClick={() => onPatch({ conditions: (c.conditions ?? []).filter((_, j) => j !== i) })}
            className="rounded-full bg-purple-500/15 px-1.5 py-px text-[11px] text-purple-300 hover:bg-red-500/20 hover:text-red-300"
            title="Click to clear"
          >
            {x}
          </button>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="+ condition"
          className="w-24 rounded border border-transparent bg-transparent px-1 py-px text-[11px] text-hearth-muted placeholder:text-hearth-muted/40 focus:border-hearth-border focus:outline-none"
        />
      </div>
    </div>
  )
}

function SpellsBox({ c, onPatch }: { c: Character; onPatch: (p: Partial<Character>) => void }) {
  const openCompendium = useStore((s) => s.openCompendium)
  const [all, setAll] = useState<Spell[] | null>(null)
  const [query, setQuery] = useState('')
  useEffect(() => {
    loadSpells().then(setAll).catch(() => setAll([]))
  }, [])

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !all) return []
    return all
      .map((s) => ({ s, score: fuzzyScore(s.name, q) }))
      .filter((x) => x.score > 0 && !(c.spells ?? []).includes(x.s.key))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
  }, [query, all, c.spells])

  const known = (c.spells ?? [])
    .map((k) => all?.find((s) => s.key === k))
    .filter((s): s is Spell => !!s)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))

  if ((c.spells ?? []).length === 0 && !CASTING_HINT(c)) return null

  return (
    <div className="rounded-md border border-hearth-border bg-hearth-panel2/30 p-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">Spells</div>
      <div className="flex flex-wrap gap-1">
        {known.map((s) => (
          <span key={s.key} className="group/spell flex items-center gap-1 rounded-full border border-hearth-border bg-hearth-panel px-2 py-0.5 text-xs">
            <button onClick={() => openCompendium({ kind: 'spell', key: s.key })} className="text-hearth-text hover:text-hearth-ember" title={`${SPELL_LEVEL_LABEL(s.level)} — open card (📖)`}>
              {s.name}
            </button>
            <span className="text-[9px] text-hearth-muted">{s.level === 0 ? 'c' : s.level}</span>
            <button
              onClick={() => onPatch({ spells: (c.spells ?? []).filter((x) => x !== s.key) })}
              className="text-hearth-muted opacity-40 hover:text-red-400 group-hover/spell:opacity-100"
              title="Remove"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="relative mt-1.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add spell (SRD search)…"
          className="w-full rounded border border-hearth-border bg-hearth-bg px-2 py-1 text-xs text-hearth-text placeholder:text-hearth-muted/40 focus:border-hearth-ember focus:outline-none"
        />
        {hits.length > 0 && (
          <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-hearth-border bg-hearth-panel2 shadow-2xl">
            {hits.map(({ s }) => (
              <button
                key={s.key}
                onClick={() => {
                  setQuery('')
                  onPatch({ spells: [...(c.spells ?? []), s.key] })
                }}
                className="flex w-full items-baseline gap-2 px-2.5 py-1 text-left text-xs text-hearth-text hover:bg-hearth-ember/15"
              >
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="flex-none text-[9px] text-hearth-muted">{SPELL_LEVEL_LABEL(s.level)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Show the spells box for casters even before any spells are picked. */
function CASTING_HINT(c: Character): boolean {
  return !!c.classKey && c.classKey in CASTING_ABILITY
}
