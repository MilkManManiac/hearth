import { useEffect } from 'react'
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
      if (s.libraryOpen || s.triage) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        t.blur()
        return
      }
      s.stopAll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return <ControlBoard />
}
