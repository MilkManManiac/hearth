import { useEffect, useState } from 'react'

/**
 * A compact live volume fader (0..1). Local state so dragging is smooth; calls
 * onChange on every move (engine updates live, persistence is debounced
 * upstream). Stops propagation so it never triggers a parent play button.
 */
export function VolumeFader({
  value,
  defaultValue,
  onChange
}: {
  value: number | undefined
  defaultValue: number
  onChange: (v: number) => void
}) {
  const [v, setV] = useState(value ?? defaultValue)
  useEffect(() => setV(value ?? defaultValue), [value, defaultValue])

  return (
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={v}
      title={`Volume ${Math.round(v * 100)}% — double-click to reset to ${Math.round(defaultValue * 100)}%`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation()
        setV(defaultValue)
        onChange(defaultValue)
      }}
      onChange={(e) => {
        const nv = parseFloat(e.target.value)
        setV(nv)
        onChange(nv)
      }}
      className="h-1 w-full cursor-pointer accent-hearth-ember"
    />
  )
}

/** Loop on/off toggle. */
export function LoopButton({
  on,
  onClick,
  title
}: {
  on: boolean
  onClick: () => void
  title?: string
}) {
  return (
    <button
      type="button"
      title={title ?? (on ? 'Looping — click to play once' : 'Play once — click to loop')}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`flex-none text-xs transition-colors ${
        on ? 'text-hearth-ember' : 'text-hearth-muted hover:text-hearth-text'
      }`}
    >
      🔁
    </button>
  )
}
