/** Build an asset:/// URL for a campaign-relative file path. */
export function assetUrl(file: string): string {
  return `asset:///${file.split('/').map(encodeURIComponent).join('/')}`
}
