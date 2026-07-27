import { defineConfig } from 'vitest/config'

/**
 * Root vitest config for the substrate PR (PR #119).
 * Host-package suites (host/ingestion, host/curator, host/mcp) arrive in later PRs
 * and carry their own vitest configs; the root `npm test` chains them via npm scripts.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/build-smoke.test.ts'],
    environment: 'node',
  },
})
