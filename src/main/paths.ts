import path from 'node:path'

/**
 * Path-containment guard: true when `target` resolves to a location strictly
 * inside `root` (pass `allowRoot` to accept root itself). The one place the
 * "resolve + startsWith(root + sep)" idiom lives — every escape-the-campaign
 * check in main goes through here.
 */
export function isInside(root: string, target: string, allowRoot = false): boolean {
  const r = path.resolve(root)
  const t = path.resolve(target)
  return t.startsWith(r + path.sep) || (allowRoot && t === r)
}
