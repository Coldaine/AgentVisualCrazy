import { contextBridge, ipcRenderer } from 'electron';
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

contextBridge.exposeInMainWorld('shadowAgent', {
  bootstrap: () => ipcRenderer.invoke('shadow-agent:bootstrap') as Promise<SnapshotPayload>,
  openReplayFile: () => ipcRenderer.invoke('shadow-agent:open-replay-file') as Promise<SnapshotPayload | null>,
  exportReplayJsonl: (events: CanonicalEvent[], suggestedFileName?: string) =>
    ipcRenderer.invoke('shadow-agent:export-replay-jsonl', events, suggestedFileName) as Promise<ExportResult>
});
