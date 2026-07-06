import { useEffect, useMemo, useRef, useState } from 'react'
import { BubbleMenu, useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import {
  CATEGORY_ORDER,
  categoryMeta,
  SCRIPT_HIGHLIGHTS,
  SCRIPT_TEXT_COLORS,
  scriptHighlightColor,
  scriptTextColor,
  type CueKind,
  type Scene,
  type ScriptDoc
} from '../../shared/types'
import { normalizeScript } from '../../shared/scriptCompile'
import { buildExtensions } from '../editor/extensions'
import { docToTiptap, tiptapToDoc } from '../editor/mapping'
import { insertCueAt, type CueAttrs } from '../editor/insert'

const CUE_ICON: Record<CueKind, string> = { music: '▶', sfx: '🔊', image: '🖼', amb: '〜' }

/** Registration payload for a library asset not yet on the scene. */
interface RegisterEntry {
  kind: 'music' | 'sfx' | 'ambience'
  id: string
  label: string
  file: string
}

interface TrayItem {
  key: string
  kind: CueKind
  ref: string
  label: string
  category: string
  register?: RegisterEntry
}

export interface EnsureAsset {
  (entry: RegisterEntry): void
}

function basename(file: string): string {
  return file.split('/').pop() ?? file
}

function stem(file: string): string {
  return basename(file).replace(/\.[^.]+$/, '')
}

function slug(file: string): string {
  return `lib-${stem(file).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

function categoryRank(id: string): number {
  const i = CATEGORY_ORDER.indexOf(id)
  return i === -1 ? CATEGORY_ORDER.length : i
}

const IN_SCENE = 'In this scene'

/** Build the tray: scene's own cues first, then the full categorized library. */
function buildTray(scene: Scene, library: { assets: { file: string; kind: string; category?: string }[] }): TrayItem[] {
  const items: TrayItem[] = []
  const sceneFiles = new Set<string>()

  for (const m of scene.music ?? []) {
    sceneFiles.add(m.file)
    items.push({ key: `m:${m.id}`, kind: 'music', ref: m.id, label: `${CUE_ICON.music} ${m.label}`, category: IN_SCENE })
  }
  for (const s of scene.sfx ?? []) {
    sceneFiles.add(s.file)
    items.push({ key: `s:${s.id}`, kind: 'sfx', ref: s.id, label: `${CUE_ICON.sfx} ${s.label}`, category: IN_SCENE })
  }
  for (const a of scene.ambience ?? []) {
    sceneFiles.add(a.file)
    items.push({ key: `a:${a.file}`, kind: 'amb', ref: a.file, label: `${CUE_ICON.amb} ${stem(a.file)}`, category: IN_SCENE })
  }
  for (const img of scene.images ?? []) {
    items.push({
      key: `i:${img.file}`,
      kind: 'image',
      ref: img.file,
      label: `${CUE_ICON.image} ${img.caption ?? stem(img.file)}`,
      category: IN_SCENE
    })
  }

  for (const a of library.assets) {
    if (sceneFiles.has(a.file)) continue // already shown under "In this scene"
    if (a.kind === 'ambience') {
      // Bed toggled by cue: ref is the file; dropping auto-registers the layer
      // (autoplay: false — the cue is its start signal, not scene go-live).
      items.push({
        key: `lib:${a.file}`,
        kind: 'amb',
        ref: a.file,
        label: `${CUE_ICON.amb} ${stem(a.file)}`,
        category: a.category || 'uncategorized',
        register: { kind: 'ambience', id: a.file, label: stem(a.file), file: a.file }
      })
      continue
    }
    if (a.kind !== 'music' && a.kind !== 'sfx') continue
    const kind = a.kind as 'music' | 'sfx'
    const id = slug(a.file)
    const label = `${CUE_ICON[kind]} ${stem(a.file)}`
    items.push({
      key: `lib:${a.file}`,
      kind,
      ref: id,
      label,
      category: a.category || 'uncategorized',
      register: { kind, id, label: stem(a.file), file: a.file }
    })
  }

  return items
}

export default function ScriptEditor({
  scene,
  library,
  onSave,
  onEnsureAsset,
  onDone
}: {
  scene: Scene
  library: { assets: { file: string; kind: string; category?: string }[] }
  onSave: (doc: ScriptDoc) => void
  onEnsureAsset: EnsureAsset
  onDone: () => void
}) {
  const [query, setQuery] = useState('')
  const saveTimer = useRef<number | undefined>(undefined)
  // Capture the starting document once — never reset from props (would fight typing).
  const initialContent = useMemo(() => docToTiptap(normalizeScript(scene.script ?? [])), [])

  const scheduleSave = (ed: Editor) => {
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => onSave(tiptapToDoc(ed.getJSON())), 600)
  }

  const editor = useEditor({
    extensions: buildExtensions(),
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          'script-editor min-h-[10rem] rounded-md border border-hearth-border bg-hearth-panel/60 p-4 text-[17px] leading-loose text-hearth-text focus:outline-none'
      },
      handleDrop: (view, event) => {
        const raw = event.dataTransfer?.getData('application/x-cue')
        if (!raw) return false // internal chip repositioning — let ProseMirror handle it
        event.preventDefault()
        const item = JSON.parse(raw) as TrayItem
        if (item.register) onEnsureAsset(item.register)
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
        const pos = coords ? coords.pos : view.state.selection.from
        insertCueAt(view, pos, { kind: item.kind, ref: item.ref, label: item.label })
        return true
      }
    },
    onUpdate: ({ editor }) => scheduleSave(editor)
  })

  // Flush any pending save on unmount.
  useEffect(() => {
    return () => window.clearTimeout(saveTimer.current)
  }, [])

  const done = () => {
    window.clearTimeout(saveTimer.current)
    if (editor) onSave(tiptapToDoc(editor.getJSON()))
    onDone()
  }

  const insertItem = (item: TrayItem) => {
    if (!editor) return
    if (item.register) onEnsureAsset(item.register)
    const attrs: CueAttrs = { kind: item.kind, ref: item.ref, label: item.label }
    insertCueAt(editor.view, editor.state.selection.from, attrs)
  }

  const tray = useMemo(() => buildTray(scene, library), [scene, library])
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q ? tray.filter((t) => t.label.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)) : tray
    const byCat = new Map<string, TrayItem[]>()
    for (const t of filtered) {
      if (!byCat.has(t.category)) byCat.set(t.category, [])
      byCat.get(t.category)!.push(t)
    }
    return [...byCat.entries()].sort(([a], [b]) => {
      if (a === IN_SCENE) return -1
      if (b === IN_SCENE) return 1
      return categoryRank(a) - categoryRank(b) || a.localeCompare(b)
    })
  }, [tray, query])

  return (
    <div className="space-y-3">
      {/* Block toolbar */}
      {editor && (
        <div className="flex flex-wrap items-center gap-1">
          <ToolBtn active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()}>
            ¶
          </ToolBtn>
          {([1, 2, 3] as const).map((level) => (
            <ToolBtn
              key={level}
              active={editor.isActive('heading', { level })}
              onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
            >
              H{level}
            </ToolBtn>
          ))}
          <ToolBtn active={editor.isActive('callout')} onClick={() => editor.chain().focus().toggleWrap('callout').run()}>
            ❝ Note
          </ToolBtn>
          <div className="mx-1 h-4 w-px bg-hearth-border" />
          <ToolBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
            ↶
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
            ↷
          </ToolBtn>
        </div>
      )}

      {/* Selection bubble menu for inline marks */}
      {editor && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100 }}
          className="flex items-center gap-1 rounded-md border border-hearth-border bg-hearth-panel2 p-1 shadow-xl"
        >
          <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
            <b>B</b>
          </ToolBtn>
          <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <i>I</i>
          </ToolBtn>
          <div className="mx-0.5 h-4 w-px bg-hearth-border" />
          {Object.entries(SCRIPT_TEXT_COLORS).map(([id, meta]) => (
            <Swatch
              key={id}
              title={meta.label}
              color={scriptTextColor(id)}
              active={editor.isActive('scriptColor', { value: id })}
              onClick={() => editor.chain().focus().setMark('scriptColor', { value: id }).run()}
            />
          ))}
          <div className="mx-0.5 h-4 w-px bg-hearth-border" />
          {Object.entries(SCRIPT_HIGHLIGHTS).map(([id, meta]) => (
            <Swatch
              key={id}
              title={`Highlight: ${meta.label}`}
              color={scriptHighlightColor(id)}
              ring
              active={editor.isActive('scriptHighlight', { value: id })}
              onClick={() => editor.chain().focus().setMark('scriptHighlight', { value: id }).run()}
            />
          ))}
          <div className="mx-0.5 h-4 w-px bg-hearth-border" />
          <ToolBtn onClick={() => editor.chain().focus().unsetAllMarks().run()} title="Clear formatting">
            ⌫
          </ToolBtn>
        </BubbleMenu>
      )}

      <EditorContent editor={editor} />

      {/* Cue tray: scene assets + full library */}
      <div className="rounded-md border border-dashed border-hearth-border bg-hearth-panel/40 p-2">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-hearth-muted">Cues — drag in or click</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search sounds & images…"
            className="ml-auto w-48 rounded border border-hearth-border bg-hearth-bg px-2 py-0.5 text-xs text-hearth-text placeholder:text-hearth-muted focus:border-hearth-ember focus:outline-none"
          />
        </div>
        <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
          {groups.length === 0 && (
            <p className="py-3 text-center text-xs text-hearth-muted">No cues match.</p>
          )}
          {groups.map(([cat, catItems]) => {
            const meta = cat === IN_SCENE ? { icon: '🎬', label: IN_SCENE } : categoryMeta(cat === 'uncategorized' ? undefined : cat)
            return (
              <div key={cat}>
                <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-hearth-muted">
                  <span>{meta.icon}</span>
                  {meta.label}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {catItems.map((item) => (
                    <span
                      key={item.key}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-cue', JSON.stringify(item))
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      onClick={() => insertItem(item)}
                      title={item.register ? 'Adds to this scene when used' : item.ref}
                      className="tray-chip cursor-grab select-none rounded border border-hearth-border bg-hearth-panel2 px-2 py-0.5 text-xs text-hearth-text hover:border-hearth-ember"
                    >
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={done}
          className="rounded border border-hearth-ember bg-hearth-ember/20 px-3 py-1.5 text-sm text-hearth-ember hover:bg-hearth-ember/30"
        >
          Done
        </button>
        <span className="self-center text-xs text-hearth-muted">Autosaves as you type · Ctrl+Z to undo</span>
      </div>
    </div>
  )
}

function ToolBtn({
  active,
  disabled,
  onClick,
  title,
  children
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-7 min-w-7 items-center justify-center rounded border px-1.5 text-sm transition-colors disabled:opacity-30 ${
        active
          ? 'border-hearth-ember bg-hearth-ember/20 text-hearth-ember'
          : 'border-hearth-border bg-hearth-panel2 text-hearth-muted hover:text-hearth-text'
      }`}
    >
      {children}
    </button>
  )
}

function Swatch({
  color,
  active,
  ring,
  title,
  onClick
}: {
  color: string
  active?: boolean
  ring?: boolean
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`h-5 w-5 rounded-full border ${active ? 'ring-2 ring-hearth-ember' : 'border-hearth-border'}`}
      style={ring ? { boxShadow: `inset 0 0 0 999px ${color}` } : { backgroundColor: color }}
    />
  )
}
