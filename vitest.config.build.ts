import { defineConfig } from 'vitest/config'

/**
 * Vitest config for the slow build-smoke suite. Invoked via `npm run test:build`.
 * Kept separate from the default vitest.config.ts so `npm test` stays fast.
 */
export default defineConfig({
  test: {
    include: ['tests/build-smoke.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
})
