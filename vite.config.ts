import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built index.html loads under Electron's file:// protocol.
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: 'dist'
  },
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts']
  }
});
