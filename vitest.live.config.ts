import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/**
 * Config for LIVE tests only (tests/live/**). These read real local ~/.claude
 * sessions through the real pipeline and run from the pre-push hook, never CI.
 * Run with: npm run test:live
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['tests/live/**/*.test.ts'],
      reporters: [['default', { summary: false }]],
    },
  })
);
