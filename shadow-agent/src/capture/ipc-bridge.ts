/**
 * IPC bridge between the main-process event buffer and the renderer.
 *
 * Push (main → renderer): debounced at 150ms, batches new events.
 * Pull (renderer → main): handles 'shadow:snapshot' and 'shadow:events-since'.
 */
import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import { DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS, prepareEventsForStorage } from '../shared/privacy';
import type { SnapshotPayload, TranscriptPrivacySettings } from '../shared/schema';
import type { EventBuffer } from './event-buffer';
import { createLogger } from '../shared/logger';

const logger = createLogger({ minLevel: 'info' });

const PUSH_DEBOUNCE_MS = 150;
const RENDERER_CONSUMER_ID = 'renderer-ipc';

export interface IpcBridgeOptions {
  buffer: EventBuffer;
  getWebContents: () => WebContents | null;
  buildSnapshot: () => Promise<SnapshotPayload | null>;
  privacy?: TranscriptPrivacySettings;
  getPrivacy?: () => TranscriptPrivacySettings;
}

export interface IpcBridge {
  start(): () => void; // returns cleanup
}

export function createIpcBridge(opts: IpcBridgeOptions): IpcBridge {
  const { buffer, getWebContents, buildSnapshot } = opts;
  const getPrivacy = opts.getPrivacy ?? (() => opts.privacy ?? DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS);

  return {
    start() {
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      let flushInFlight = false;
      let flushRequested = false;
      const consumerReady = buffer.registerConsumer(RENDERER_CONSUMER_ID, { startAt: 'latest' });

      const flush = async () => {
        if (flushInFlight) {
          flushRequested = true;
          return;
        }

        flushInFlight = true;
        debounceTimer = null;
        try {
          const wc = getWebContents();
          if (!wc || wc.isDestroyed()) {
            return;
          }

          await consumerReady;
          const pending = await buffer.readPending(RENDERER_CONSUMER_ID);
          if (pending.events.length === 0) {
            return;
          }

          const rendererBatch = prepareEventsForStorage(pending.events, getPrivacy());
          logger.debug('ipc', 'snapshot.sent', {
            eventCount: rendererBatch.length,
            truncated: pending.truncated
          });
          wc.send('shadow:events', rendererBatch);
          await buffer.commitCheckpoint(RENDERER_CONSUMER_ID, pending.events.at(-1)!.id);
        } finally {
          flushInFlight = false;
          if (flushRequested) {
            flushRequested = false;
            void flush();
          }
        }
      };

      const unsubscribe = buffer.subscribe(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void flush();
        }, PUSH_DEBOUNCE_MS);
      });

      ipcMain.removeHandler('shadow:snapshot');
      ipcMain.handle('shadow:snapshot', async () => {
        logger.info('ipc', 'snapshot_requested');
        return await buildSnapshot();
      });

      ipcMain.removeHandler('shadow:events-since');
      ipcMain.handle('shadow:events-since', async (_event, eventId: string) => {
        logger.debug('ipc', 'events_since_requested', { eventId });
        return await buffer.getSince(eventId);
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
