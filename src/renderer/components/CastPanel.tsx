import { useState } from 'react'
import type { EntityType, NoteKind, Scene, SceneEntity } from '../../shared/types'
import { compileScriptText } from '../../shared/scriptCompile'
import { useStore } from '../store'
import GrowArea from './GrowArea'

/** Where each cast type graduates to in the campaign notebook. */
const PROMOTE_KIND: Record<EntityType, NoteKind> = {
  npc: 'npc',
  monster: 'npc',
  item: 'item',
  location: 'location',
  hook: 'thread'
}

const TYPES: { type: EntityType; label: string; icon: string }[] = [
  { type: 'npc', label: 'NPCs', icon: '🧑' },
  { type: 'monster', label: 'Monsters', icon: '👹' },
  { type: 'item', label: 'Items & Loot', icon: '💎' },
  { type: 'location', label: 'Locations', icon: '📍' },
  { type: 'hook', label: 'Hooks', icon: '🎣' }
]
const ICON: Record<EntityType, string> = {
  npc: '🧑',
  monster: '👹',
  item: '💎',
  location: '📍',
  hook: '🎣'
}

export default function CastPanel({ scene }: { scene: Scene }) {
  const updateScene = useStore((s) => s.updateScene)
  const createNoteInline = useStore((s) => s.createNoteInline)
  const updateNote = useStore((s) => s.updateNote)
  const buildMode = useStore((s) => s.uiMode === 'build')
  const [newType, setNewType] = useState<EntityType>('npc')
  const [draft, setDraft] = useState('')
  const entities = scene.entities ?? []

  const mutate = (fn: (list: SceneEntity[]) => SceneEntity[]) =>
    updateScene(scene.id, (s) => ({ ...s, entities: fn(s.entities ?? []) }))

  /**
   * Graduate a scene-local entity into a real campaign note (N4): create the
   * note seeded with the entity's text, stamp provenance, and keep a 📓 link
   * on the row (entity.ref = "note:<id>").
   */
  const promote = async (entity: SceneEntity) => {
    const noteId = await createNoteInline(PROMOTE_KIND[entity.type], entity.name)
    if (!noteId) return
    const md = [
      entity.note?.trim() ?? '',
      `> [!dm] Promoted from scene “${scene.name}” (${new Date().toISOString().slice(0, 10)}).`
    ]
      .filter(Boolean)
      .join('\n\n')
    await updateNote(noteId, (n) => ({
      ...n,
      body: compileScriptText(md),
      bodyText: undefined,
      tags: entity.type === 'monster' ? [...(n.tags ?? []), 'monster'] : n.tags
    }))
    await mutate((list) => list.map((e) => (e.id === entity.id ? { ...e, ref: `note:${noteId}` } : e)))
  }

  const add = () => {
    const name = draft.trim()
    if (!name) return
    mutate((list) => [
      ...list,
      { id: crypto.randomUUID(), type: newType, name, status: 'present', used: false }
    ])
    setDraft('')
  }

  return (
    <div className="space-y-3">
      {TYPES.map(({ type, label, icon }) => {
        const group = entities.filter((e) => e.type === type)
        if (group.length === 0) return null
        return (
          <div key={type}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-hearth-muted">
              {icon} {label}
            </div>
            <ul className="space-y-1">
              {group.map((entity) => (
                <EntityRow
                  key={entity.id}
                  entity={entity}
                  onToggleUsed={() =>
                    mutate((list) =>
                      list.map((e) => (e.id === entity.id ? { ...e, used: !e.used } : e))
                    )
                  }
                  onToggleStatus={() =>
                    mutate((list) =>
                      list.map((e) =>
                        e.id === entity.id
                          ? { ...e, status: e.status === 'optional' ? 'present' : 'optional' }
                          : e
                      )
                    )
                  }
                  onEdit={(patch) =>
                    mutate((list) =>
                      list.map((e) => (e.id === entity.id ? { ...e, ...patch } : e))
                    )
                  }
                  onRemove={() => mutate((list) => list.filter((e) => e.id !== entity.id))}
                  onPromote={() => void promote(entity)}
                />
              ))}
            </ul>
          </div>
        )
      })}
      {entities.length === 0 && (
        <p className="text-xs text-hearth-muted">
          Track who and what is in this scene — NPCs, monsters, loot, hooks. Check things off as the
          party finds or fights them.
        </p>
      )}

      {/* Authoring is build-mode; run mode keeps the used/status checkboxes. */}
      {buildMode && (
        <div className="flex gap-1 border-t border-hearth-border pt-2">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as EntityType)}
            className="rounded border border-hearth-border bg-hearth-bg px-1 py-1 text-sm text-hearth-text focus:outline-none"
          >
            {TYPES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.icon}
              </option>
            ))}
          </select>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Add to cast & loot…"
            className="min-w-0 flex-1 rounded border border-hearth-border bg-hearth-bg px-2 py-1 text-sm text-hearth-text placeholder:text-hearth-muted focus:border-hearth-ember focus:outline-none"
          />
          <button
            onClick={add}
            className="rounded border border-hearth-border bg-hearth-panel2 px-2 text-sm text-hearth-muted hover:text-hearth-ember"
          >
            +
          </button>
        </div>
      )}
    </div>
  )
}

