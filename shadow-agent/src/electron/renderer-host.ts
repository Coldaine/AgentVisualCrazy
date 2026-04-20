import type { ShadowAgentBridge } from '../shared/schema';
import { createBridgeHost, type ShadowAgentHost } from '../renderer/host';

export function getShadowAgentBridge(target: Window = window): ShadowAgentBridge {
  if (!target.shadowAgent) {
    throw new Error('Shadow Agent preload bridge is unavailable. Start the app via Electron main process.');
  }

  return target.shadowAgent;
}

export function createElectronHost(bridge: ShadowAgentBridge = getShadowAgentBridge()): ShadowAgentHost {
  return createBridgeHost(bridge);
}
