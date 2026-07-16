import { useEffect } from 'react'
import { assetUrl } from '../lib/asset'
import { useStore } from '../store'
import DangerButton from './DangerButton'

// SURFACES-PLAN M1 — the map library browser (DDB's Map Browser, Hearth-style):
// prep several maps like tabs, open the fog/zone editor on any of them, and
// make ONE live — players (presenter now, Ember in M2) follow the live map.

export default function MapsPanel() {
  const open = useStore((s) => s.mapsOpen)
  const setOpen = useStore((s) => s.setMapsOpen)
  const maps = useStore((s) => s.campaign.maps)
  const liveMapId = useStore((s) => s.campaign.liveMapId)
  const deleteMap = useStore((s) => s.deleteMap)
  const goLiveMap = useStore((s) => s.goLiveMap)
  const updateMap = useStore((s) => s.updateMap)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-hearth-border bg-hearth-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-hearth-border px-4 py-2.5">
          <h2 className="font-display text-lg font-semibold text-hearth-text">🗺 The Table — map library</h2>
          <span className="text-xs text-hearth-muted">
            one map is LIVE for the players; the rest are your prep tabs
          </span>
          {liveMapId && (
            <button
              onClick={() => void goLiveMap(null)}
              className="rounded border border-hearth-border bg-hearth-panel2 px-2 py-1 text-xs text-hearth-muted hover:text-hearth-text"
              title="Black out the players' table (no map live)"
            >
              ⏸ Blackout
            </button>
          )}
          <button onClick={() => setOpen(false)} className="ml-auto rounded px-2 py-1 text-hearth-muted hover:text-hearth-text" title="Close (Esc)">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {maps.length === 0 ? (
            <p className="pt-8 text-center text-sm text-hearth-muted">
              No maps yet — open a scene's <span className="text-hearth-ember">Images</span> section and hit the 🗺
              button on any image to add it to the library.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {maps.map((m) => {
                const live = m.id === liveMapId
                const zoneCount = m.zones?.length ?? 0
                const hiddenZones = m.zones?.filter((z) => z.hidden).length ?? 0
                return (
                  <div
                    key={m.id}
                    className={`group overflow-hidden rounded-md border transition-colors ${
                      live ? 'border-red-500/70 ring-1 ring-red-500/50' : 'border-hearth-border hover:border-hearth-ember/60'
                    }`}
                  >
                    <button
                      onClick={() => {
                        // M3: fog/zone editing lives in the ⚔ Table window.
                        void window.hearth.openWindow('table', { mapId: m.id })
                        setOpen(false)
                      }}
                      className="relative block w-full"
                      title="Open in the ⚔ Table window (fog, zones, tokens, tracker)"
                    >
                      {m.image ? (
                        <img src={assetUrl(m.image)} alt={m.name} className="aspect-video w-full object-cover" />
                      ) : (
                        <div className="flex aspect-video w-full items-center justify-center bg-hearth-panel2 text-xs text-hearth-muted">
                          no image
                        </div>
                      )}
                      {live && (
                        <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold uppercase text-black">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-black/70" /> Live
                        </span>
                      )}
                    </button>
                    <div className="flex items-center gap-1.5 px-2 py-1.5">
                      <input
                        value={m.name}
                        onChange={(e) => void updateMap(m.id, (x) => ({ ...x, name: e.target.value }))}
                        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-hearth-text focus:border-hearth-border focus:outline-none"
                      />
                      <button
                        onClick={() => void goLiveMap(live ? null : m.id)}
                        title={live ? 'Black out the table' : 'Go live — players follow this map'}
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          live ? 'text-red-300' : 'text-hearth-muted hover:text-red-300'
                        }`}
                      >
                        {live ? '⏸' : '🔴'}
                      </button>
                      <DangerButton
                        onConfirm={() => void deleteMap(m.id)}
                        className="rounded px-1 text-xs text-hearth-muted/60 hover:text-red-400"
                        title="Delete map (file → recycle bin; the image stays in art/)"
                      >
                        🗑
                      </DangerButton>
                    </div>
                    <div className="px-3 pb-1.5 text-[10px] text-hearth-muted/70">
                      {zoneCount > 0
                        ? `${zoneCount} zone${zoneCount > 1 ? 's' : ''} (${hiddenZones} fogged)`
                        : 'no zones'}
                      {m.encounter?.combatants.length ? ` · ⚔ ${m.encounter.combatants.length}` : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
