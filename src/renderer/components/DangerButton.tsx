import { useDangerConfirm } from '../lib/dangerConfirm'

/**
 * Destructive-action button with a built-in two-step confirm: first click
 * arms it ("Sure?" in red), second click within ~3.5s fires. Replaces
 * `window.confirm`'s app-blocking OS dialog.
 */
export default function DangerButton({
  onConfirm,
  title,
  className = '',
  armedLabel = 'Sure?',
  children
}: {
  onConfirm: () => void
  title?: string
  className?: string
  /** What the armed state shows (keep it short — it inherits the button size). */
  armedLabel?: React.ReactNode
  children: React.ReactNode
}) {
  const { armed, fire } = useDangerConfirm(onConfirm)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        fire()
      }}
      title={armed ? 'Click again to confirm' : title}
      className={`${className} ${armed ? '!border-red-500/70 !bg-red-500/15 !text-red-300 !opacity-100' : ''}`}
    >
      {armed ? armedLabel : children}
    </button>
  )
}
