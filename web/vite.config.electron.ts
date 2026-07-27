import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

/**
 * Electron renderer build — SPA (not IIFE lib mode).
 * base './' so production BrowserWindow.loadFile works from dist-web/.
 */
export default defineConfig(({ mode }) => ({
  root: resolve(__dirname),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname),
    },
  },
  publicDir: false,
  base: './',
  build: {
    outDir: resolve(__dirname, '../dist-web'),
    emptyOutDir: true,
    sourcemap: true,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    'process.env.NEXT_PUBLIC_DEMO': '"1"',
    'process.env.NEXT_PUBLIC_RELAY_PORT': '""',
    'process.env.AGENT_FLOW_STANDALONE': '"0"',
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
}))
