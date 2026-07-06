import type {
  DerivedState,
  ShadowInsight
} from '../shared/schema';
import { createLogger } from '../shared/logger';
import { buildContextPacket } from './context-packager';
import { buildInferenceRequest } from './prompt-builder';
import { parseModelResponse } from './response-parser';
import { createInferenceTrigger, type TriggerConfig } from './trigger';
import { createInferenceClient } from './inference-client-factory';
import type { InferenceClient, ToolDefinition } from './inference-client';
import type { EventBufferLike } from './inference-client';
import { createShadowRuntime, type ShadowRuntime } from '../shadow/shadow-runtime';
import type { ShadowDatabase } from '../db/database';

const logger = createLogger({ minLevel: 'info' });
const INFERENCE_CONSUMER_ID = 'inference-trigger';

export type InsightCallback = (insights: ShadowInsight[]) => void;

export interface InferenceEngineOptions {
  buffer: EventBufferLike;
  getState: () => DerivedState | Promise<DerivedState>;
  onInsights: InsightCallback;
  triggerConfig?: Partial<TriggerConfig>;
  client?: InferenceClient;
  db?: ShadowDatabase;
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
  const { buffer, getState, onInsights, db } = opts;
  let client: InferenceClient | null = null;
  let shadowRuntime: ShadowRuntime | null = null;
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
      const request = buildInferenceRequest(packet);

      logger.info('inference', 'engine.run_start', { eventCount: events.length });

      let inferenceResponse;
      if (shadowRuntime) {
        const result = await shadowRuntime.run(request);
        inferenceResponse = { text: result.finalText, model: client.id, latencyMs: 0 };
        logger.info('inference', 'engine.run_done', {
          toolCalls: result.toolCallsExecuted,
          iterations: result.iterations,
        });
      } else {
        inferenceResponse = await client.infer(request);
        logger.info('inference', 'engine.run_done', {
          latencyMs: inferenceResponse.latencyMs,
          insights: 0,
        });
      }

      const insights = parseModelResponse(inferenceResponse.text);

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
        await checkpointBuffer.commitCheckpoint(
          INFERENCE_CONSUMER_ID,
          pending.events.at(-1)!.id
        );
      } while (pendingDrain);
    } catch (err) {
      logger.error('inference', 'engine.drain_pending_error', { error: err });
    } finally {
      drainingPending = false;
    }
  };

  const scheduleDrain = () => {
    void drainPendingEvents().catch((err) => {
      logger.error('inference', 'engine.drain_pending_unhandled', { error: err });
    });
  };

  return {
    async start() {
      const credentials = await (await import('./auth')).loadCredentials();

      client = opts.client ?? await createInferenceClient();

      if (!client) {
        logger.warn('inference', 'engine.no_client', {
          message: 'No inference client available. Shadow insights disabled.',
        });
        return;
      }

      if (db) {
        const events = await buffer.getAll();
        const sessionId = events[0]?.sessionId;
        if (sessionId) {
          shadowRuntime = createShadowRuntime({ db, sessionId, client });
          logger.info('inference', 'engine.shadow_runtime_active', { sessionId });
        }
      }

      logger.info('inference', 'engine.started', { provider: client.provider });

      if (checkpointBuffer) {
        await checkpointBuffer.registerConsumer(INFERENCE_CONSUMER_ID, { startAt: 'latest' });
        scheduleDrain();
      }

      unsubscribeBuffer = buffer.subscribe((events) => {
        if (checkpointBuffer) {
          scheduleDrain();
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
      shadowRuntime = null;
      client = null;
      logger.info('inference', 'engine.stopped');
    },
  };
}
