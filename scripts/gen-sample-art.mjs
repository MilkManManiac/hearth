// Regenerates the placeholder art SVGs in campaign-sample/art/.
// (Sample audio is real CC0 files from OpenGameArt — see campaign-sample/CREDITS.md.)
import { promises as fs } from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ART = path.resolve(__dirname, '..', 'campaign-sample', 'art')

function linear(title, from, to, ink = '#f0e6d2') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="1280" height="720" fill="url(#g)"/>
  <text x="640" y="370" font-family="Georgia, serif" font-size="60" fill="${ink}" text-anchor="middle" opacity="0.9">${title}</text>
  <text x="640" y="430" font-family="system-ui" font-size="22" fill="${ink}" text-anchor="middle" opacity="0.5">placeholder art</text>
</svg>`
}

const files = {
  'forest-road.svg': linear('The Old Forest Road', '#2c3a25', '#0f1410'),
  'krag.svg': linear('Krag the Vile', '#3a2020', '#140b0b'),
  'crypt.svg': linear('The Sunken Crypt', '#1a2230', '#070a0f', '#cdd6e6'),
  'altar.svg': linear('The Bone Altar', '#3a2f4a', '#0a0710', '#e6d8f0')
}

await fs.mkdir(ART, { recursive: true })
for (const [name, data] of Object.entries(files)) {
  await fs.writeFile(path.join(ART, name), data)
  console.log('wrote art/' + name)
}
console.log('done')
