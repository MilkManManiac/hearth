import type { ReactNode } from 'react'

/**
 * Shared header for a control-board section (Music, Ambience, SFX, Read-aloud):
 * a small accent icon, the uppercase label, a hairline rule that fills the gap,
 * and an optional slot on the right for the section's action controls. Unifies
 * what each section used to hand-roll, so hierarchy reads the same everywhere.
 */
export default function SectionHeader({
  icon,
  title,
  children
}: {
  icon: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="mb-2.5 flex items-center gap-2.5">
      <span className="text-sm text-hearth-ember/80" aria-hidden>
        {icon}
      </span>
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-hearth-muted">{title}</h3>
      <span className="h-px flex-1 bg-gradient-to-r from-hearth-border to-transparent" />
      {children}
    </div>
  )
}
