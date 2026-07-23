import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  scriptHighlightColor,
  scriptTextColor,
  type CueInline,
  type Scene,
  type ScriptBlock,
  type ScriptDoc,
  type ScriptInline
} from '../../shared/types'
import { setCheckedAt } from '../../shared/scriptCompile'
import { CUE_BADGE_CLASS, CUE_CHIP_CLASS, CUE_CHIP_HOVER, CUE_TEXT, cueDisplayLabel } from '../lib/cueMeta'
import { blurNonTypingFocus, isTypingTarget } from '../lib/keys'
import { pushRecent } from '../lib/prefs'
import { useStatRefStore } from '../lib/statRef'
import { engine, resolveAmbLayer, useStore } from '../store'
import NoteLinkPill from './NoteLinkPill'
import StatRefPill from './StatRefPill'
import ScriptEditor, { type EnsureAsset } from './ScriptEditor'
import SectionHeader from './SectionHeader'

// Run-screen redesign (2026-07-23, PoC approved): h1/h2 render as big ember
// section LANDMARKS with a fading rule — the beats a DM jumps between mid-read.
// h3 stays a modest sub-label. First landmark hugs the top; later ones get
// real air so each beat reads as its own block.
const LANDMARK_CLASS =
  'flex items-center gap-3.5 font-sans font-extrabold uppercase tracking-[0.12em] text-hearth-ember [&:not(:first-child)]:mt-14 mb-5'
const HEADING_CLASS: Record<number, string> = {
  1: `${LANDMARK_CLASS} text-[20px]`,
  2: `${LANDMARK_CLASS} text-[17px]`,
  3: 'mt-8 mb-2 text-[15px] font-sans font-bold uppercase tracking-[0.1em] text-hearth-muted'
}

