import type { HarnessDriver } from '../harness-driver';
import { claudeCodeCapabilities } from './capabilities';
import { normalizeEntry } from './normalizer';
import { claudeCodeDiscovery } from './discovery';

export const claudeCodeDriver: HarnessDriver = {
  id: 'claude-code',
  sources: ['claude-transcript', 'claude-hook'],
  capabilities: claudeCodeCapabilities,
  normalizeEntry,
  discovery: claudeCodeDiscovery,
};
