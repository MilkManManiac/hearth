import { useEffect, useState } from 'react'
import type { PresenterPayload } from '../../preload'
import { assetUrl } from '../lib/asset'

/**
 * Player-facing window (opened separately, screen-shareable in Phase 1).
 * Black background, one image + caption, cross-fades on change.
 */
export default function PresenterView() {
  const [payload, setPayload] = useState<PresenterPayload | null>(null)

  useEffect(() => {
    return window.hearth.onPresenterShow((p) => setPayload(p))
  }, [])

  const file = payload?.file ?? null

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-black text-white/70">
      {file ? (
        <>
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
        </>
      ) : (
        <div className="text-sm text-white/25">Waiting for the DM…</div>
      )}
      <style>{`@keyframes fade { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  )
}
