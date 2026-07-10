import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  abilityMod,
  formatCR,
  loadKind,
  SPELL_LEVEL_LABEL,
  type ClassEntry,
  type Monster,
  type MonsterAction,
  type NamedEntry,
  type Spell
} from '../lib/compendium'
import { d20Expr, rollExpr } from '../../shared/dice'
import { submitRoll, useRollStore, wireRollFeed } from '../lib/rollStore'

// ---------------------------------------------------------------------------
// Rules-term tooltips: condition names inside descriptions ("Charmed",
// "Grappled"…) get a dotted underline + the full rule as a native tooltip —
// DDB's everything-is-a-tooltip convention, at zero click cost.
// ---------------------------------------------------------------------------

let glossaryCache: { re: RegExp; map: Map<string, string> } | null = null
let glossaryLoading: Promise<void> | null = null

function useGlossaryTerms() {
  const [, force] = useState(0)
  useEffect(() => {
    if (glossaryCache || glossaryLoading) return
    glossaryLoading = loadKind('glossary')
      .then((rows) => {
        const conditions = rows.filter((r) => r.section === 'Conditions')
        const map = new Map(conditions.map((r) => [r.name.toLowerCase(), String(r.desc ?? '')]))
        const names = conditions.map((r) => r.name).sort((a, b) => b.length - a.length)
        glossaryCache = { re: new RegExp(`\\b(${names.join('|')})\\b`, 'g'), map }
        force((n) => n + 1)
      })
      .catch(() => undefined)
  }, [])
  return glossaryCache
}

// ---------------------------------------------------------------------------
// DM dice (D1): inside a monster stat block, dice expressions ("2d8+3") and
// attack bonuses ("Attack Roll: +7") are roll buttons. Visibility follows the
// Game Log's "DM rolls public" toggle (default 🔒 DM-only, DDB's "Self").
// Only in the Electron app — the portal renders plain text.
// ---------------------------------------------------------------------------

const canDmRoll = () => typeof window !== 'undefined' && !!window.hearth

function dmRoll(what: string, expr: string): void {
  const roll = rollExpr(expr, { who: 'DM', what, dmOnly: !useRollStore.getState().dmPublic })
  if (roll) submitRoll(roll)
}

function DmRollBtn({ label, what, expr, title }: { label: string; what: string; expr: string; title: string }) {
  return (
    <button
      onClick={() => dmRoll(what, expr)}
      title={title}
      className="rounded bg-hearth-ember/10 px-0.5 font-semibold text-hearth-ember hover:bg-hearth-ember/25"
    >
      {label}
    </button>
  )
}

/** RulesText + clickable dice/attack bonuses, attributed to the monster. */
export function DiceText({ text, rollAs }: { text: string; rollAs: string }) {
  useEffect(() => wireRollFeed(), [])
  const parts = useMemo<ReactNode[]>(() => {
    if (!canDmRoll()) return [<RulesText key="t" text={text} />]
    // Attack bonuses ("Attack Roll: +7") and dice ("2d8+3", "1d10").
    const re = /(Attack Roll:\s*)([+-]\d+)|(\b\d+d\d+(?:\s*[+-]\s*\d+)?\b)/g
    const out: ReactNode[] = []
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push(<RulesText key={last} text={text.slice(last, m.index)} />)
      if (m[2] !== undefined) {
        out.push(<RulesText key={`${m.index}a`} text={m[1]} />)
        out.push(
          <DmRollBtn
            key={`${m.index}b`}
            label={m[2]}
            what={`${rollAs} — attack`}
            expr={d20Expr(parseInt(m[2], 10))}
            title={`Roll the attack (1d20${m[2]})`}
          />
        )
      } else {
        const dice = m[3].replace(/\s+/g, '')
        out.push(
          <DmRollBtn key={m.index} label={m[3]} what={`${rollAs} — ${dice}`} expr={dice} title={`Roll ${dice}`} />
        )
      }
      last = m.index + m[0].length
    }
    if (last < text.length) out.push(<RulesText key={`${last}e`} text={text.slice(last)} />)
    return out
  }, [text, rollAs])
  return <>{parts}</>
}

