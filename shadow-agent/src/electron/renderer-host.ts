import type { ShadowAgentBridge } from '../shared/schema';
import type { ShadowAgentHost } from '../renderer/host';

export function getShadowAgentBridge(target: Window = window): ShadowAgentBridge {
  if (!target.shadowAgent) {
    throw new Error('Shadow Agent preload bridge is unavailable. Start the app via Electron main process.');
  }

  return target.shadowAgent;
}

export function createElectronHost(bridge: ShadowAgentBridge = getShadowAgentBridge()): ShadowAgentHost {
  return {
    loadInitialSnapshot: () => bridge.bootstrap(),
    loadLiveSnapshot: () => bridge.getLiveSnapshot(),
    subscribeLiveEvents: (callback) => bridge.onLiveEvents(callback),
    openReplayFile: () => bridge.openReplayFile(),
    getPrivacyPolicy: () => bridge.getPrivacyPolicy(),
    updatePrivacySettings: (updates) => bridge.updatePrivacySettings(updates),
    exportReplayJsonl: (events, suggestedFileName, options) =>
      options === undefined
        ? bridge.exportReplayJsonl(events, suggestedFileName)
        : bridge.exportReplayJsonl(events, suggestedFileName, options)
  };
}
