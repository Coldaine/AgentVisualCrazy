import type { HarnessDriver } from './harness-driver';
import { claudeCodeDriver } from './claude-code';

export type { HarnessDriver, HarnessCapabilities, HarnessDiscovery, HarnessAdapter, HarnessNormalizer } from './harness-driver';
export { claudeCodeDriver } from './claude-code';

class HarnessDriverRegistry {
  private drivers = new Map<string, HarnessDriver>();

  constructor() {
    this.register(claudeCodeDriver);
  }

  register(driver: HarnessDriver): void {
    this.drivers.set(driver.id, driver);
  }

  get(id: string): HarnessDriver | undefined {
    return this.drivers.get(id);
  }

  getDefault(): HarnessDriver {
    return this.get('claude-code')!;
  }

  list(): HarnessDriver[] {
    return Array.from(this.drivers.values());
  }
}

export const harnessDriverRegistry = new HarnessDriverRegistry();
