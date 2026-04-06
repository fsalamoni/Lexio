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
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@tiptap') || id.includes('prosemirror')) {
            return 'tiptap'
          }
          if (id.includes('node_modules/recharts')) {
            return 'recharts-core'
          }
          if (id.includes('node_modules/d3-')) {
            return 'recharts-d3'
          }
          if (id.includes('node_modules/firebase/auth')) {
            return 'firebase-auth'
          }
          if (id.includes('node_modules/firebase/firestore')) {
            return 'firebase-firestore'
          }
          if (id.includes('node_modules/firebase/app')) {
            return 'firebase-core'
          }
          if (id.includes('node_modules/firebase')) {
            return 'firebase-other'
          }
          if (id.includes('node_modules/docx')) {
            return 'docx-lib'
          }
          if (id.includes('node_modules/jszip')) {
            return 'zip-lib'
          }
          if (id.includes('node_modules/mammoth')) {
            return 'mammoth-lib'
          }
          if (id.includes('node_modules/pdfjs-dist')) {
            return 'pdfjs-lib'
          }
          if (id.includes('node_modules/file-saver')) {
            return 'file-save-lib'
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons'
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
  test: {
    // Polyfill Promise.withResolvers and other modern APIs before tests run.
    // pdfjs-dist requires Promise.withResolvers (Node ≥ 22); the polyfill
    // keeps tests green on older Node versions too.
    setupFiles: ['./src/test-setup.ts'],
  },
})
