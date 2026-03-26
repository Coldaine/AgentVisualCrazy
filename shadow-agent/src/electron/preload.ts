import { contextBridge, ipcRenderer } from 'electron';
import type { CanonicalEvent, ExportResult, ShadowAgentBridge, SnapshotPayload } from '../shared/schema';

const bridge: ShadowAgentBridge = {
  bootstrap: () => ipcRenderer.invoke('shadow-agent:bootstrap') as Promise<SnapshotPayload>,
  openReplayFile: () => ipcRenderer.invoke('shadow-agent:open-replay-file') as Promise<SnapshotPayload | null>,
  exportReplayJsonl: (events: CanonicalEvent[], suggestedFileName?: string) =>
    ipcRenderer.invoke('shadow-agent:export-replay-jsonl', events, suggestedFileName) as Promise<ExportResult>
};

contextBridge.exposeInMainWorld('shadowAgent', bridge);
