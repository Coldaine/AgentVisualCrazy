/**
 * Shadow inference engine — orchestrator.
 *
 * Wires: trigger → context packager → prompt builder → inference client → response parser → emit
 *
 * Only one inference call is in flight at a time. If a new trigger fires while
 * an inference is running, it is queued (only one pending allowed; extras are dropped).
 */
import type { CanonicalEvent, DerivedState, ShadowInsight } from '../shared/schema';
import { createLogger } from '../shared/logger';
import { buildContextPacket } from './context-packager';
import { buildInferenceRequest } from './prompt-builder';
import { parseModelResponse } from './response-parser';
import { createInferenceTrigger, type TriggerConfig } from './trigger';
import { createDirectApiClient } from './direct-api';
import { loadCredentials } from './auth';
import type { InferenceClient } from './inference-client';
import type { EventBufferLike } from './inference-client';

const logger = createLogger({ minLevel: 'info' });

export type InsightCallback = (insights: ShadowInsight[]) => void;

export interface InferenceEngineOptions {
  buffer: EventBufferLike;
  getState: () => DerivedState;
  onInsights: InsightCallback;
  triggerConfig?: Partial<TriggerConfig>;
}

export interface InferenceEngine {
  start(): Promise<void>;
  stop(): void;
}

export function createInferenceEngine(opts: InferenceEngineOptions): InferenceEngine {
  const { buffer, getState, onInsights } = opts;
  let client: InferenceClient | null = null;
  let inflight = false;
  let pendingTrigger = false;
  let unsubscribeBuffer: (() => void) | null = null;

  const runInference = async () => {
    if (!client) return;
    if (inflight) {
      pendingTrigger = true;
      return;
    }

    inflight = true;
    try {
      const state = getState();
      const events = buffer.getAll();
      const packet = buildContextPacket(state, events);
      const request = buildInferenceRequest(packet);

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

  return {
    async start() {
      await loadCredentials();
      client = await createDirectApiClient();

      if (!client) {
        logger.warn('inference', 'engine.no_client', {
          message: 'No inference client available. Shadow insights disabled.',
        });
        return;
      }

      logger.info('inference', 'engine.started', { provider: client.provider });

      unsubscribeBuffer = buffer.subscribe((events) => {
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
