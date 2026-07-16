import { useEffect, useRef, useState } from 'react'
import type { Scene } from '../../shared/types'
import { useStore } from '../store'
import { assetUrl } from '../lib/asset'

export default function ImageStrip({ scene }: { scene: Scene }) {
  const { presenting, showImage, clearImage, importSceneImages, removeImage, setImageCaption } =
    useStore()
  const buildMode = useStore((s) => s.uiMode === 'build')
  const maps = useStore((s) => s.campaign.maps)
  const createMap = useStore((s) => s.createMap)
  const setMapsOpen = useStore((s) => s.setMapsOpen)
  const images = scene.images ?? []

  /** Open this image's library map in the ⚔ Table window — creating it on first use (M1/M3). */
  const openAsMap = async (file: string) => {
    const existing = maps.find((m) => m.image === file)
    if (existing) {
      void window.hearth.openWindow('table', { mapId: existing.id })
      return
    }
    const stem = file.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'map'
    const id = await createMap(stem.replace(/[-_]+/g, ' '), file)
    if (id) void window.hearth.openWindow('table', { mapId: id })
  }
  // Inline caption editing: which image file is being edited + the draft text.
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const captionRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingFile) captionRef.current?.select()
  }, [editingFile])

  const commitCaption = (): void => {
    if (editingFile) setImageCaption(editingFile, draft)
    setEditingFile(null)
  }

  return (
    <section className="flex flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-hearth-muted">Images</h3>
        <div className="flex items-center gap-2">
          {maps.length > 0 && (
            <button
              onClick={() => setMapsOpen(true)}
              title="Open the map library (prep tabs; one map is live for the players)"
              className="rounded-full border border-hearth-ember/60 bg-hearth-ember/10 px-2 py-0.5 text-[11px] text-hearth-ember hover:bg-hearth-ember/25"
            >
              🗺 Maps {maps.length}
            </button>
          )}
          {presenting && (
            <button onClick={clearImage} className="text-xs text-hearth-muted hover:text-hearth-ember">
              clear
            </button>
          )}
          {buildMode && (
            <button
              onClick={importSceneImages}
              title="Import image files — copied into the campaign's art/ folder and added to this scene"
              className="rounded-full border border-hearth-border px-2 py-0.5 text-[11px] text-hearth-muted hover:border-hearth-ember hover:text-hearth-ember"
            >
              + Add image
            </button>
          )}
        </div>
      </div>
      {images.length === 0 ? (
        <p className="text-xs text-hearth-muted">
          No images in this scene — click <span className="text-hearth-ember">+ Add image</span> to import maps or handouts.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {images.map((img) => {
            const active = presenting?.file === img.file
            const editing = editingFile === img.file
            return (
              <div
                key={img.file}
                className={`group relative overflow-hidden rounded-md border ${
                  active ? 'border-hearth-ember ring-1 ring-hearth-ember' : 'border-hearth-border'
                }`}
              >
                <button
                  onClick={() => showImage(img.file, img.caption)}
                  className="block w-full"
                  title={img.caption ?? img.file}
                >
                  <img
                    src={assetUrl(img.file)}
                    alt={img.caption ?? ''}
                    className="aspect-video w-full object-cover transition-transform group-hover:scale-105"
                  />
                </button>
                {!buildMode ? (
                  img.caption && (
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-[11px] text-hearth-text">
                      {img.caption}
                    </span>
                  )
                ) : editing ? (
                  <input
                    ref={captionRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitCaption}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') commitCaption()
                      if (e.key === 'Escape') setEditingFile(null)
                    }}
                    placeholder="caption…"
                    className="absolute inset-x-0 bottom-0 border-0 bg-black/80 px-1.5 py-0.5 text-[11px] text-hearth-text focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setDraft(img.caption ?? '')
                      setEditingFile(img.file)
                    }}
                    title="Edit caption"
                    className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-left text-[11px] text-hearth-text opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                    style={img.caption ? { opacity: 1 } : undefined}
                  >
                    {img.caption ?? <span className="text-hearth-muted">＋ caption</span>}
                  </button>
                )}
                {active && (
                  <span className="absolute right-1 top-1 rounded bg-hearth-ember px-1 text-[9px] font-semibold uppercase text-black">
                    live
                  </span>
                )}
                <button
                  onClick={() => void openAsMap(img.file)}
                  title={
                    maps.some((m) => m.image === img.file)
                      ? 'Open this image\'s battle map (in the library)'
                      : 'Add to the map library as a fog-of-war battle map'
                  }
                  className={`absolute bottom-6 right-1 flex h-5 items-center justify-center rounded-full px-1.5 text-[10px] ${
                    maps.some((m) => m.image === img.file)
                      ? 'flex bg-hearth-ember/90 text-black'
                      : 'hidden bg-black/60 text-hearth-text hover:bg-hearth-ember/80 hover:text-black group-hover:flex'
                  }`}
                >
                  🗺
                </button>
                {buildMode && (
                  <button
                    onClick={() => removeImage(img.file)}
                    title="Remove from this scene (the file stays in art/)"
                    className="absolute left-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[11px] text-hearth-text hover:bg-red-500/80 group-hover:flex"
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
