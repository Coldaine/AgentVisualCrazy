import type {
  CanonicalEvent,
  ExportResult,
  PrivacyPolicy,
  ShadowAgentBridge,
  SnapshotPayload,
  TranscriptPrivacySettings
} from '../shared/schema';

export interface ShadowAgentHost {
  loadInitialSnapshot(): Promise<SnapshotPayload>;
  openReplayFile?: () => Promise<SnapshotPayload | null>;
  getPrivacyPolicy?: () => Promise<PrivacyPolicy>;
  updatePrivacySettings?: (updates: Partial<TranscriptPrivacySettings>) => Promise<PrivacyPolicy>;
  exportReplayJsonl?: (
    events: CanonicalEvent[],
    suggestedFileName?: string,
    options?: { storeRawTranscript?: boolean }
  ) => Promise<ExportResult>;
}

export interface ShadowAgentHostCapabilities {
  canOpenReplayFile: boolean;
  canManagePrivacy: boolean;
  canExportReplayJsonl: boolean;
}

export function getHostCapabilities(host: ShadowAgentHost): ShadowAgentHostCapabilities {
  return {
    canOpenReplayFile: typeof host.openReplayFile === 'function',
    canManagePrivacy:
      typeof host.getPrivacyPolicy === 'function' &&
      typeof host.updatePrivacySettings === 'function',
    canExportReplayJsonl: typeof host.exportReplayJsonl === 'function'
  };
}

export function createStaticHost(snapshot: SnapshotPayload): ShadowAgentHost {
  return {
    loadInitialSnapshot: async () => snapshot
  };
}

export function createBridgeHost(bridge: ShadowAgentBridge): ShadowAgentHost {
  return {
    loadInitialSnapshot: () => bridge.bootstrap(),
    openReplayFile: bridge.openReplayFile,
    getPrivacyPolicy: bridge.getPrivacyPolicy,
    updatePrivacySettings: bridge.updatePrivacySettings,
    exportReplayJsonl: bridge.exportReplayJsonl
  };
}
