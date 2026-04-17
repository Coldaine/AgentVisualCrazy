/**
 * IPC bridge between the main-process event buffer and the renderer.
 *
 * Push (main → renderer): debounced at 150ms, batches new events.
 * Pull (renderer → main): handles 'shadow:snapshot' and 'shadow:events-since'.
 */
import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import type { CanonicalEvent, SnapshotPayload } from '../shared/schema';
import type { EventBuffer } from './event-buffer';
import { createLogger } from '../shared/logger';

const logger = createLogger({ minLevel: 'info' });

const PUSH_DEBOUNCE_MS = 150;

export interface IpcBridgeOptions {
  buffer: EventBuffer;
  getWebContents: () => WebContents | null;
  buildSnapshot: () => SnapshotPayload | null;
}

export interface IpcBridge {
  start(): () => void; // returns cleanup
}

export function createIpcBridge(opts: IpcBridgeOptions): IpcBridge {
  const { buffer, getWebContents, buildSnapshot } = opts;

  return {
    start() {
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      const pendingBatch: CanonicalEvent[] = [];

      const flush = () => {
        debounceTimer = null;
        const wc = getWebContents();
        if (!wc || wc.isDestroyed()) return;
        if (pendingBatch.length === 0) return;

        const batch = [...pendingBatch];
        pendingBatch.length = 0;

        logger.debug('ipc', 'snapshot.sent', { eventCount: batch.length });
        wc.send('shadow:events', batch);
      };

      const unsubscribe = buffer.subscribe((events) => {
        pendingBatch.push(...events);
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(flush, PUSH_DEBOUNCE_MS);
      });

      ipcMain.removeHandler('shadow:snapshot');
      ipcMain.handle('shadow:snapshot', () => {
        logger.info('ipc', 'snapshot_requested');
        return buildSnapshot();
      });

      ipcMain.removeHandler('shadow:events-since');
      ipcMain.handle('shadow:events-since', (_event, eventId: string) => {
        logger.debug('ipc', 'events_since_requested', { eventId });
        return buffer.getSince(eventId);
      });

      return () => {
        unsubscribe();
        if (debounceTimer) clearTimeout(debounceTimer);
        ipcMain.removeHandler('shadow:snapshot');
        ipcMain.removeHandler('shadow:events-since');
        logger.info('ipc', 'bridge.stopped');
      };
    },
  };
}
