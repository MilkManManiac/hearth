import type { CampaignMap, TokenDecor } from './types'

// What players may see of a map right now. Lives in shared/ because BOTH
// processes need it: the renderer for the presenter window and the one-shot
// 📤 Send, and the MAIN process for the player portal — where this filtering
// is the security boundary (AUDIT P0: DM secrets must never reach a player's
// browser, not merely be hidden by client code the player controls).

export interface PlayerMapView {
  decor: Record<string, TokenDecor>
  initiative?: { names: string[]; turn: number }
}

/**
 * PC-only HP rings (enemy HP stays the DM's secret), condition tags on
 * visible tokens, and the initiative strip. Shared by the presenter, the
 * one-shot send, Ember, and the portal's server-side filter.
 */
export function playerTableView(
  map: CampaignMap,
  characters: { id: string; hp: number; maxHp: number }[]
): PlayerMapView {
  const tokens = map.tokens ?? []
  const enc = map.encounter
  const decor: Record<string, TokenDecor> = {}
  for (const tk of tokens) {
    if (tk.hidden) continue
    const d: TokenDecor = {}
    if (tk.characterId) {
      const ch = characters.find((x) => x.id === tk.characterId)
      if (ch && ch.maxHp > 0) d.hpFrac = ch.hp / ch.maxHp
    }
    const cb =
      enc?.combatants.find((x) => x.id === tk.combatantId) ??
      (tk.characterId ? enc?.combatants.find((x) => x.characterId === tk.characterId) : undefined)
    const conds = cb?.conditions?.map((x) => x.name) ?? []
    if (conds.length) d.conds = conds
    if (d.hpFrac != null || d.conds) decor[tk.id] = d
  }
  let initiative: { names: string[]; turn: number } | undefined
  if (enc && enc.turn >= 0 && enc.combatants.length > 0) {
    const ordered = [...enc.combatants].sort((a, b) => (b.initiative ?? -99) - (a.initiative ?? -99))
    const active = ordered[Math.min(enc.turn, ordered.length - 1)]
    const visible = ordered.filter((cb) => {
      const tk = tokens.find((t) => t.combatantId === cb.id || (cb.characterId && t.characterId === cb.characterId))
      return !tk?.hidden
    })
    initiative = { names: visible.map((cb) => cb.name), turn: visible.findIndex((cb) => cb.id === active?.id) }
  }
  return { decor, initiative }
}

/**
 * The portal's `/api/table` payload: the map with every DM secret REMOVED
 * (not hidden client-side — a curious player can read raw JSON). Hidden
 * tokens are gone, the encounter (enemy HP/notes/rolls) is gone, monster
 * compendium refs are gone; HP rings + conditions + initiative arrive
 * pre-computed instead. Fog geometry still ships — the player's browser
 * renders the fog, so it must know where it is. (The un-fogged map IMAGE is
 * also still fetchable by a determined player; burning fog into the image
 * server-side is the remaining gap, noted in the audit.)
 */
export function sanitizePlayerMap(
  map: CampaignMap,
  characters: { id: string; hp: number; maxHp: number }[]
): { map: CampaignMap } & PlayerMapView {
  const view = playerTableView(map, characters)
  const clean: CampaignMap = {
    id: map.id,
    name: map.name,
    image: map.image,
    strokes: map.strokes,
    zones: map.zones,
    grid: map.grid,
    overlays: map.overlays,
    tokens: (map.tokens ?? [])
      .filter((t) => !t.hidden)
      .map(({ id, label, x, y, r, color, characterId }) => ({ id, label, x, y, r, color, characterId }))
  }
  return { map: clean, ...view }
}
