import type { CanonicalEvent, ExportResult, ShadowAgentBridge, SnapshotPayload } from '../shared/schema';

export interface ShadowAgentHost {
  loadInitialSnapshot(): Promise<SnapshotPayload>;
  openReplayFile?: () => Promise<SnapshotPayload | null>;
  exportReplayJsonl?: (
    events: CanonicalEvent[],
    suggestedFileName?: string,
    options?: { storeRawTranscript?: boolean }
  ) => Promise<ExportResult>;
}

export interface ShadowAgentHostCapabilities {
  canOpenReplayFile: boolean;
  canExportReplayJsonl: boolean;
}

export function getHostCapabilities(host: ShadowAgentHost): ShadowAgentHostCapabilities {
  return {
    canOpenReplayFile: typeof host.openReplayFile === 'function',
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
    exportReplayJsonl: bridge.exportReplayJsonl
  };
}
