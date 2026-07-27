/**
 * Bundle Electron main + preload with host/ingestion inlined.
 * host/ingestion is ESM + .ts extension imports; esbuild resolves them into CJS
 * for Electron's CommonJS main entry (package.json "main").
 */
import * as esbuild from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outdir = path.join(root, 'dist-electron')

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
}

await esbuild.build({
  ...shared,
  entryPoints: [path.join(__dirname, 'main.ts')],
  outfile: path.join(outdir, 'main.js'),
})

await esbuild.build({
  ...shared,
  entryPoints: [path.join(__dirname, 'preload.ts')],
  outfile: path.join(outdir, 'preload.js'),
})

console.log('[build:electron] wrote dist-electron/main.js + preload.js')
