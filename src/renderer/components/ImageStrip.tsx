import type { Scene } from '../../shared/types'
import { useStore } from '../store'
import { assetUrl } from '../lib/asset'

export default function ImageStrip({ scene }: { scene: Scene }) {
  const { presenting, showImage, clearImage, importSceneImages } = useStore()
  const images = scene.images ?? []

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
            return (
              <button
                key={img.file}
                onClick={() => showImage(img.file, img.caption)}
                className={`group relative overflow-hidden rounded-md border ${
                  active ? 'border-hearth-ember ring-1 ring-hearth-ember' : 'border-hearth-border'
                }`}
                title={img.caption ?? img.file}
              >
                <img
                  src={assetUrl(img.file)}
                  alt={img.caption ?? ''}
                  className="aspect-video w-full object-cover transition-transform group-hover:scale-105"
                />
                {img.caption && (
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-[11px] text-hearth-text">
                    {img.caption}
                  </span>
                )}
                {active && (
                  <span className="absolute right-1 top-1 rounded bg-hearth-ember px-1 text-[9px] font-semibold uppercase text-black">
                    live
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
