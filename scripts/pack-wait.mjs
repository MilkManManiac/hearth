// Waits for Hearth.exe to exit, then runs `npm run pack` — kills the EBUSY
// papercut where packaging fails while the app is open.
import { execSync, spawnSync } from 'node:child_process'

const running = () => {
  const out = spawnSync('tasklist', ['/FI', 'IMAGENAME eq Hearth.exe', '/NH'], { encoding: 'utf8' })
  return /Hearth\.exe/i.test(out.stdout ?? '')
}

if (running()) console.log('Hearth is running — waiting for it to close…')
while (running()) await new Promise((r) => setTimeout(r, 5000))
console.log('Hearth closed — packing.')
execSync('npm run pack', { stdio: 'inherit' })
