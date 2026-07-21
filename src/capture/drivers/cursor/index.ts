import type { HarnessDriver } from '../harness-driver';
import { cursorCapabilities } from './capabilities';
import { normalizeEntry } from './normalizer';
import { cursorDiscovery } from './discovery';

export const cursorDriver: HarnessDriver = {
  id: 'cursor',
  sources: ['cursor-hook', 'cursor-agent-trace'],
  capabilities: cursorCapabilities,
  normalizeEntry,
  discovery: cursorDiscovery,
};

export { cursorCapabilities, cursorToolNameMap } from './capabilities';
export { normalizeEntry as normalizeCursorEntry } from './normalizer';
export { createCursorDiscovery, cursorDiscovery } from './discovery';
