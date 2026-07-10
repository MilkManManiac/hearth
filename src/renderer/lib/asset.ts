/**
 * Build a URL for a campaign-relative file path. Electron windows use the
 * asset:// protocol; the browser-based player portal fetches the same file
 * over HTTP (/asset/<rel>, images only, served by playerServer).
 */
export function assetUrl(file: string): string {
  const rel = file.split('/').map(encodeURIComponent).join('/')
  const isElectron = typeof window !== 'undefined' && !!(window as { hearth?: unknown }).hearth
  return isElectron ? `asset:///${rel}` : `/asset/${rel}`
}
