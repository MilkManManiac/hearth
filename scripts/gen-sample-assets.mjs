// Generates placeholder audio + art into campaign-sample/ so the app is
// immediately runnable and the audio pipeline is verifiable without downloads.
// Loops use a 55 Hz fundamental family so they are seamless (integer cycles).
import { promises as fs } from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', 'campaign-sample')
const SR = 44100

function writeWav(samples) {
  const n = samples.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2)
  }
  return buf
}

// Seamless loop: duration = cycles/55 s, partials are integer multiples of 55.
function loop({ seconds = 6, partials, tremoloHz = 0, tremoloDepth = 0.3, gain = 0.5 }) {
  const n = Math.round(SR * seconds)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    let v = 0
    for (const [mult, amp, phase = 0] of partials) {
      v += amp * Math.sin(2 * Math.PI * 55 * mult * t + phase)
    }
    let trem = 1
    if (tremoloHz > 0) trem = 1 - tremoloDepth + tremoloDepth * (0.5 + 0.5 * Math.sin(2 * Math.PI * tremoloHz * t))
    out[i] = v * trem * gain
  }
  // normalize
  let peak = 0
  for (const s of out) peak = Math.max(peak, Math.abs(s))
  if (peak > 0) for (let i = 0; i < n; i++) out[i] = (out[i] / peak) * 0.85
  return out
}

// One-shot with exponential decay.
function oneShot({ seconds = 0.4, freq = 600, sweep = 0, noise = 0, decay = 12, gain = 0.8 }) {
  const n = Math.round(SR * seconds)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const env = Math.exp(-decay * t)
    const f = freq + sweep * t
    const tone = Math.sin(2 * Math.PI * f * t)
    const ns = noise ? (Math.sin(i * 12.9898) * 43758.5453 % 1) * 2 - 1 : 0
    out[i] = (tone * (1 - noise) + ns * noise) * env * gain
  }
  return out
}

function svg(title, from, to) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="1280" height="720" fill="url(#g)"/>
  <text x="640" y="370" font-family="Georgia, serif" font-size="64" fill="#f0e6d2"
    text-anchor="middle" opacity="0.9">${title}</text>
  <text x="640" y="430" font-family="system-ui" font-size="22" fill="#f0e6d2"
    text-anchor="middle" opacity="0.5">placeholder art</text>
</svg>`
}

const files = {
  'music/travel.wav': writeWav(
    loop({ partials: [[1, 0.5], [2, 0.5], [3, 0.35], [4, 0.2]], tremoloHz: 1, tremoloDepth: 0.2, gain: 0.5 })
  ),
  'music/combat.wav': writeWav(
    loop({ partials: [[2, 0.5], [3, 0.4], [4, 0.5], [6, 0.35], [8, 0.2]], tremoloHz: 4, tremoloDepth: 0.5, gain: 0.5 })
  ),
  'music/aftermath.wav': writeWav(
    loop({ partials: [[1, 0.6], [3, 0.3], [5, 0.18]], tremoloHz: 0.5, tremoloDepth: 0.25, gain: 0.5 })
  ),
  'ambience/forest.wav': writeWav(
    loop({
      partials: [[6, 0.15, 0.2], [7, 0.12, 1.1], [9, 0.1, 2.3], [11, 0.09, 0.7], [13, 0.08, 3.1], [17, 0.06, 1.9]],
      tremoloHz: 2, tremoloDepth: 0.4, gain: 0.6
    })
  ),
  'ambience/wind.wav': writeWav(
    loop({ partials: [[1, 0.4], [2, 0.25, 1.0], [3, 0.12, 2.0]], tremoloHz: 0.3, tremoloDepth: 0.5, gain: 0.5 })
  ),
  'sfx/shriek.wav': writeWav(oneShot({ seconds: 0.5, freq: 900, sweep: 1200, decay: 6, gain: 0.7 })),
  'sfx/snare.wav': writeWav(oneShot({ seconds: 0.25, freq: 200, noise: 0.8, decay: 20, gain: 0.8 })),
  'sfx/sword.wav': writeWav(oneShot({ seconds: 0.3, freq: 2400, sweep: -1800, noise: 0.5, decay: 18, gain: 0.7 })),
  'art/forest-road.svg': Buffer.from(svg('The Old Forest Road', '#2c3a25', '#0f1410')),
  'art/krag.svg': Buffer.from(svg('Krag the Vile', '#3a2020', '#140b0b'))
}

for (const [rel, data] of Object.entries(files)) {
  const dest = path.join(ROOT, rel)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.writeFile(dest, data)
  console.log('wrote', rel, `(${data.length} bytes)`)
}
console.log('done')
