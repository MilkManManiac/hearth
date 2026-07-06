import { Mark, Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { scriptHighlightColor, scriptTextColor } from '../../shared/types'
import CueChip from './CueChip'

/** Atomic inline cue node. Serializes to/from our ScriptDoc `cue` inline. */
export const CueNode = Node.create({
  name: 'cue',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      kind: {
        default: 'sfx',
        parseHTML: (el) => el.getAttribute('data-kind'),
        renderHTML: (attrs) => ({ 'data-kind': attrs.kind })
      },
      ref: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-ref'),
        renderHTML: (attrs) => ({ 'data-ref': attrs.ref })
      },
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-label'),
        renderHTML: (attrs) => ({ 'data-label': attrs.label })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-cue]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-cue': '' }),
      String(HTMLAttributes['data-label'] || HTMLAttributes['data-ref'] || '')
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CueChip)
  }
})

/** Callout / DM-note block. Nests block content. */
export const CalloutNode = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '', class: 'script-callout' }), 0]
  }
})

/** Named text-color mark. Stores the palette id; renders the resolved color. */
export const ScriptColorMark = Mark.create({
  name: 'scriptColor',

  addAttributes() {
    return {
      value: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-script-color'),
        renderHTML: (attrs) =>
          attrs.value
            ? { 'data-script-color': attrs.value, style: `color: ${scriptTextColor(attrs.value)}` }
            : {}
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-script-color]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0]
  }
})

/** Named highlight (background) mark. */
export const ScriptHighlightMark = Mark.create({
  name: 'scriptHighlight',

  addAttributes() {
    return {
      value: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-script-highlight'),
        renderHTML: (attrs) =>
          attrs.value
            ? {
                'data-script-highlight': attrs.value,
                style: `background-color: ${scriptHighlightColor(attrs.value)}; border-radius: 2px;`
              }
            : {}
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-script-highlight]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0]
  }
})

/** The full extension set for the read-aloud editor. */
export function buildExtensions() {
  return [
    StarterKit.configure({
      // Keep only what maps to our ScriptDoc; disable the rest.
      strike: false,
      code: false,
      codeBlock: false,
      blockquote: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      horizontalRule: false,
      hardBreak: false,
      heading: { levels: [1, 2, 3] },
      dropcursor: { width: 2, color: '#e0b341' }
    }),
    CalloutNode,
    CueNode,
    ScriptColorMark,
    ScriptHighlightMark
  ]
}
