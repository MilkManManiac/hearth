// Keyboard-scope helpers: in run mode the transport keys (Space/arrows) and
// SFX hotkeys belong to the teleprompter, not whatever control was last
// clicked. Only genuine *typing* contexts get to swallow keys — a button or a
// volume slider that happens to hold focus must not.

/** Input types where keystrokes are text entry (so global hotkeys must yield). */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'password', 'number', 'tel'])

/** True when the event target is a text-entry context (input/textarea/rich text). */
export function isTypingTarget(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null
  if (!t) return false
  if (t.tagName === 'TEXTAREA' || t.isContentEditable) return true
  if (t.tagName === 'INPUT') return TEXT_INPUT_TYPES.has((t as HTMLInputElement).type)
  return false
}

/**
 * If focus is parked on a non-typing control (a clicked button, a fader), drop
 * it back to the body so the control can't re-activate on Space or eat arrows.
 */
export function blurNonTypingFocus(): void {
  const el = document.activeElement as HTMLElement | null
  if (el && el !== document.body && !isTypingTarget(el)) el.blur()
}
