import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    include: ['web/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./tests/dom-setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.join(root, 'web'),
      '@agent-flow': path.join(root, 'extension/src'),
      '@agentvisualcrazy/ingestion': path.join(root, 'host/ingestion/src/index.ts'),
    },
  },
})
