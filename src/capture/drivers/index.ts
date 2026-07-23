import { HarnessDriverRegistry } from './harness-driver';
import { claudeCodeDriver } from './claude-code';
import { codexDriver } from './codex';

export { HarnessDriverRegistry } from './harness-driver';
export type { HarnessDriver, HarnessCapabilities, RiskHeuristic } from './harness-driver';
export { claudeCodeDriver } from './claude-code';
export { codexDriver } from './codex';

/**
 * Singleton registry seeded with all in-tree drivers. Session-manager looks up
 * drivers by EventSource via `driverRegistry.getForSource(session.source)`.
 * claude-code is registered first so it remains the default driver
 * (`getDefault()`) — unchanged behavior for sessions with no source match.
 */
export const driverRegistry = new HarnessDriverRegistry()
  .register(claudeCodeDriver)
  .register(codexDriver);
