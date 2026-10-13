import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
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
})