/** Description text with condition-name tooltips. */
export function RulesText({ text }: { text: string }) {
  const terms = useGlossaryTerms()
  const parts = useMemo<ReactNode[]>(() => {
    if (!terms) return [text]
    const out: ReactNode[] = []
    let last = 0
    terms.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = terms.re.exec(text)) !== null) {
      if (m.index > last) out.push(text.slice(last, m.index))
      const desc = terms.map.get(m[1].toLowerCase())
      out.push(
        <span key={m.index} title={desc} className="cursor-help underline decoration-hearth-gold/40 decoration-dotted underline-offset-2">
          {m[1]}
        </span>
      )
      last = m.index + m[0].length
    }
    if (last < text.length) out.push(text.slice(last))
    return out
  }, [text, terms])
  return <>{parts}</>
}

// 2024-layout stat block + spell card + generic entry article. Fixed single
// column, actions as rows, math visible — never accordion-hidden (the "fast
// mid-combat" rules from the research pass).

const ACTION_GROUPS: { type: string; label: string }[] = [
  { type: 'ACTION', label: 'Actions' },
  { type: 'BONUS_ACTION', label: 'Bonus Actions' },
  { type: 'REACTION', label: 'Reactions' },
  { type: 'LEGENDARY_ACTION', label: 'Legendary Actions' }
]

function usesLabel(a: MonsterAction): string {
  if (!a.uses) return ''
  if (a.uses.type === 'PER_DAY') return ` (${a.uses.param}/Day)`
  if (a.uses.type === 'RECHARGE_ON_ROLL') return ` (Recharge ${a.uses.param ?? 5}–6)`
  if (a.uses.type === 'RECHARGE_AFTER_REST') return ' (Recharges after a Rest)'
  return ''
}

function Divider() {
  return <div className="my-2 h-px bg-hearth-ember/40" />
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="my-0.5 text-[13px] leading-snug">
      <span className="font-semibold text-hearth-text">{label} </span>
      <span className="text-hearth-muted">{children}</span>
    </p>
  )
}

const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

