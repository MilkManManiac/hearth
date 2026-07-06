import { useEffect, useRef, useState } from 'react'
import type { Scene } from '../../shared/types'
import { useStore } from '../store'
import { assetUrl } from '../lib/asset'

export default function ImageStrip({ scene }: { scene: Scene }) {
  const { presenting, showImage, clearImage, importSceneImages, removeImage, setImageCaption } =
    useStore()
  const images = scene.images ?? []
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
          {presenting && (
            <button onClick={clearImage} className="text-xs text-hearth-muted hover:text-hearth-ember">
              clear
            </button>
          )}
          <button
            onClick={importSceneImages}
            title="Import image files — copied into the campaign's art/ folder and added to this scene"
            className="rounded-full border border-hearth-border px-2 py-0.5 text-[11px] text-hearth-muted hover:border-hearth-ember hover:text-hearth-ember"
          >
            + Add image
          </button>
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
                {editing ? (
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
                  onClick={() => removeImage(img.file)}
                  title="Remove from this scene (the file stays in art/)"
                  className="absolute left-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[11px] text-hearth-text hover:bg-red-500/80 group-hover:flex"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
