import { useEffect, useMemo, useRef } from 'react'
import { BubbleMenu, EditorContent, useEditor, type Editor } from '@tiptap/react'
import {
  SCRIPT_HIGHLIGHTS,
  SCRIPT_TEXT_COLORS,
  scriptHighlightColor,
  scriptTextColor,
  type ScriptDoc
} from '../../shared/types'
import { buildExtensions } from '../editor/extensions'
import LinkSuggest from '../editor/LinkSuggest'
import { docToTiptap, tiptapToDoc } from '../editor/mapping'
import { ToolBtn, Swatch } from './ScriptEditor'

/**
 * Rich-text editor for a campaign note's body: the script editor's TipTap
 * stack (headings, bold/italic, DM callouts, colors/highlights) minus the
 * sound-cue tray. Always-on editing with debounced autosave — a note is a
 * living document, not a form.
 */
export default function NoteEditor({
  noteId,
  body,
  onSave
}: {
  /** Keyed by the caller so switching notes remounts with fresh content. */
  noteId: string
  body: ScriptDoc
  onSave: (doc: ScriptDoc) => void
}) {
  const saveTimer = useRef<number | undefined>(undefined)
  // Capture the starting document once — never reset from props (would fight typing).
  const initialContent = useMemo(() => docToTiptap(body), [noteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleSave = (ed: Editor) => {
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => onSave(tiptapToDoc(ed.getJSON())), 600)
  }

  const editor = useEditor({
    extensions: buildExtensions({ cues: false }),
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          'script-editor min-h-[14rem] rounded-md border border-hearth-border bg-hearth-panel/60 p-4 text-[16px] leading-relaxed text-hearth-text focus:outline-none'
      }
    },
    onUpdate: ({ editor }) => scheduleSave(editor)
  })

  // Flush any pending save on unmount (scene/note switch, tab change).
  useEffect(() => {
    return () => {
      if (saveTimer.current !== undefined) {
        window.clearTimeout(saveTimer.current)
        if (editor) onSave(tiptapToDoc(editor.getJSON()))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  return (
    <div className="space-y-2">
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
          <ToolBtn
            active={editor.isActive('callout')}
            onClick={() => editor.chain().focus().toggleWrap('callout').run()}
            title="DM-note callout box"
          >
            ❝ Note
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('check')}
            onClick={() =>
              editor.isActive('check')
                ? editor.chain().focus().setNode('paragraph').run()
                : editor.chain().focus().setNode('check').run()
            }
            title="Checklist item — secrets & clues: tick during play; unchecked items carry into the next session"
          >
            ☑
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet list (or type “- ”)"
          >
            •≡
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Numbered list (or type “1. ”)"
          >
            1≡
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

      <LinkSuggest editor={editor}>
        <EditorContent editor={editor} />
      </LinkSuggest>
      <p className="text-[11px] text-hearth-muted/60">
        Type <kbd className="rounded border border-hearth-border px-1">[[</kbd> to link another note
        — Ctrl+click a link to follow it.
      </p>
    </div>
  )
}
