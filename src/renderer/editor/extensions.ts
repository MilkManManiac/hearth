import { Mark, Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { scriptHighlightColor, scriptTextColor, type CueKind } from '../../shared/types'
import { buildCue } from '../../shared/scriptCompile'
import CheckItem from './CheckItem'
import CueChip from './CueChip'
import NoteLinkChip from './NoteLinkChip'
import StatRefChip from './StatRefChip'

function numOrNull(v: string | null): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

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
      },
      // Amb-cue lifecycle options (null = unset; see CueInline in shared/types).
      volume: {
        default: null,
        parseHTML: (el) => numOrNull(el.getAttribute('data-volume')),
        renderHTML: (attrs) => (attrs.volume == null ? {} : { 'data-volume': String(attrs.volume) })
      },
      fadeInMs: {
        default: null,
        parseHTML: (el) => numOrNull(el.getAttribute('data-fade-in')),
        renderHTML: (attrs) => (attrs.fadeInMs == null ? {} : { 'data-fade-in': String(attrs.fadeInMs) })
      },
      fadeOutMs: {
        default: null,
        parseHTML: (el) => numOrNull(el.getAttribute('data-fade-out')),
        renderHTML: (attrs) => (attrs.fadeOutMs == null ? {} : { 'data-fade-out': String(attrs.fadeOutMs) })
      },
      until: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-until'),
        renderHTML: (attrs) => (attrs.until ? { 'data-until': attrs.until } : {})
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
  },

  addInputRules() {
    // Typing the authoring syntax `{{sfx:door-creak}}` (with optional amb
    // lifecycle options, `{{amb:rain|vol=40%|until=section}}`) converts to a
    // chip on the closing braces — same parser as the markdown compiler, so
    // in-app typing and scriptText files stay one language.
    return [
      {
        find: /\{\{\s*(music|sfx|image|amb)\s*:\s*([^}]+?)\s*\}\}$/,
        handler: ({ range, match, chain }) => {
          const cue = buildCue(match[1] as CueKind, match[2].trim())
          chain()
            .deleteRange(range)
            .insertContent({
              type: 'cue',
              attrs: {
                kind: cue.kind,
                ref: cue.ref,
                label: cue.label,
                volume: cue.volume ?? null,
                fadeInMs: cue.fadeInMs ?? null,
                fadeOutMs: cue.fadeOutMs ?? null,
                until: cue.until ?? null
              }
            })
            .run()
        }
      }
    ]
  }
})

/**
 * Atomic inline [[wiki-link]] to another campaign note. Serializes to/from the
 * ScriptDoc `link` inline. `label` empty = render the target's live title.
 */
export const NoteLinkNode = Node.create({
  name: 'noteLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      ref: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-ref'),
        renderHTML: (attrs) => ({ 'data-ref': attrs.ref })
      },
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-label'),
        renderHTML: (attrs) => (attrs.label ? { 'data-label': attrs.label } : {})
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-note-link]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-note-link': '' }),
      String(HTMLAttributes['data-label'] || HTMLAttributes['data-ref'] || '')
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteLinkChip)
  }
})

/**
 * Atomic inline monster/trap stat-block reference. Serializes to/from the
 * ScriptDoc `statref` inline. Typing `{{monster:mimic}}` (optionally
 * `{{monster:mimic|Mimic A}}`) in any editor converts to a chip on the
 * closing braces — same authoring syntax the markdown compiler accepts.
 */
export const StatRefNode = Node.create({
  name: 'statRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      kind: {
        default: 'monster',
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
        renderHTML: (attrs) => (attrs.label ? { 'data-label': attrs.label } : {})
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-stat-ref]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-stat-ref': '' }),
      String(HTMLAttributes['data-label'] || HTMLAttributes['data-ref'] || '')
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(StatRefChip)
  },

  addInputRules() {
    return [
      {
        find: /\{\{\s*(monster|trap)\s*:\s*([^}|]+?)\s*(?:\|\s*([^}]+?)\s*)?\}\}$/,
        handler: ({ range, match, chain }) => {
          chain()
            .deleteRange(range)
            .insertContent({
              type: 'statRef',
              attrs: { kind: match[1], ref: match[2], label: match[3] ?? '' }
            })
            .run()
        }
      }
    ]
  }
})

/**
 * Checklist line ("- [ ]" in authoring markdown): a block with inline content
 * and a live checkbox. Enter continues the list (new unchecked item); Enter on
 * an empty item, or Backspace at its start, drops back to a paragraph.
 */
export const CheckNode = Node.create({
  name: 'check',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      checked: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-checked') === 'true',
        renderHTML: (attrs) => ({ 'data-checked': attrs.checked ? 'true' : 'false' })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-check]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-check': '', class: 'script-check' }), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CheckItem)
  },

  addInputRules() {
    return [
      // Typing "- [ ] " or "- [x] " at a paragraph start turns it into a check item.
      {
        find: /^[-*]\s\[([ xX])\]\s$/,
        handler: ({ state, range, match, chain }) => {
          const checked = match[1] !== ' '
          const $from = state.selection.$from
          if ($from.parent.type.name !== 'paragraph') return
          chain().deleteRange(range).setNode('check', { checked }).run()
        }
      },
      // With lists enabled, "- " converts to a bullet before "[ ]" can be
      // typed — so "[ ] " INSIDE a fresh list item rescues the checklist flow:
      // lift out of the list and become a check item.
      {
        find: /^\[([ xX])\]\s$/,
        handler: ({ state, range, match, chain }) => {
          const checked = match[1] !== ' '
          const $from = state.selection.$from
          if ($from.parent.type.name !== 'paragraph') return
          if ($from.depth < 2 || $from.node($from.depth - 1).type.name !== 'listItem') return
          chain().deleteRange(range).liftListItem('listItem').setNode('check', { checked }).run()
        }
      }
    ]
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { $from } = this.editor.state.selection
        if ($from.parent.type.name !== 'check') return false
        // Empty item + Enter = leave the list.
        if ($from.parent.content.size === 0) {
          return this.editor.commands.setNode('paragraph')
        }
        return this.editor.chain().splitBlock().updateAttributes('check', { checked: false }).run()
      },
      Backspace: () => {
        const { $from, empty } = this.editor.state.selection
        if (!empty || $from.parent.type.name !== 'check' || $from.parentOffset !== 0) return false
        return this.editor.commands.setNode('paragraph')
      }
    }
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

/**
 * The full extension set for the read-aloud editor. `cues: false` builds the
 * same rich-text stack without the sound-cue node — used by the notes editor.
 */
export function buildExtensions(opts: { cues?: boolean } = {}) {
  return [
    StarterKit.configure({
      // Keep only what maps to our ScriptDoc; disable the rest.
      strike: false,
      code: false,
      codeBlock: false,
      blockquote: false,
      // Lists are ON (audit P2: "a DM can't make a plain list") — they map to
      // flat `bullet` blocks in the ScriptDoc (mapping.ts flattens/regroups).
      horizontalRule: false,
      hardBreak: false,
      heading: { levels: [1, 2, 3] },
      dropcursor: { width: 2, color: '#e0b341' }
    }),
    CalloutNode,
    CheckNode,
    NoteLinkNode,
    StatRefNode,
    ...(opts.cues === false ? [] : [CueNode]),
    ScriptColorMark,
    ScriptHighlightMark
  ]
}
