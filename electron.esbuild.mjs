import { build } from 'esbuild';

await build({
  entryPoints: ['src/electron/main.ts', 'src/electron/preload.ts'],
  outdir: 'dist-electron',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: true,
  outExtension: { '.js': '.cjs' }
});
