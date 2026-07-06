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
  // Skipped while the library browser is open — there Esc means "close the modal".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const s = useStore.getState()
      if (s.libraryOpen) return
      s.stopAll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return <ControlBoard />
}
