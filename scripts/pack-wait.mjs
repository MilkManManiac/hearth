// Waits for Hearth.exe to exit, then runs `npm run pack` — kills the EBUSY
// papercut where packaging fails while the app is open. Windows can hold file
// locks for a few seconds after exit (and the DM may relaunch mid-pack), so:
// grace delay, re-check before every attempt, retry with backoff.
import { execSync, spawnSync } from 'node:child_process'

const running = () => {
  const out = spawnSync('tasklist', ['/FI', 'IMAGENAME eq Hearth.exe', '/NH'], { encoding: 'utf8' })
  return /Hearth\.exe/i.test(out.stdout ?? '')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const waitForClose = async () => {
  if (running()) console.log('Hearth is running — waiting for it to close…')
  while (running()) await sleep(5000)
}

for (let attempt = 1; attempt <= 4; attempt++) {
  await waitForClose()
  // Grace period: let Windows/Defender release handles on win-unpacked.
  await sleep(8000)
  if (running()) continue // relaunched during the grace period — wait again
  try {
    console.log(`Packing (attempt ${attempt})…`)
    execSync('npm run pack', { stdio: 'inherit' })
    console.log(`REPACK DONE at ${new Date().toLocaleString()}`)
    process.exit(0)
  } catch {
    console.log(`Pack attempt ${attempt} failed (EBUSY or relaunch) — retrying…`)
    await sleep(15000)
  }
}
console.error('Gave up after 4 attempts — run `npm run pack` manually with Hearth closed.')
process.exit(1)
