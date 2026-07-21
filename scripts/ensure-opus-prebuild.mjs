// @discordjs/opus ships N-API prebuilds, but only named for Node ABIs ≤ v127
// (Node 22) — on newer Node its installer 404s and falls back to a source
// compile that fails without Visual Studio. Because N-API binaries are
// ABI-stable, the v127 win32-x64 binary works fine on Node 24 AND inside
// Electron; it just has to sit in the directory name the runtime looks up.
// This postinstall downloads that prebuild once and copies it into the dirs
// for the dev Node ABI and the Electron ABI. No-ops when already in place or
// when @discordjs/opus didn't install (it's an optionalDependency — the app
// then falls back to opusscript, slower but functional).
import { existsSync, mkdirSync, copyFileSync, readFileSync } from 'fs'
import { execSync } from 'child_process'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgDir = join(root, 'node_modules', '@discordjs', 'opus')
if (!existsSync(pkgDir)) {
  console.log('[opus-prebuild] @discordjs/opus not installed — skipping (opusscript fallback)')
  process.exit(0)
}

if (process.platform !== 'win32' || process.arch !== 'x64') {
  console.log('[opus-prebuild] non win32-x64 platform — skipping')
  process.exit(0)
}

const VERSION = '0.10.0'
const SRC_ABI = '127' // newest published win32-x64 prebuild
const dirFor = (abi) => join(pkgDir, 'prebuild', `node-v${abi}-napi-v3-win32-x64-unknown-unknown`)

// Dev Node ABI + the Electron ABI from the installed electron package.
const abis = new Set([process.versions.modules])
try {
  const dist = join(root, 'node_modules', 'electron', 'dist', 'version')
  const electronVersion = readFileSync(dist, 'utf-8').trim()
  const releases = JSON.parse(
    execSync(`curl -sL https://releases.electronjs.org/releases.json`, { maxBuffer: 64 * 1024 * 1024 }).toString()
  )
  const rel = releases.find((r) => r.version === electronVersion)
  if (rel?.modules) abis.add(String(rel.modules))
} catch {
  console.warn('[opus-prebuild] could not resolve Electron ABI — dev ABI only')
}
abis.add(SRC_ABI)

const missing = [...abis].filter((abi) => !existsSync(join(dirFor(abi), 'opus.node')))
if (missing.length === 0) {
  console.log('[opus-prebuild] all prebuilds present')
  process.exit(0)
}

// Fetch (or reuse) the source binary.
let srcBinary = join(dirFor(SRC_ABI), 'opus.node')
if (!existsSync(srcBinary)) {
  const url = `https://github.com/discordjs/opus/releases/download/v${VERSION}/opus-v${VERSION}-node-v${SRC_ABI}-napi-v3-win32-x64-unknown-unknown.tar.gz`
  const tmp = join(tmpdir(), `djsopus-${VERSION}`)
  mkdirSync(tmp, { recursive: true })
  const tgz = join(tmp, 'opus.tar.gz')
  console.log('[opus-prebuild] downloading', url)
  execSync(`curl -sL -o "${tgz}" "${url}"`)
  execSync(`tar -xzf "${tgz}" -C "${tmp}"`)
  srcBinary = join(tmp, `node-v${SRC_ABI}-napi-v3-win32-x64-unknown-unknown`, 'opus.node')
}

for (const abi of missing) {
  const d = dirFor(abi)
  mkdirSync(d, { recursive: true })
  copyFileSync(srcBinary, join(d, 'opus.node'))
  console.log('[opus-prebuild] placed opus.node for ABI', abi)
}
