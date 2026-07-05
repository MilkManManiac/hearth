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
  return <ControlBoard />
}