function EntityRow({
  entity,
  onToggleUsed,
  onToggleStatus,
  onEdit,
  onRemove,
  onPromote
}: {
  entity: SceneEntity
  onToggleUsed: () => void
  onToggleStatus: () => void
  onEdit: (patch: Partial<SceneEntity>) => void
  onRemove: () => void
  onPromote: () => void
}) {
  const [name, setName] = useState(entity.name)
  const [note, setNote] = useState(entity.note ?? '')
  const optional = entity.status === 'optional'
  const selectNote = useStore((s) => s.selectNote)
  const setLeftTab = useStore((s) => s.setLeftTab)
  const buildMode = useStore((s) => s.uiMode === 'build')
  const linkedNoteId = entity.ref?.startsWith('note:') ? entity.ref.slice(5) : null
  const linkedNote = useStore((s) =>
    linkedNoteId ? s.campaign.notes.find((n) => n.id === linkedNoteId) : undefined
  )

  return (
    <li className="group rounded border border-hearth-border/60 bg-hearth-panel2/40 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!entity.used}
          onChange={onToggleUsed}
          title="Mark used / encountered"
          className="h-3.5 w-3.5 shrink-0 accent-hearth-ember"
        />
        <span className="shrink-0 text-sm">{ICON[entity.type]}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== entity.name && onEdit({ name })}
          className={`min-w-0 flex-1 bg-transparent text-sm focus:outline-none ${
            entity.used ? 'text-hearth-muted line-through' : 'text-hearth-text'
          }`}
        />
        <button
          onClick={onToggleStatus}
          title={optional ? 'Could be added' : 'Present in scene'}
          className={`shrink-0 rounded px-1 text-[9px] uppercase ${
            optional ? 'bg-hearth-bg text-hearth-muted' : 'bg-hearth-emberdim/30 text-hearth-gold'
          }`}
        >
          {optional ? 'maybe' : 'here'}
        </button>
        {linkedNote ? (
          <button
            onClick={() => {
              selectNote(linkedNote.id)
              if (buildMode) setLeftTab('notes')
            }}
            title={`Open campaign note "${linkedNote.title}"`}
            className="shrink-0 text-hearth-gold hover:text-hearth-ember"
          >
            📓
          </button>
        ) : (
          <button
            onClick={onPromote}
            title="Promote to a campaign note — graduates this entry into the notebook, keeps a link here"
            className="shrink-0 text-hearth-muted opacity-40 hover:text-hearth-gold group-hover:opacity-100"
          >
            ⤴
          </button>
        )}
        <button
          onClick={onRemove}
          className="shrink-0 text-hearth-muted opacity-40 hover:text-red-400 group-hover:opacity-100"
          title="Remove"
        >
          ×
        </button>
      </div>
      {/* Wrapping, growing note — long stat/behavior notes stay readable. */}
      <div className="pl-7">
        <GrowArea
          value={note}
          onChange={setNote}
          onBlur={() => note !== (entity.note ?? '') && onEdit({ note })}
          placeholder="note…"
          className="mt-1 text-[13px] leading-snug text-hearth-muted placeholder:text-hearth-muted/50"
        />
      </div>
    </li>
  )
}
