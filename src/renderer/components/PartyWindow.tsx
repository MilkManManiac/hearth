import { useEffect } from 'react'
import { useStore } from '../store'
import PartyPanel from './PartyPanel'
import CompendiumPanel from './CompendiumPanel'
import Toasts from './Toasts'

/**
 * 🛡 The Party window (SURFACES-PLAN M3): the character manager as a real
 * window — dashboard strip, roster, sheets, 🎁 grants, portal switch.
 * Data-only bootstrap: no audio, no Discord tap (those live in the console).
 */
export default function PartyWindow() {
  const bootstrapData = useStore((s) => s.bootstrapData)
  const setPartyOpen = useStore((s) => s.setPartyOpen)

  useEffect(() => {
    document.title = 'Hearth — 🛡 Party'
    void bootstrapData()
    // Marks the panel open in THIS window's store (also refreshes the
    // portal-status indicator, same as opening the console overlay did).
    setPartyOpen(true)
  }, [bootstrapData, setPartyOpen])

  return (
    <div className="hearth-ambient h-full text-hearth-text">
      <PartyPanel windowed />
      <CompendiumPanel />
      <Toasts />
    </div>
  )
}
