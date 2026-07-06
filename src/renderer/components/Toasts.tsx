import { useStore } from '../store'

/**
 * Bottom-right transient notifications. Errors (failed decodes, missing assets)
 * make silent audio failures visible; info toasts confirm one-off actions like
 * the asset probe.
 */
export default function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto rounded border px-3 py-2 text-left text-sm shadow-lg transition-colors ${
            t.tone === 'error'
              ? 'border-red-800 bg-red-950/90 text-red-100 hover:bg-red-900/90'
              : 'border-hearth-border bg-hearth-panel2/95 text-hearth-text hover:border-hearth-ember'
          }`}
          title="Dismiss"
        >
          {t.tone === 'error' && <span className="mr-1">⚠</span>}
          {t.message}
        </button>
      ))}
    </div>
  )
}
