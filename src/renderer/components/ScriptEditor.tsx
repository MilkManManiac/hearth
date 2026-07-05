import { useEffect, useRef } from 'react'
import type { Scene, ScriptNode } from '../../shared/types'
import { compileScriptText } from '../../shared/scriptCompile'

const ICON: Record<string, string> = { music: '▶', sfx: '🔊', image: '🖼' }

interface CuePayload {
  kind: 'music' | 'sfx' | 'image'
  ref: string
  label: string
  source: 'tray' | 'chip'
}

/** Build the inline chip element for a cue. */
function makeChip(kind: string, ref: string, label: string): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.className = 'cue-chip'
  chip.dataset.kind = kind
  chip.dataset.ref = ref
  chip.dataset.label = label
  chip.contentEditable = 'false'
  chip.draggable = true
  const text = document.createElement('span')
  text.textContent = label
  const x = document.createElement('span')
  x.className = 'cue-x'
  x.textContent = '×'
  x.title = 'remove'
  chip.append(text, x)
  return chip
}

function trayLabel(kind: string, name: string): string {
  return `${ICON[kind]} ${name}`
}

/** Populate the editor with the scene's existing script. */
function fillEditor(container: HTMLElement, script: ScriptNode[]): void {
  container.replaceChildren()
  for (const node of script) {
    if (node.type === 'text') {
      container.append(document.createTextNode(node.text))
    } else {
      const label = node.label ?? `${ICON[node.kind]} ${node.ref}`
      container.append(makeChip(node.kind, node.ref, label))
    }
  }
}

/** Serialize the editor DOM back into script nodes. */
function serialize(container: HTMLElement): ScriptNode[] {
  const nodes: ScriptNode[] = []
  let text = ''
  const flush = () => {
    if (text.length) nodes.push({ type: 'text', text })
    text = ''
  }
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      text += n.textContent ?? ''
    } else if (n instanceof HTMLElement) {
      if (n.classList.contains('cue-chip')) {
        flush()
        nodes.push({
          type: 'cue',
          kind: (n.dataset.kind as 'music' | 'sfx' | 'image') ?? 'sfx',
          ref: n.dataset.ref ?? '',
          label: n.dataset.label
        })
      } else if (n.tagName === 'BR') {
        text += '\n'
      } else {
        if (text.length && !text.endsWith('\n')) text += '\n'
        n.childNodes.forEach(walk)
      }
    }
  }
  container.childNodes.forEach(walk)
  flush()
  return nodes
}

/** Find a safe insertion range at the drop point, never inside a chip. */
function rangeAtPoint(container: HTMLElement, x: number, y: number): Range {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  let range = doc.caretRangeFromPoint?.(x, y) ?? null
  if (!range || !container.contains(range.startContainer)) {
    range = document.createRange()
    range.selectNodeContents(container)
    range.collapse(false)
    return range
  }
  // If the caret landed inside a chip, move just after it.
  let el: Node | null = range.startContainer
  while (el && el !== container) {
    if (el instanceof HTMLElement && el.classList.contains('cue-chip')) {
      const after = document.createRange()
      after.setStartAfter(el)
      after.collapse(true)
      return after
    }
    el = el.parentNode
  }
  return range
}

