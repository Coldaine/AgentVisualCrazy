import { HarnessDriverRegistry } from './harness-driver';
import { claudeCodeDriver } from './claude-code';
import { cursorDriver } from './cursor';

export { HarnessDriverRegistry } from './harness-driver';
export type { HarnessDriver, HarnessCapabilities, RiskHeuristic } from './harness-driver';
export { claudeCodeDriver } from './claude-code';
export { cursorDriver } from './cursor';

/**
 * Singleton registry seeded with all in-tree drivers. Session-manager looks up
 * drivers by EventSource via `driverRegistry.getForSource(session.source)`.
 *
 * Registration order matters for getDefault(): Claude remains the default so
 * unknown sources and legacy fixtures keep their previous behavior.
 */
export const driverRegistry = new HarnessDriverRegistry()
  .register(claudeCodeDriver)
  .register(cursorDriver);
