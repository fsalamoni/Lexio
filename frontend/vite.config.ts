import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:8000'
const backendWs = backendUrl.replace('http', 'ws')
const isDemo = process.env.VITE_DEMO_MODE === 'true'
// VITE_BASE_PATH overrides the isDemo default.
// GitHub Pages sets it to /Lexio/ ; Firebase Hosting sets it to /
const basePath = process.env.VITE_BASE_PATH ?? (isDemo ? '/Lexio/' : '/')

export default defineConfig({
  base: basePath,
  plugins: [react()],
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@tiptap') || id.includes('prosemirror')) {
            return 'tiptap'
          }
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'recharts'
          }
        },
      },
    },
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
