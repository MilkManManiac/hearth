import { useLayoutEffect, useRef } from 'react'

/**
 * A textarea that wraps and grows to fit its content — the readability fix
 * for notes/ideas that a single-line input would truncate. No scrollbars, no
 * resize handle; height always matches the text.
 */
export default function GrowArea({
  value,
  onChange,
  onBlur,
  placeholder,
  className
}: {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  placeholder?: string
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      className={`block w-full resize-none overflow-hidden bg-transparent focus:outline-none ${className ?? ''}`}
    />
  )
}
