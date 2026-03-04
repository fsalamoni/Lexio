import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:8000'
const backendWs = backendUrl.replace('http', 'ws')

export default defineConfig({
  plugins: [react()],
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
