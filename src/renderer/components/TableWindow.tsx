import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { wireRollFeed } from '../lib/rollStore'
import MapEditor from './MapEditor'
import EncounterPanel from './EncounterPanel'
import CompendiumPanel from './CompendiumPanel'
import Toasts from './Toasts'

/**
 * ⚔ The Table window (SURFACES-PLAN M3): the DM's mid-fight home base — map
 * editor (fog/zones/tokens/ruler/AoE) with the encounter tracker docked
 * beside it, so running a fight never needs the console. Data-only bootstrap:
 * ALL audio stays in the console window (one engine, one Discord tap).
 */
export default function TableWindow() {
  const bootstrapData = useStore((s) => s.bootstrapData)
  const campaign = useStore((s) => s.campaign)
  const [mapId, setMapId] = useState<string | null>(null)
  const [trackerOpen, setTrackerOpen] = useState(true)

  useEffect(() => {
    document.title = 'Hearth — ⚔ Table'
    void bootstrapData()
    wireRollFeed()
    return window.hearth.onTableSelectMap((id) => setMapId(id))
  }, [bootstrapData])

  // Selected map, else the live one, else the first — same rule as the console.
  const map =
    campaign.maps.find((m) => m.id === mapId) ??
    campaign.maps.find((m) => m.id === campaign.liveMapId) ??
    campaign.maps[0] ??
    null

  return (
    <div className="hearth-ambient flex h-full text-hearth-text">
      <div className="relative min-w-0 flex-1">
        {map ? (
          <MapEditor key={map.id} map={map} onClose={() => window.close()} />
        ) : (
          <div className="mx-auto mt-28 max-w-md text-center text-hearth-muted">
            <div className="mb-4 text-5xl drop-shadow-[0_0_18px_rgba(224,138,60,0.45)]">⚔</div>
            <h2 className="mb-2 font-display text-2xl font-semibold text-hearth-text">The Table</h2>
            <p className="text-sm leading-relaxed">
              No battle maps yet. In the console, hit 🗺 on a scene image (or the TopBar 🗺 library)
              to create one — it appears here instantly.
            </p>
          </div>
        )}
      </div>

      {map &&
        (trackerOpen ? (
          <aside className="flex w-[340px] flex-none flex-col border-l border-hearth-border bg-hearth-panel/60">
            <div className="flex items-center gap-2 border-b border-hearth-border px-3 py-2">
              <span className="text-sm font-semibold text-hearth-text">⚔ Encounter</span>
              {campaign.maps.length > 1 ? (
                <select
                  value={map.id}
                  onChange={(e) => setMapId(e.target.value)}
                  title="Switch map (fights live on maps)"
                  className="min-w-0 flex-1 truncate rounded border border-hearth-border bg-hearth-panel2 px-1.5 py-0.5 text-xs text-hearth-text"
                >
                  {campaign.maps.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id === campaign.liveMapId ? '🔴 ' : ''}
                      {m.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="min-w-0 flex-1 truncate text-xs text-hearth-muted">on 🗺 {map.name}</span>
              )}
              <button
                onClick={() => setTrackerOpen(false)}
                title="Collapse the tracker"
                className="px-1 text-xs text-hearth-muted hover:text-hearth-ember"
              >
                ▸
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <EncounterPanel map={map} />
            </div>
          </aside>
        ) : (
          <button
            onClick={() => setTrackerOpen(true)}
            title="Show the encounter tracker"
            className="flex w-7 flex-none flex-col items-center gap-2 border-l border-hearth-border bg-hearth-panel pt-3 text-hearth-muted transition-colors hover:text-hearth-ember"
          >
            <span className="text-xs">◂</span>
            <span className="text-sm" aria-hidden>
              ⚔
            </span>
          </button>
        ))}

      <CompendiumPanel />
      <Toasts />
    </div>
  )
}
