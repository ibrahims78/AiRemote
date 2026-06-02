import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5000,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3001', ws: true, changeOrigin: true },
      '/ssh': { target: 'ws://localhost:3001', ws: true, changeOrigin: true },
      '/pty':    { target: 'ws://localhost:3001', ws: true, changeOrigin: true },
      '/screen': { target: 'ws://localhost:3001', ws: true, changeOrigin: true }
    }
  }
})