export default function ScriptEditor({
  scene,
  onSave,
  onCancel
}: {
  scene: Scene
  onSave: (script: ScriptNode[]) => void
  onCancel: () => void
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const draggingChip = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    const initial = scene.script ?? compileScriptText(scene.scriptText ?? '')
    fillEditor(el, initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const trayItems: CuePayload[] = [
    ...(scene.music ?? []).map((m) => ({ kind: 'music' as const, ref: m.id, label: trayLabel('music', m.label), source: 'tray' as const })),
    ...(scene.sfx ?? []).map((s) => ({ kind: 'sfx' as const, ref: s.id, label: trayLabel('sfx', s.label), source: 'tray' as const })),
    ...(scene.images ?? []).map((i) => ({
      kind: 'image' as const,
      ref: i.file,
      label: trayLabel('image', i.caption ?? i.file.split('/').pop() ?? i.file),
      source: 'tray' as const
    }))
  ]

  const onTrayDragStart = (e: React.DragEvent, item: CuePayload) => {
    e.dataTransfer.setData('application/x-cue', JSON.stringify(item))
    e.dataTransfer.effectAllowed = 'copy'
  }

  const onEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.classList.contains('cue-x')) {
      target.closest('.cue-chip')?.remove()
    }
  }

  const onChipDragStart = (e: React.DragEvent) => {
    const chip = (e.target as HTMLElement).closest('.cue-chip') as HTMLElement | null
    if (!chip) return
    draggingChip.current = chip
    const payload: CuePayload = {
      kind: (chip.dataset.kind as CuePayload['kind']) ?? 'sfx',
      ref: chip.dataset.ref ?? '',
      label: chip.dataset.label ?? '',
      source: 'chip'
    }
    e.dataTransfer.setData('application/x-cue', JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'move'
  }

  const onEditorDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData('application/x-cue')
    if (!raw) return
    e.preventDefault()
    editorRef.current?.classList.remove('drop-active')
    const item = JSON.parse(raw) as CuePayload
    if (item.source === 'chip' && draggingChip.current) {
      draggingChip.current.remove()
      draggingChip.current = null
    }
    const el = editorRef.current
    if (!el) return
    const range = rangeAtPoint(el, e.clientX, e.clientY)
    const chip = makeChip(item.kind, item.ref, item.label)
    range.insertNode(chip)
    chip.after(document.createTextNode(' '))
  }

  const onEditorDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-cue')) {
      e.preventDefault()
      editorRef.current?.classList.add('drop-active')
    }
  }

  const onTrayDrop = (e: React.DragEvent) => {
    // Dropping an existing chip on the tray deletes it.
    const raw = e.dataTransfer.getData('application/x-cue')
    if (!raw) return
    e.preventDefault()
    if (draggingChip.current) {
      draggingChip.current.remove()
      draggingChip.current = null
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap gap-1.5 rounded-md border border-dashed border-hearth-border bg-hearth-panel/40 p-2"
        onDrop={onTrayDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <span className="mr-1 self-center text-[11px] uppercase tracking-wider text-hearth-muted">
          Drag in →
        </span>
        {trayItems.length === 0 && (
          <span className="self-center text-xs text-hearth-muted">
            Add music/sfx/images to this scene to drag them into the text.
          </span>
        )}
        {trayItems.map((item) => (
          <span
            key={`${item.kind}:${item.ref}`}
            draggable
            onDragStart={(e) => onTrayDragStart(e, item)}
            className={`tray-chip cue-chip`}
            data-kind={item.kind}
            title={`${item.kind}: ${item.ref}`}
          >
            {item.label}
          </span>
        ))}
        <span className="self-center text-[11px] text-hearth-muted">
          (drop a chip back here to delete)
        </span>
      </div>

      <div
        ref={editorRef}
        className="script-editor min-h-[8rem] rounded-md border border-hearth-border bg-hearth-panel/60 p-4 text-hearth-text"
        contentEditable
        suppressContentEditableWarning
        onClick={onEditorClick}
        onDragStart={onChipDragStart}
        onDrop={onEditorDrop}
        onDragOver={onEditorDragOver}
        onDragLeave={() => editorRef.current?.classList.remove('drop-active')}
      />

      <div className="flex gap-2">
        <button
          onClick={() => editorRef.current && onSave(serialize(editorRef.current))}
          className="rounded border border-hearth-ember bg-hearth-ember/20 px-3 py-1.5 text-sm text-hearth-ember hover:bg-hearth-ember/30"
        >
          Save script
        </button>
        <button
          onClick={onCancel}
          className="rounded border border-hearth-border px-3 py-1.5 text-sm text-hearth-muted hover:text-hearth-text"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