export function MonsterStatBlock({ m }: { m: Monster }) {
  const speed = Object.entries(m.speed)
    .map(([k, v]) => (k === 'hover' ? 'hover' : `${k === 'walk' ? '' : `${cap(k)} `}${v} ft.`))
    .join(', ')
  const senses = [...m.senses, m.passivePerception != null ? `Passive Perception ${m.passivePerception}` : '']
    .filter(Boolean)
    .join('; ')
  const abilityCols: { key: keyof Monster['abilities']; label: string; save: string }[] = [
    { key: 'str', label: 'Str', save: 'strength' },
    { key: 'dex', label: 'Dex', save: 'dexterity' },
    { key: 'con', label: 'Con', save: 'constitution' },
    { key: 'int', label: 'Int', save: 'intelligence' },
    { key: 'wis', label: 'Wis', save: 'wisdom' },
    { key: 'cha', label: 'Cha', save: 'charisma' }
  ]
  return (
    <article className="text-sm">
      <h3 className="font-display text-xl font-semibold text-hearth-ember">{m.name}</h3>
      <p className="text-xs italic text-hearth-muted">
        {cap(m.size)} {cap(m.type)}
        {m.subcategory ? ` (${m.subcategory})` : ''}, {m.alignment}
      </p>
      <Divider />
      <Line label="AC">
        {m.ac}
        {m.acDetail ? ` (${m.acDetail})` : ''}
        {m.initiative != null && (
          <>
            {'  '}
            <span className="font-semibold text-hearth-text">Initiative </span>
            {canDmRoll() ? (
              <DmRollBtn
                label={m.initiative >= 0 ? `+${m.initiative}` : String(m.initiative)}
                what={`${m.name} — initiative`}
                expr={d20Expr(m.initiative)}
                title="Roll initiative"
              />
            ) : m.initiative >= 0 ? (
              `+${m.initiative}`
            ) : (
              m.initiative
            )}
          </>
        )}
      </Line>
      <Line label="HP">
        {m.hp}
        {m.hitDice ? ` (${m.hitDice})` : ''}
      </Line>
      <Line label="Speed">{speed || '—'}</Line>
      <Divider />
      {/* 2024 ability table: score + save mod per column. */}
      <table className="w-full text-center text-[12px]">
        <thead>
          <tr className="text-hearth-muted">
            <th />
            {abilityCols.map((c) => (
              <th key={c.key} className="font-semibold text-hearth-text">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="text-left text-hearth-muted">Score</td>
            {abilityCols.map((c) => (
              <td key={c.key}>
                {m.abilities[c.key]} ({abilityMod(m.abilities[c.key])})
              </td>
            ))}
          </tr>
          <tr>
            <td className="text-left text-hearth-muted">Save</td>
            {abilityCols.map((c) => {
              const sv = m.saves[c.save]
              if (sv == null) {
                return (
                  <td key={c.key} className="text-hearth-muted">
                    —
                  </td>
                )
              }
              const label = sv >= 0 ? `+${sv}` : String(sv)
              return (
                <td key={c.key} className="text-hearth-muted">
                  {canDmRoll() ? (
                    <DmRollBtn label={label} what={`${m.name} — ${c.label} save`} expr={d20Expr(sv)} title={`Roll a ${c.label} save`} />
                  ) : (
                    label
                  )}
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
      <Divider />
      {Object.keys(m.skills).length > 0 && (
        <Line label="Skills">
          {Object.entries(m.skills)
            .map(([k, v]) => `${cap(k.replace(/_/g, ' '))} +${v}`)
            .join(', ')}
        </Line>
      )}
      {m.vulnerabilities && <Line label="Vulnerabilities">{m.vulnerabilities}</Line>}
      {m.resistances && <Line label="Resistances">{m.resistances}</Line>}
      {m.immunities && <Line label="Immunities">{m.immunities}</Line>}
      {m.conditionImmunities && <Line label="Condition Immunities">{m.conditionImmunities}</Line>}
      {senses && <Line label="Senses">{senses}</Line>}
      <Line label="Languages">
        {m.languages || '—'}
        {m.telepathy ? `; telepathy ${m.telepathy} ft.` : ''}
      </Line>
      <Line label="CR">
        {formatCR(m.cr)}
        {m.xp != null ? ` (XP ${m.xp.toLocaleString()}` : ''}
        {m.pb != null ? `; PB +${m.pb})` : m.xp != null ? ')' : ''}
      </Line>
      {m.traits.length > 0 && (
        <>
          <Divider />
          <h4 className="mb-1 mt-2 text-[11px] font-bold uppercase tracking-wider text-hearth-ember">Traits</h4>
          {m.traits.map((t) => (
            <p key={t.name} className="my-1 text-[13px] leading-snug text-hearth-muted">
              <span className="font-semibold italic text-hearth-text">{t.name}. </span>
              <DiceText text={t.desc} rollAs={m.name} />
            </p>
          ))}
        </>
      )}
      {ACTION_GROUPS.map((g) => {
        const acts = m.actions.filter((a) => a.type === g.type)
        if (acts.length === 0) return null
        return (
          <div key={g.type}>
            <Divider />
            <h4 className="mb-1 mt-2 text-[11px] font-bold uppercase tracking-wider text-hearth-ember">{g.label}</h4>
            {acts.map((a) => (
              <p key={a.name} className="my-1 text-[13px] leading-snug text-hearth-muted">
                <span className="font-semibold italic text-hearth-text">
                  {a.name}
                  {usesLabel(a)}.{' '}
                </span>
                <DiceText text={a.desc} rollAs={m.name} />
              </p>
            ))}
          </div>
        )
      })}
      {m.environments && (
        <p className="mt-2 text-[11px] text-hearth-muted/70">Environments: {m.environments.join(', ')}</p>
      )}
    </article>
  )
}

export function SpellCard({ s }: { s: Spell }) {
  return (
    <article className="text-sm">
      <h3 className="font-display text-xl font-semibold text-hearth-ember">{s.name}</h3>
      <p className="text-xs italic text-hearth-muted">
        {SPELL_LEVEL_LABEL(s.level)} · {cap(s.school)}
        {s.ritual ? ' (ritual)' : ''}
      </p>
      <Divider />
      <Line label="Casting Time">
        {cap(s.castingTime ?? '')}
        {s.reaction ? ` (${s.reaction})` : ''}
      </Line>
      <Line label="Range">{s.range}</Line>
      <Line label="Components">
        {s.components}
        {s.material ? ` (${s.material})` : ''}
      </Line>
      <Line label="Duration">
        {s.concentration ? 'Concentration, ' : ''}
        {s.duration}
      </Line>
      {s.classes.length > 0 && <Line label="Classes">{s.classes.map(cap).join(', ')}</Line>}
      <Divider />
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-hearth-muted"><RulesText text={s.desc} /></p>
      {s.higherLevel && (
        <p className="mt-2 text-[13px] leading-relaxed text-hearth-muted">
          <span className="font-semibold text-hearth-text">Using a Higher-Level Spell Slot. </span>
          <RulesText text={s.higherLevel} />
        </p>
      )}
    </article>
  )
}

/** Species/class/feat/item/rule/glossary — name + desc + benefit/trait/feature lists. */
export function EntryArticle({ e }: { e: NamedEntry }) {
  const cls = e as Partial<ClassEntry>
  const sub = [
    e.section,
    cls.subclassOf ? `Subclass` : undefined,
    cls.hitDice ? `Hit Die ${cls.hitDice}` : undefined,
    typeof e.category === 'string' ? cap(String(e.category).replace(/-/g, ' ')) : undefined,
    typeof e.rarity === 'string' ? cap(String(e.rarity)) : undefined,
    typeof e.requiresAttunement === 'string' ? String(e.requiresAttunement) : undefined,
    typeof e.cost === 'string' ? String(e.cost) : undefined,
    typeof e.damage === 'string' ? String(e.damage) : undefined,
    typeof e.ac === 'string' ? `AC ${e.ac}` : undefined,
    Array.isArray(e.properties) ? (e.properties as string[]).join(', ') : undefined
  ]
    .filter(Boolean)
    .join(' · ')
  const lists = (e.benefits ?? e.traits ?? []) as { name: string; desc: string }[]
  return (
    <article className="text-sm">
      <h3 className="font-display text-xl font-semibold text-hearth-ember">{e.name}</h3>
      {sub && <p className="text-xs italic text-hearth-muted">{sub}</p>}
      <Divider />
      {typeof e.desc === 'string' && e.desc && (
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-hearth-muted"><RulesText text={e.desc} /></p>
      )}
      {lists.map((b) => (
        <p key={b.name} className="my-1.5 text-[13px] leading-snug text-hearth-muted">
          <span className="font-semibold italic text-hearth-text">{b.name}. </span>
          <RulesText text={b.desc} />
        </p>
      ))}
      {Array.isArray(cls.features) && cls.features.length > 0 && (
        <>
          <h4 className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wider text-hearth-ember">Features</h4>
          {cls.features.map((f) => (
            <p key={f.name} className="my-1.5 text-[13px] leading-snug text-hearth-muted">
              <span className="font-semibold italic text-hearth-text">
                {f.name}
                {f.levels.length ? ` (level ${f.levels.join(', ')})` : ''}.{' '}
              </span>
              {f.desc}
            </p>
          ))}
        </>
      )}
    </article>
  )
}
