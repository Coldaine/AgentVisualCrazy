import type { HarnessDriver } from '../harness-driver';
import { codexCapabilities } from './capabilities';
import { normalizeEntry } from './normalizer';
import { codexDiscovery } from './discovery';

export const codexDriver: HarnessDriver = {
  id: 'codex',
  sources: ['codex-rollout'],
  capabilities: codexCapabilities,
  normalizeEntry,
  discovery: codexDiscovery,
};
