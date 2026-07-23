/**
 * Placement for floating cards (stat-block cards, note peeks) anchored to
 * inline chips. Cards portal to <body> with position:fixed, so no ancestor
 * clips them — but the docked sound console still owns the bottom of the
 * window, and a card that opens downward must stop above it, not run under
 * it. The dock is collapsible, so its height is measured live (any element
 * tagged data-bottom-dock), never assumed.
 */

export interface CardPlacement {
  left: number
  top: number
  above: boolean
  /** Height budget the card actually has on its chosen side. */
  maxHeight: number
}

const MARGIN = 8
const GAP = 6 // between the anchor chip and the card

/** Y coordinate floating UI must stay above (top of the dock, else the viewport bottom). */
export function dockLimit(): number {
  const dock = document.querySelector('[data-bottom-dock]')
  const top = dock ? dock.getBoundingClientRect().top : window.innerHeight
  return Math.min(window.innerHeight, top)
}

/**
 * Place a card of width `cardW` next to anchor rect `r`, preferring downward.
 * Flips upward when the space below (above the dock) can't fit `cardMaxH`
 * and there is more room above; either way `maxHeight` is clamped to the
 * space actually available on the chosen side.
 */
export function placeCard(r: DOMRect, cardW: number, cardMaxH: number): CardPlacement {
  const limit = dockLimit()
  const left = Math.min(Math.max(MARGIN, r.left), window.innerWidth - cardW - MARGIN)
  const spaceBelow = limit - (r.bottom + GAP) - MARGIN
  const spaceAbove = r.top - GAP - MARGIN
  const above = spaceBelow < cardMaxH && spaceAbove > spaceBelow
  const maxHeight = Math.max(120, Math.min(cardMaxH, above ? spaceAbove : spaceBelow))
  return { left, top: above ? r.top - GAP : r.bottom + GAP, above, maxHeight }
}
