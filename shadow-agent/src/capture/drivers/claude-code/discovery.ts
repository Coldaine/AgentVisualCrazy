import type { HarnessDiscovery } from '../harness-driver';
import { discoverActiveSession } from '../../session-discovery';
import type { DiscoveredSession } from '../../session-discovery';

export const claudeCodeDiscovery: HarnessDiscovery = {
  async discoverActiveSession(overridePath?: string): Promise<DiscoveredSession | null> {
    return discoverActiveSession(overridePath);
  }
};
