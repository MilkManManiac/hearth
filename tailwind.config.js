/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
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
      }
    }
  },
  plugins: []
}
