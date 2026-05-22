import type { HarnessDriver } from '../harness-driver';
import { claudeCodeCapabilities } from './capabilities';
import { claudeCodeDiscovery } from './discovery';
import { claudeCodeAdapter } from './adapter';
import { claudeCodeNormalizer } from './normalizer';

export const claudeCodeDriver: HarnessDriver = {
  id: 'claude-code',
  displayName: 'Claude Code',
  eventSource: 'claude-transcript',
  capabilities: claudeCodeCapabilities,
  discovery: claudeCodeDiscovery,
  adapter: claudeCodeAdapter,
  normalizer: claudeCodeNormalizer
};

export { claudeCodeCapabilities } from './capabilities';
export { claudeCodeDiscovery } from './discovery';
export { claudeCodeAdapter } from './adapter';
export { claudeCodeNormalizer } from './normalizer';
