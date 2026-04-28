/**
 * Shadow inference engine — orchestrator.
 *
 * Wires: trigger → context packager → prompt builder → inference client → response parser → emit
 *
 * Only one inference call is in flight at a time. If a new trigger fires while
 * an inference is running, it is queued (only one pending allowed; extras are dropped).
 */
import type {
  DerivedState,
  ShadowInsight,
  TranscriptPrivacySettings
} from '../shared/schema';
import { createLogger } from '../shared/logger';
import { DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS } from '../shared/privacy';
import { buildContextPacket } from './context-packager';
import { buildInferenceRequest } from './prompt-builder';
import { parseModelResponse } from './response-parser';
import { createInferenceTrigger, type TriggerConfig } from './trigger';
import { createDirectApiClient } from './direct-api';
import { loadCredentials } from './auth';
import type { InferenceClient } from './inference-client';
import type { EventBufferLike } from './inference-client';

const logger = createLogger({ minLevel: 'info' });
const INFERENCE_CONSUMER_ID = 'inference-trigger';

export type InsightCallback = (insights: ShadowInsight[]) => void;

export interface InferenceEngineOptions {
  buffer: EventBufferLike;
  getState: () => DerivedState | Promise<DerivedState>;
  onInsights: InsightCallback;
  triggerConfig?: Partial<TriggerConfig>;
  privacy?: TranscriptPrivacySettings;
}

export interface InferenceEngine {
  start(): Promise<void>;
  stop(): void;
}

type CheckpointedEventBuffer = EventBufferLike & Required<
  Pick<EventBufferLike, 'registerConsumer' | 'readPending' | 'commitCheckpoint'>
>;

function isCheckpointedEventBuffer(buffer: EventBufferLike): buffer is CheckpointedEventBuffer {
  return (
    typeof buffer.registerConsumer === 'function' &&
    typeof buffer.readPending === 'function' &&
    typeof buffer.commitCheckpoint === 'function'
  );
}

export function createInferenceEngine(opts: InferenceEngineOptions): InferenceEngine {
  const { buffer, getState, onInsights } = opts;
  const privacy = opts.privacy ?? DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS;
  let client: InferenceClient | null = null;
  let inflight = false;
  let pendingTrigger = false;
  let unsubscribeBuffer: (() => void) | null = null;
  let drainingPending = false;
  let pendingDrain = false;
  const checkpointBuffer = isCheckpointedEventBuffer(buffer) ? buffer : null;

  const runInference = async () => {
    if (!client) return;
    if (inflight) {
      pendingTrigger = true;
      return;
    }

    inflight = true;
    try {
      const state = await getState();
      const events = await buffer.getAll();
      const packet = buildContextPacket(state, events);
      const request = buildInferenceRequest(packet, {
        delivery: 'off-host',
        privacy
      });

      logger.info('inference', 'engine.run_start', { eventCount: events.length });
      const result = await client.infer(request);
      const insights = parseModelResponse(result.text);

      logger.info('inference', 'engine.run_done', {
        latencyMs: result.latencyMs,
        insights: insights.length,
      });

      if (insights.length > 0) {
        onInsights(insights);
      }
    } catch (err) {
      logger.error('inference', 'engine.run_error', { error: err });
    } finally {
      inflight = false;
      if (pendingTrigger) {
        pendingTrigger = false;
        void runInference();
      }
    }
  };

  const trigger = createInferenceTrigger(() => void runInference(), opts.triggerConfig);

  const drainPendingEvents = async () => {
    if (!checkpointBuffer) {
      return;
    }
    if (drainingPending) {
      pendingDrain = true;
      return;
    }

    drainingPending = true;
    try {
      do {
        pendingDrain = false;
        const pending = await checkpointBuffer.readPending(INFERENCE_CONSUMER_ID);
        if (pending.events.length === 0) {
          continue;
        }

        trigger.onEvents(pending.events);
        await checkpointBuffer.commitCheckpoint(INFERENCE_CONSUMER_ID, pending.events.at(-1)!.id);
      } while (pendingDrain);
    } finally {
      drainingPending = false;
    }
  };

  return {
    async start() {
      await loadCredentials();

      if (!privacy.allowOffHostInference) {
        logger.info('inference', 'engine.local_only_mode', {
          message: 'Off-host inference is disabled until the user explicitly opts in.'
        });
        return;
      }

      client = await createDirectApiClient();

      if (!client) {
        logger.warn('inference', 'engine.no_client', {
          message: 'No inference client available. Shadow insights disabled.',
        });
        return;
      }

      logger.info('inference', 'engine.started', { provider: client.provider });

      if (checkpointBuffer) {
        await checkpointBuffer.registerConsumer(INFERENCE_CONSUMER_ID, { startAt: 'latest' });
      }

      unsubscribeBuffer = buffer.subscribe((events) => {
        if (checkpointBuffer) {
          void drainPendingEvents();
          return;
        }
        trigger.onEvents(events);
      });
    },

    stop() {
      trigger.stop();
      if (unsubscribeBuffer) {
        unsubscribeBuffer();
        unsubscribeBuffer = null;
      }
      client = null;
      logger.info('inference', 'engine.stopped');
    },
  };
}
