import { useEffect } from 'react'
import { isTypingTarget } from './lib/keys'
import { useStore } from './store'
import ControlBoard from './components/ControlBoard'
import PresenterView from './components/PresenterView'

const isPresenter = window.location.hash.replace('#', '') === 'presenter'

export default function App() {
  if (isPresenter) return <PresenterView />
  return <MainApp />
}

function MainApp() {
  const bootstrap = useStore((s) => s.bootstrap)
  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  // Panic hotkey: Esc = the Silence button (fade out music + ambience).
  // Skipped while a modal is open (there Esc means "close the modal") and while
  // typing (there Esc means "leave this field", not "kill the session's audio").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const s = useStore.getState()
      if (s.libraryOpen || s.triage || s.discordOpen || s.switcherOpen || s.captureOpen) return
      const t = e.target as HTMLElement | null
      if (isTypingTarget(t)) {
        t?.blur()
        return
      }
      s.stopAll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Ctrl+K quick switcher / Ctrl+J quick capture — global, capture-phase so
  // they work regardless of focus (even mid-typing: both are "get me out and
  // do the fast thing" keys). Suppressed while another modal owns the screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      const k = e.key.toLowerCase()
      if (k !== 'k' && k !== 'j') return
      const s = useStore.getState()
      if (s.libraryOpen || s.triage || s.discordOpen) return
      e.preventDefault()
      e.stopPropagation()
      if (k === 'k') {
        s.setCaptureOpen(false)
        s.setSwitcherOpen(!s.switcherOpen)
      } else {
        s.setSwitcherOpen(false)
        s.setCaptureOpen(!s.captureOpen)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // Clicked controls must not keep the keyboard: once a button or fader has
  // been used with the mouse, hand focus straight back so Space/arrows keep
  // driving the teleprompter (see TODOS #10.1). Text fields keep focus — you
  // clicked those *to* type.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      const control = t?.closest?.('button, input[type="range"]') as HTMLElement | null
      if (control && document.activeElement === control) control.blur()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return <ControlBoard />
}
