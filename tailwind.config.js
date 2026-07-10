/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './player.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        hearth: {
          bg: '#14110f',
          panel: '#1e1a17',
          panel2: '#272220',
          border: '#3a332e',
          text: '#e8e0d5',
          muted: '#a89b8c',
          ember: '#e08a3c',
          emberdim: '#8a5426',
          gold: '#d8b26a'
        }
      },
      fontFamily: {
        // A warm rulebook/tome serif for titles + read-aloud, using fonts
        // shipped with the OS (no network fetch in a packaged Electron app).
        display: ['Cambria', 'Georgia', '"Palatino Linotype"', '"Book Antiqua"', 'serif']
      },
      boxShadow: {
        // Soft depth so panels read as physical cards on the dark board.
        card: '0 1px 2px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.25)',
        // Ember glow for the active/now-playing element.
        ember: '0 0 0 1px rgba(224, 138, 60, 0.5), 0 0 16px -2px rgba(224, 138, 60, 0.45)'
      },
      keyframes: {
        // Gentle breathing glow for "live" indicators — a banked ember, not a blink.
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' }
        }
      },
      animation: {
        flicker: 'flicker 2.4s ease-in-out infinite'
      }
    }
  },
  plugins: []
}
