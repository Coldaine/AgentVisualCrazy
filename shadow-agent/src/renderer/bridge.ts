import type { ShadowAgentBridge } from '../shared/schema';

export function getShadowAgentBridge(): ShadowAgentBridge {
  if (typeof window === 'undefined' || !window.shadowAgent) {
    throw new Error('Shadow Agent preload bridge is unavailable. Start the app via Electron main process.');
  }
  return window.shadowAgent;
}
