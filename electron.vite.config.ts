import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Baked in at build time so the TopBar can show which build is running —
// lets the DM confirm the desktop shortcut isn't launching a stale pack.
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))
const BUILD_STAMP = JSON.stringify(
  `v${pkg.version} · ${new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })}`
)

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: '.',
    define: { __BUILD_STAMP__: BUILD_STAMP },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
          // The player portal page, served to browsers by src/main/playerServer.ts.
          player: resolve(__dirname, 'player.html')
        }
      }
    },
    plugins: [react()]
  }
})
