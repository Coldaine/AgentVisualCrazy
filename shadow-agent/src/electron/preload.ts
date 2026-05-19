import { contextBridge, ipcRenderer } from 'electron';
import type { CanonicalEvent, ExportResult, ShadowAgentBridge, SnapshotPayload } from '../shared/schema';

const bridge: ShadowAgentBridge = {
  bootstrap: () => ipcRenderer.invoke('shadow-agent:bootstrap') as Promise<SnapshotPayload>,
  onLiveEvents: (callback: (events: CanonicalEvent[]) => void) => {
    const handler = (_: unknown, events: CanonicalEvent[]) => callback(events);
    ipcRenderer.on('shadow:events', handler);
    return () => ipcRenderer.removeListener('shadow:events', handler);
  },
  getLiveSnapshot: () => ipcRenderer.invoke('shadow:snapshot') as Promise<SnapshotPayload | null>,
  openReplayFile: () => ipcRenderer.invoke('shadow-agent:open-replay-file') as Promise<SnapshotPayload | null>,
  getPrivacyPolicy: () => ipcRenderer.invoke('shadow-agent:get-privacy-policy'),
  updatePrivacySettings: (updates) => ipcRenderer.invoke('shadow-agent:update-privacy-settings', updates),
  exportReplayJsonl: (events: CanonicalEvent[], suggestedFileName?: string, options?: { storeRawTranscript?: boolean }) =>
    ipcRenderer.invoke('shadow-agent:export-replay-jsonl', events, suggestedFileName, options) as Promise<ExportResult>
};

contextBridge.exposeInMainWorld('shadowAgent', bridge);
