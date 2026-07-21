/**
 * Composite capture transport: Claude JSONL file-tail + Cursor hook-receiver.
 *
 * Runs both ingestion paths concurrently and forwards session/chunk callbacks
 * to the shared session-manager. Whichever harness produces the newest session
 * becomes the active observed agent (session-manager switches on sessionId).
 *
 * If the hook-receiver port is busy, we log and continue with file-tail only
 * so Claude observation never regresses.
 */
import type {
  CaptureTransport,
  CaptureTransportContext,
  CaptureTransportSubscription,
  AutoCaptureTransportOptions,
  FileTailCaptureTransportOptions,
  HookReceiverCaptureTransportOptions
} from './capture-transport';
import { createFileTailCaptureTransport } from './transcript-watcher';
import { createHookReceiverCaptureTransport } from './hook-receiver-transport';
import { createLogger } from '../shared/logger';

const logger = createLogger({ minLevel: 'info' });

export function createAutoCaptureTransport(
  options: AutoCaptureTransportOptions = { kind: 'auto' }
): CaptureTransport {
  return {
    id: 'auto',
    kind: 'auto',
    async start(context: CaptureTransportContext): Promise<CaptureTransportSubscription> {
      const subscriptions: CaptureTransportSubscription[] = [];

      const fileTailOptions: FileTailCaptureTransportOptions = {
        kind: 'file-tail',
        overridePath: options.overridePath,
        discoveryIntervalMs: options.discoveryIntervalMs,
        fingerprintBytes: options.fingerprintBytes
      };
      const fileTail = createFileTailCaptureTransport(fileTailOptions);
      subscriptions.push(await fileTail.start(context));
      logger.info('capture', 'transport.auto.file_tail_started');

      const hookOptions: HookReceiverCaptureTransportOptions = {
        kind: 'hook-receiver',
        host: options.hookHost,
        port: options.hookPort,
        unixSocketPath: options.unixSocketPath,
        sharedToken: options.sharedToken,
        defaultSource: options.defaultSource ?? 'cursor-hook',
        sessionId: options.sessionId,
        sessionLabel: options.sessionLabel
      };

      try {
        const hookReceiver = createHookReceiverCaptureTransport(hookOptions);
        subscriptions.push(await hookReceiver.start(context));
        logger.info('capture', 'transport.auto.hook_receiver_started', {
          host: hookOptions.host,
          port: hookOptions.port
        });
      } catch (error) {
        logger.warn('capture', 'transport.auto.hook_receiver_unavailable', { error });
      }

      return {
        async stop() {
          for (const sub of subscriptions.splice(0).reverse()) {
            try {
              await sub.stop();
            } catch (error) {
              logger.warn('capture', 'transport.auto.stop_error', { error });
            }
          }
        }
      };
    }
  };
}
