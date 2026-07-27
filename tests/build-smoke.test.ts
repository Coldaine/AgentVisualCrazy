/**
 * Build-smoke test (PR #119 substrate).
 *
 * Runs `npm run build` as a subprocess and asserts the two build outputs that the
 * Electron shell depends on exist:
 *   - dist-web/index.html  (Vite renderer build, loaded by BrowserWindow.loadFile)
 *   - dist-electron/main.js (tsc-compiled Electron main, referenced by package.json "main")
 *
 * This is the foundation PR — if the build doesn't produce these artifacts, nothing
 * downstream can work. The test is slow (~60s) and excluded from the default `npm test`
 * run; invoke explicitly via `npm run test:build` or run it in CI after install.
 *
 * Skipped when AVC_SKIP_BUILD_SMOKE=1 (for offline / no-network dev).
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

const repoRoot = path.resolve(__dirname, '..')

function buildArtifactsExist(): boolean {
  return (
    fs.existsSync(path.join(repoRoot, 'dist-web', 'index.html')) &&
    fs.existsSync(path.join(repoRoot, 'dist-electron', 'main.js'))
  )
}

describe('build smoke', () => {
  it('npm run build produces dist-web/index.html and dist-electron/main.js', () => {
    if (process.env.AVC_SKIP_BUILD_SMOKE === '1') {
      console.log('[build-smoke] skipped (AVC_SKIP_BUILD_SMOKE=1)')
      return
    }

    // If artifacts already exist (e.g. CI ran build before tests), verify them
    // without rebuilding. Otherwise build fresh.
    if (!buildArtifactsExist()) {
      execFileSync('npm', ['run', 'build'], {
        cwd: repoRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        timeout: 120_000,
      })
    }

    expect(fs.existsSync(path.join(repoRoot, 'dist-web', 'index.html'))).toBe(true)
    expect(fs.existsSync(path.join(repoRoot, 'dist-electron', 'main.js'))).toBe(true)

    // main.js must be non-trivial — the Electron entry point.
    const mainStat = fs.statSync(path.join(repoRoot, 'dist-electron', 'main.js'))
    expect(mainStat.size).toBeGreaterThan(1000)

    // index.html must reference the built JS asset (Vite injects a <script>).
    const html = fs.readFileSync(path.join(repoRoot, 'dist-web', 'index.html'), 'utf8')
    expect(html).toMatch(/<script[^>]*src=["']\.\/assets\//)
  })
})
