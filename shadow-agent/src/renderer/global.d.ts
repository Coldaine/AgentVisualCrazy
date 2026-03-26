import type { CanonicalEvent, DerivedState, SessionRecord } from '../shared/schema';

interface LoadedSource {
  kind: 'fixture' | 'replay' | 'transcript';
  label: string;
  path?: string;
}

interface SnapshotPayload {
  source: LoadedSource;
  record: SessionRecord;
  state: DerivedState;
  events: CanonicalEvent[];
}

interface ExportResult {
  canceled: boolean;
  filePath?: string;
  error?: string;
}

declare global {
  interface Window {
    shadowAgent: {
      bootstrap: () => Promise<SnapshotPayload>;
      openReplayFile: () => Promise<SnapshotPayload | null>;
      exportReplayJsonl: (events: CanonicalEvent[], suggestedFileName?: string) => Promise<ExportResult>;
    };
  }
}

export {};
