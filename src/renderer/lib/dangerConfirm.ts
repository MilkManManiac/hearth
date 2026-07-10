import { useEffect, useRef, useState } from 'react'

/**
 * Two-step destructive action: the first click ARMS (the button should flip
 * to "sure?" styling for a few seconds), the second click within the window
 * fires. Replaces `window.confirm` — no OS dialog blocking the whole app
 * mid-session, and a mis-click never destroys anything.
 */
export function useDangerConfirm(action: () => void, windowMs = 3500) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const fire = () => {
    if (armed) {
      window.clearTimeout(timer.current)
      setArmed(false)
      action()
      return
    }
    setArmed(true)
    timer.current = window.setTimeout(() => setArmed(false), windowMs)
  }

  return { armed, fire }
}
