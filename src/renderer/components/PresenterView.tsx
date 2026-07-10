import { useEffect, useState } from 'react'
import type { PresenterPayload } from '../../preload'
import type { CampaignState } from '../../shared/types'
import { assetUrl } from '../lib/asset'
import { PresenterMap, playerTableView, usePings } from './MapEditor'

/**
 * Player-facing window. Two sources, by priority:
 * 1. A pushed IMAGE (handout/art) — interjections always win until cleared.
 * 2. The LIVE map (M1 live-follow): renders straight from campaign state, so
 *    zone toggles, token moves, and HP rings update in real time.
 * Legacy "📤 Send once" map pushes still render when nothing is live.
 */
export default function PresenterView() {
  const [payload, setPayload] = useState<PresenterPayload | null>(null)
  const [campaign, setCampaign] = useState<CampaignState | null>(null)
  const [pings, addPing] = usePings()

  useEffect(() => {
    return window.hearth.onPresenterShow((p) => setPayload(p))
  }, [])
  useEffect(() => {
    return window.hearth.onPresenterPing((p) => addPing(p))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    void window.hearth.getCampaign().then(setCampaign)
    return window.hearth.onCampaignChanged(setCampaign)
  }, [])

  const file = payload?.file ?? null
  const liveMap = campaign?.maps.find((m) => m.id === campaign.liveMapId) ?? null

  // 1. Pushed image (no map payload) — the DM is showing a handout.
  if (file && !payload?.map) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-black text-white/70">
        <img
          key={file}
          src={assetUrl(file)}
          alt={payload?.caption ?? ''}
          className="max-h-[92vh] max-w-[96vw] object-contain animate-[fade_400ms_ease]"
        />
        {payload?.caption && (
          <div className="pointer-events-none absolute bottom-6 rounded bg-black/60 px-4 py-2 text-lg tracking-wide">
            {payload.caption}
          </div>
        )}
        <style>{`@keyframes fade { from { opacity: 0 } to { opacity: 1 } }`}</style>
      </div>
    )
  }

  // 2. Live map — the table follows it in real time.
  if (liveMap && liveMap.image) {
    const pv = playerTableView(liveMap, campaign?.characters ?? [])
    return (
      <div className="h-full w-full bg-black">
        <PresenterMap
          file={liveMap.image}
          strokes={liveMap.strokes}
          zones={liveMap.zones}
          tokens={liveMap.tokens}
          grid={liveMap.grid}
          overlays={liveMap.overlays}
          decor={pv.decor}
          initiative={pv.initiative}
          pings={pings}
        />
      </div>
    )
  }

  // 3. Legacy one-shot map push.
  if (file && payload?.map) {
    return (
      <div className="h-full w-full bg-black">
        <PresenterMap
          file={file}
          strokes={payload.map.strokes}
          zones={payload.map.zones}
          tokens={payload.map.tokens}
          grid={payload.map.grid}
          overlays={payload.map.overlays}
          decor={payload.map.decor}
          initiative={payload.map.initiative}
          pings={pings}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-black">
      <div className="text-sm text-white/25">Waiting for the DM…</div>
    </div>
  )
}
