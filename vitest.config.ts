import { defineConfig, mergeConfig, configDefaults } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    silent: true,
    reporters: [['default', { summary: true }]],
    // Live tests (tests/live/**) read real ~/.claude sessions and run only from
    // the pre-push hook (`npm run test:live`), never in CI. Exclude them here.
    exclude: [...configDefaults.exclude, 'tests/live/**'],
  },
}));
