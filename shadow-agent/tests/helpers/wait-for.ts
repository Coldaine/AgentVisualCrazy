/**
 * Shared async polling for integration tests. Prefer event-driven assertions when possible.
 * Default timeout matches transport suite budget (4s) documented in plan-testing-observability.md.
 */
import { vi } from 'vitest';

export async function waitFor(
  assertion: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 4_000, interval = 20 } = options;
  await vi.waitFor(
    async () => {
      if (!(await assertion())) {
        throw new Error('waitFor: condition not met yet');
      }
    },
    { timeout, interval }
  );
}
