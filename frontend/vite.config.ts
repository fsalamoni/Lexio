import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:8000'
const backendWs = backendUrl.replace('http', 'ws')

// GitHub Pages deploys to /Lexio/ subpath
const isGHPages = process.env.GITHUB_PAGES === 'true' || process.env.NODE_ENV === 'production'

export default defineConfig({
  plugins: [react()],
  base: isGHPages ? '/Lexio/' : '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': backendUrl,
      '/ws': {
        target: backendWs,
        ws: true,
      },
      '/webhook': backendUrl,
    },
  },
})
