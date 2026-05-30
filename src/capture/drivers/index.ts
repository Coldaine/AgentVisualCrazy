import { HarnessDriverRegistry } from './harness-driver';
import { claudeCodeDriver } from './claude-code';

export { HarnessDriverRegistry } from './harness-driver';
export type { HarnessDriver, HarnessCapabilities, RiskHeuristic } from './harness-driver';
export { claudeCodeDriver } from './claude-code';

/**
 * Singleton registry seeded with all in-tree drivers. Session-manager looks up
 * drivers by EventSource via `driverRegistry.getForSource(session.source)`.
 */
export const driverRegistry = new HarnessDriverRegistry().register(claudeCodeDriver);
