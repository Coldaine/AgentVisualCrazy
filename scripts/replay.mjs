#!/usr/bin/env node
/**
 * `npm run replay` shim. The replay CLI is TypeScript (scripts/replay.ts) and
 * the repo has no standalone TS runner, but it *does* ship esbuild (used by the
 * Electron build). So we bundle the CLI on the fly to a temp ESM file — keeping
 * node_modules external — and import it. process.argv is preserved, so the
 * bundled CLI parses flags exactly as if run directly.
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, 'replay.ts');
const outDir = mkdtempSync(join(tmpdir(), 'shadow-replay-cli-'));
const outFile = join(outDir, 'replay.mjs');

try {
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
    outfile: outFile,
    logLevel: 'warning',
  });
  await import(pathToFileURL(outFile).href);
} finally {
  // The bundled CLI may call process.exit(); a 'exit' hook guarantees cleanup.
  process.on('exit', () => {
    try {
      rmSync(outDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });
}