export default function ScriptPanel({ scene }: { scene: Scene }) {
  const fireCue = useStore((s) => s.fireCue)
  const updateScene = useStore((s) => s.updateScene)
  const library = useStore((s) => s.campaign.library)
  const buildMode = useStore((s) => s.uiMode === 'build')
  const [editing, setEditing] = useState(false)
  // Teleprompter pointer: index (in document order) of the next cue Space will fire.
  const [cuePos, setCuePos] = useState(0)

  // Section-scoped beds this teleprompter started: file → the section it
  // belongs to + how fast to fade it out when the pointer leaves that section.
  const sectionBeds = useRef(new Map<string, { section: number; fadeOutMs?: number }>())

  // Leave edit mode and rewind the teleprompter when switching scenes.
  useEffect(() => {
    setEditing(false)
    setCuePos(0)
    sectionBeds.current.clear() // beds keep playing; the console still owns them
  }, [scene.id])

  const script: ScriptDoc = scene.script ?? []

  // Fade out every tracked bed from a section earlier than the one the
  // pointer just moved into. This is the `until: 'section'` lifecycle.
  const stopExpiredBeds = (section: number) => {
    for (const [file, info] of sectionBeds.current) {
      if (info.section < section) {
        engine.stopAmbienceLayer(file, info.fadeOutMs)
        sectionBeds.current.delete(file)
      }
    }
  }

  // Fire a cue and record it in the recently-used list (audio cues only).
  const fire = (n: CueInline, section?: number) => {
    // Section-scoped amb bookkeeping happens BEFORE firing: the cue is a
    // toggle, so "was it playing" decides whether this starts or stops it.
    if (n.kind === 'amb') {
      const file = resolveAmbLayer(scene, n.ref)?.file
      if (file) {
        const wasPlaying = useStore.getState().status.ambienceFiles.includes(file)
        if (wasPlaying) sectionBeds.current.delete(file) // cue is stopping it
        else if (n.until === 'section' && section !== undefined)
          sectionBeds.current.set(file, { section, fadeOutMs: n.fadeOutMs })
      }
    }
    fireCue(n)
    const file =
      n.kind === 'music'
        ? scene.music?.find((t) => t.id === n.ref)?.file
        : n.kind === 'sfx'
          ? scene.sfx?.find((t) => t.id === n.ref)?.file
          : n.kind === 'amb'
            ? resolveAmbLayer(scene, n.ref)?.file
            : undefined
    if (file) pushRecent(file)
  }

  // Teleprompter: Space fires the next cue, Shift+Space / ArrowRight skips it,
  // ArrowLeft rewinds the pointer (without firing anything). Runs in the
  // CAPTURE phase so a focused button/fader never sees the key — the timeline
  // owns Space and the arrows no matter what was last clicked.
  useEffect(() => {
    if (editing) return
    const cues = flattenCues(script)
    if (cues.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      const st = useStore.getState()
      if (st.libraryOpen || st.triage || st.discordOpen || st.switcherOpen || st.captureOpen || st.helpOpen || st.compendiumOpen || st.mapEditorOpen || st.mapsOpen || st.partyOpen)
        return // a modal owns the keyboard
      if (useStatRefStore.getState().openCount > 0) return // an open stat card owns it too
      if (isTypingTarget(e.target)) return // typing is the one thing that outranks the timeline
      blurNonTypingFocus() // a clicked mute button / volume slider must not hold the keyboard
      e.preventDefault() // no page scroll, no re-firing a focused button
      e.stopPropagation()
      if (e.key === 'ArrowLeft') {
        setCuePos(Math.max(0, cuePos - 1))
        return
      }
      if (cuePos >= cues.length) return
      const { cue, section } = cues[cuePos]
      stopExpiredBeds(section) // crossing into a new section retires its beds
      if (e.key === ' ' && !e.shiftKey) fire(cue, section)
      setCuePos(cuePos + 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [editing, script, cuePos, fire])

  // Autosave path — persist the doc, stay in edit mode.
  const handleSave = (doc: ScriptDoc) => {
    updateScene(scene.id, (s) => ({ ...s, script: doc, scriptText: undefined }))
  }

  // Auto-register a library asset dropped into the script that isn't on the scene yet.
  const ensureAsset: EnsureAsset = (entry) => {
    updateScene(scene.id, (s) => {
      if (entry.kind === 'ambience') {
        if ((s.ambience ?? []).some((a) => a.file === entry.file)) return s
        // Script-driven bed: it waits for its {{amb}} cue, not scene go-live.
        return { ...s, ambience: [...(s.ambience ?? []), { file: entry.file, autoplay: false }] }
      }
      const list = entry.kind === 'music' ? s.music ?? [] : s.sfx ?? []
      if (list.some((x) => x.id === entry.id || x.file === entry.file)) return s
      const item = { id: entry.id, label: entry.label, file: entry.file }
      return entry.kind === 'music'
        ? { ...s, music: [...(s.music ?? []), item] }
        : { ...s, sfx: [...(s.sfx ?? []), item] }
    })
  }

  const isEmpty = script.length === 0 || (script.length === 1 && script[0].type === 'paragraph' && script[0].content.length === 0)
  const flatCues = flattenCues(script)
  const cueCount = flatCues.length

  // Mutable document-order cue counter for this render pass; `next` gets the ring.
  const cueCtx: CueCtx = { i: 0, next: cuePos }

  // Live checklist ticks persist straight onto the scene (secrets & clues
  // consumed during play).
  const toggleCheck = (path: number[], checked: boolean) => {
    void updateScene(scene.id, (s) => ({ ...s, script: setCheckedAt(s.script ?? [], path, checked) }))
  }

  // Clicking a cue fires it AND re-syncs the teleprompter pointer to just past
  // it — so a manual tap (or a jump back to an earlier cue) puts Space back on
  // track from that point in the story.
  const fireAt = (n: CueInline, idx: number) => {
    const section = flatCues[idx]?.section ?? 0
    stopExpiredBeds(section)
    fire(n, section)
    setCuePos(idx + 1)
  }

  const keyHint = !editing && cueCount > 0 && (
    <span
      className="flex items-center gap-1.5 text-[11px] text-hearth-muted"
      title="Teleprompter: the ember ring marks the next cue. Click any cue to jump the pointer there."
    >
      <Key>Space</Key> next · <Key>→</Key> skip · <Key>←</Key> back
    </span>
  )

  return (
    <section>
      {/* Run mode strips the section chrome — the prose starts sooner; the
          teleprompter hint rides quietly above the card's right edge. */}
      {buildMode ? (
        <SectionHeader icon="📖" title="Read-aloud">
          {keyHint}
          {!editing && (
            <button onClick={() => setEditing(true)} className="text-xs text-hearth-muted hover:text-hearth-ember">
              ✎ Edit
            </button>
          )}
        </SectionHeader>
      ) : (
        keyHint && <div className="mx-auto mb-1 flex max-w-[70ch] justify-end">{keyHint}</div>
      )}

      {editing ? (
        <ScriptEditor
          scene={scene}
          library={library}
          onSave={handleSave}
          onEnsureAsset={ensureAsset}
          onDone={() => setEditing(false)}
        />
      ) : isEmpty ? (
        <p className="rounded-md border border-dashed border-hearth-border bg-hearth-panel/40 p-4 text-sm text-hearth-muted">
          No read-aloud text yet. Click <span className="text-hearth-ember">✎ Edit</span> to write one and drag in
          sound cues.
        </p>
      ) : (
        <div className="mx-auto max-w-[70ch] rounded-md border border-hearth-border bg-hearth-panel/60 px-8 py-7 font-display text-[18.5px] leading-[1.68] text-hearth-text shadow-card">
          {renderBlocks(script, fireAt, cueCtx, [], toggleCheck)}
        </div>
      )}
    </section>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-hearth-border bg-hearth-bg px-1 py-px font-mono text-[9px] text-hearth-muted">
      {children}
    </kbd>
  )
}

/**
 * All cues in the doc, in document order (descending into callouts), each
 * stamped with its section index. A heading (any level) starts a new section —
 * this is what `until: 'section'` amb cues live and die by.
 */
function flattenCues(doc: ScriptDoc): { cue: CueInline; section: number }[] {
  const out: { cue: CueInline; section: number }[] = []
  let section = 0
  const walk = (blocks: ScriptBlock[]): void => {
    for (const b of blocks) {
      if (b.type === 'callout') {
        walk(b.content)
        continue
      }
      if (b.type === 'heading') section++
      for (const n of b.content) if (n.type === 'cue') out.push({ cue: n, section })
    }
  }
  walk(doc)
  return out
}

/** Render-pass cue counter: `i` mutates as cues render; the cue at `next` gets the ring. */
type CueCtx = { i: number; next: number }

/** Tooltip suffix describing an amb cue's lifecycle options. */
function ambLifecycleHint(n: CueInline): string {
  if (n.kind !== 'amb') return ''
  const bits: string[] = []
  if (n.volume !== undefined) bits.push(`to ${Math.round(n.volume * 100)}%`)
  if (n.fadeInMs) bits.push(`in ${n.fadeInMs / 1000}s`)
  if (n.fadeOutMs) bits.push(`out ${n.fadeOutMs / 1000}s`)
  if (n.until === 'section') bits.push('until section end')
  return bits.length ? ` (${bits.join(', ')})` : ''
}

function inlineFormat(node: Extract<ScriptInline, { type: 'text' }>): { className: string; style: CSSProperties } {
  const cls = ['whitespace-pre-wrap']
  const style: CSSProperties = {}
  for (const m of node.marks ?? []) {
    if (m.type === 'bold') cls.push('font-semibold')
    else if (m.type === 'italic') cls.push('italic')
    else if (m.type === 'color') style.color = scriptTextColor(m.value)
    else if (m.type === 'highlight') {
      style.backgroundColor = scriptHighlightColor(m.value)
      style.borderRadius = '2px'
    }
  }
  return { className: cls.join(' '), style }
}

function renderInline(node: ScriptInline, key: number, fireCue: (n: CueInline, idx: number) => void, ctx: CueCtx): ReactNode {
  if (node.type === 'text') {
    const { className, style } = inlineFormat(node)
    return (
      <span key={key} className={className} style={style}>
        {node.text}
      </span>
    )
  }
  // [[note-link]]: jumps to the note (right panel in run mode). Not a cue —
  // it must not consume a teleprompter slot, so it stays out of ctx.i.
  if (node.type === 'link') {
    return <NoteLinkPill key={key} refId={node.ref} label={node.label} />
  }
  // Monster/trap stat ref: opens the rollable card. Like links, not a cue —
  // it must not consume a teleprompter slot, so it stays out of ctx.i.
  if (node.type === 'statref') {
    return <StatRefPill key={key} kind={node.kind} refId={node.ref} label={node.label} />
  }
  // Teleprompter "next up" indicator: subtle ember ring + glow on the cue Space will fire.
  const idx = ctx.i++
  const isNext = idx === ctx.next
  return (
    <button
      key={key}
      onClick={() => fireCue(node, idx)}
      className={`mx-1 inline-flex items-center gap-1.5 rounded border px-2.5 py-0.5 align-middle text-[15px] transition-colors ${CUE_CHIP_CLASS[node.kind]} ${CUE_CHIP_HOVER[node.kind]} ${
        isNext ? 'ring-2 ring-hearth-ember/80 ring-offset-2 ring-offset-hearth-panel shadow-[0_0_14px_rgba(255,140,60,0.45)]' : ''
      }`}
      title={`${node.kind}: ${node.ref}${ambLifecycleHint(node)}${isNext ? ' — next (Space)' : ''}`}
    >
      <span aria-hidden className={CUE_BADGE_CLASS}>
        {CUE_TEXT[node.kind]}
      </span>
      {cueDisplayLabel(node.label, node.ref)}
      {node.kind === 'amb' && node.until === 'section' && (
        <span aria-hidden className="text-[10px] opacity-70" title="Fades out at the end of this section">
          §
        </span>
      )}
    </button>
  )
}

/**
 * Render a sibling run, numbering consecutive ordered bullets — the flat
 * `bullet` blocks only know their run position from here.
 */
function renderBlocks(
  blocks: ScriptBlock[],
  fireCue: (n: CueInline, idx: number) => void,
  ctx: CueCtx,
  path: number[],
  onCheck: (path: number[], checked: boolean) => void
): ReactNode[] {
  let ord = 0
  return blocks.map((b, i) => {
    ord = b.type === 'bullet' && b.ordered ? ord + 1 : 0
    return renderBlock(b, i, fireCue, ctx, [...path, i], onCheck, ord || undefined)
  })
}

function renderBlock(
  block: ScriptBlock,
  key: number,
  fireCue: (n: CueInline, idx: number) => void,
  ctx: CueCtx,
  path: number[],
  onCheck: (path: number[], checked: boolean) => void,
  ordinal?: number
): ReactNode {
  if (block.type === 'callout') {
    return (
      <div
        key={key}
        className="script-callout my-5 rounded-r-md border-l-2 border-hearth-gold/60 bg-hearth-gold/5 px-4 py-2.5 text-[15.5px] leading-relaxed text-hearth-muted"
      >
        {/* Labeled, not just tinted — "for YOUR eyes" must survive a 2am skim. */}
        <span className="mb-1 block font-sans text-[10.5px] font-extrabold tracking-[0.14em] text-hearth-gold">
          🕯 DM ONLY
        </span>
        {renderBlocks(block.content, fireCue, ctx, path, onCheck)}
      </div>
    )
  }
  const inlines = block.content.map((n, i) => renderInline(n, i, fireCue, ctx))
  if (block.type === 'bullet') {
    return (
      <div key={key} className="mb-1.5 flex items-start gap-2.5 pl-1 last:mb-[18px]">
        <span aria-hidden className="w-4 flex-none select-none text-right text-hearth-ember/70">
          {ordinal ? `${ordinal}.` : '•'}
        </span>
        <span className="min-w-0 flex-1">{inlines}</span>
      </div>
    )
  }
  if (block.type === 'check') {
    return (
      <div key={key} className="my-1 flex items-start gap-2.5 text-[16px]">
        <input
          type="checkbox"
          checked={!!block.checked}
          onChange={(e) => onCheck(path, e.target.checked)}
          title="Secrets & clues — tick when it lands at the table (saves to the scene)"
          className="mt-[0.5em] h-4 w-4 shrink-0 cursor-pointer accent-hearth-ember"
        />
        <span className={block.checked ? 'text-hearth-muted line-through decoration-hearth-muted/50' : ''}>
          {inlines}
        </span>
      </div>
    )
  }
  if (block.type === 'heading') {
    const cls = HEADING_CLASS[block.level]
    // The fading ember rule after the words is what makes h1/h2 read as
    // section landmarks; h3 is a plain sub-label.
    const rule =
      block.level < 3 ? (
        <span
          aria-hidden
          className="h-px min-w-8 flex-1 bg-gradient-to-r from-hearth-ember/40 to-transparent"
        />
      ) : null
    if (block.level === 1)
      return (
        <h1 key={key} className={cls}>
          <span>{inlines}</span>
          {rule}
        </h1>
      )
    if (block.level === 2)
      return (
        <h2 key={key} className={cls}>
          <span>{inlines}</span>
          {rule}
        </h2>
      )
    return <h3 key={key} className={cls}>{inlines}</h3>
  }
  return (
    <p key={key} className="mb-[18px] last:mb-0">
      {inlines}
    </p>
  )
}
