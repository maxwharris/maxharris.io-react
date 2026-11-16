import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

// https://vite.dev/config/
export default defineConfig(async ({ command }) => ({
  plugins: [
    react(),
    // RADIO_MOCK=1 npm run dev: the radio's catalog routes answered here with short test songs (scripts/radio-mock.js).
    // Loaded only by the dev server with that set, so none of it can reach a build.
    command === 'serve' && process.env.RADIO_MOCK === '1' && (await import('./scripts/radio-mock.js')).radioMock(),
  ].filter(Boolean),
  build: {
    rollupOptions: {
      // three pages: the desktop; the radio on its own at /radio/ (REL pops it out); and /radio/embed/, the radio for
      // Max's stream (an OBS browser source). Neither radio page loads any desktop code.
      input: { main: here('./index.html'), radio: here('./radio/index.html'), embed: here('./radio/embed/index.html') },
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.names?.[0]?.endsWith('.mjs')) {
            return 'assets/[name]-[hash].js'
          }
          return 'assets/[name]-[hash][extname]'
        }
      }
    }
  },
  server: {
    host: true,
    port: 5173,
    // the contact form and /share talk to the express server in server/ (npm start there, port 3001)
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      // the radio reads the catalog's public radio routes: the live site, or CATALOG_API (RADIO_MOCK=1 answers locally)
      '/catalog/api': { target: process.env.CATALOG_API || 'https://maxharris.io', changeOrigin: true },
    },
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: [
      'maxharris.io',
      'www.maxharris.io',
      'localhost',
      '.maxharris.io'
    ]
  }
}))
