/**
 * Build a URL for a campaign-relative file path. Electron windows use the
 * asset:// protocol; the browser-based player portal fetches the same file
 * over HTTP (/asset/<rel>, images only, served by playerServer — which now
 * requires the portal key on every campaign-data request).
 */
export function assetUrl(file: string): string {
  const rel = file.split('/').map(encodeURIComponent).join('/')
  const isElectron = typeof window !== 'undefined' && !!(window as { hearth?: unknown }).hearth
  if (isElectron) return `asset:///${rel}`
  const key = portalKey()
  return `/asset/${rel}${key ? `?key=${key}` : ''}`
}

/**
 * The portal key from the player link (?key=...) — remembered in
 * localStorage so bookmarks without the query still work. Empty string in
 * Electron (the DM app never needs it).
 */
export function portalKey(): string {
  if (typeof window === 'undefined' || (window as { hearth?: unknown }).hearth) return ''
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('key')
    if (fromUrl) {
      localStorage.setItem('hearth:portalKey', fromUrl)
      return fromUrl
    }
    return localStorage.getItem('hearth:portalKey') ?? ''
  } catch {
    return ''
  }
}
