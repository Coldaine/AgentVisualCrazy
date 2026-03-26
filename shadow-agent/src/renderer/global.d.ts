import type { ShadowAgentBridge } from '../shared/schema';

declare global {
  interface Window {
    shadowAgent: ShadowAgentBridge;
  }
}

export {};
