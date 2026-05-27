import type {
  CanonicalEvent,
  ExportResult,
  PrivacyPolicy,
  SnapshotPayload,
  TranscriptPrivacySettings
} from '../shared/schema';

export type LiveEventSubscriber = (events: CanonicalEvent[]) => void;
export type UnsubscribeLiveEvents = () => void;

export interface ShadowAgentHost {
  loadInitialSnapshot(): Promise<SnapshotPayload>;
  loadLiveSnapshot?: () => Promise<SnapshotPayload | null>;
  subscribeLiveEvents?: (callback: LiveEventSubscriber) => UnsubscribeLiveEvents;
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
  canStreamLiveEvents: boolean;
  canLoadLiveSnapshot: boolean;
  canOpenReplayFile: boolean;
  canManagePrivacy: boolean;
  canExportReplayJsonl: boolean;
}

export function getHostCapabilities(host: ShadowAgentHost): ShadowAgentHostCapabilities {
  return {
    canStreamLiveEvents: typeof host.subscribeLiveEvents === 'function',
    canLoadLiveSnapshot: typeof host.loadLiveSnapshot === 'function',
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
