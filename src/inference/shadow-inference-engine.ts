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
import { parseCuratorResponse } from './response-parser';
import { createGalleryStore } from './gallery-store';
import { createInferenceTrigger, type TriggerConfig } from './trigger';
import { createInferenceClient } from './inference-client-factory';
import { loadCredentials } from './auth';
import type { InferenceClient } from './inference-client';
import type { EventBufferLike } from './inference-client';
import type { ExhibitArtifact } from '../renderer/exhibits/types';

const logger = createLogger({ minLevel: 'info' });
const INFERENCE_CONSUMER_ID = 'inference-trigger';

export type InsightCallback = (insights: ShadowInsight[]) => void;
export type GalleryCallback = (artifacts: ExhibitArtifact[]) => void;

export interface InferenceEngineOptions {
  buffer: EventBufferLike;
  getState: () => DerivedState | Promise<DerivedState>;
  onInsights: InsightCallback;
  /**
   * Called after each curator response with the full current gallery (active,
   * stale, and retired). Wire this to the session manager so the exhibit floor
   * reflects the model's curation.
   */
  onGallery?: GalleryCallback;
  triggerConfig?: Partial<TriggerConfig>;
  privacy?: TranscriptPrivacySettings;
  client?: InferenceClient;
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
  const galleryStore = createGalleryStore();
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
      // Feed the current gallery back in as the curator's memory. Refresh
      // staleness against the current event position first so the model sees
      // accurate statuses.
      galleryStore.refreshStaleness(events.length);
      const packet = buildContextPacket(state, events, {
        gallery: galleryStore.getActive(),
        retiredGallery: galleryStore.getRetiredSummaries(),
      });
      const request = buildInferenceRequest(packet, {
        delivery: 'off-host',
        privacy
      });

      logger.info('inference', 'engine.run_start', { eventCount: events.length });
      const inferenceResponse = await client.infer(request);
      const { insights, galleryOps } = parseCuratorResponse(inferenceResponse.text);

      // Apply the curator's ops as of the current event index, then expose the
      // resulting gallery to the renderer.
      const applied = galleryStore.applyOps(galleryOps, events.length);

      logger.info('inference', 'engine.run_done', {
        latencyMs: inferenceResponse.latencyMs,
        insights: insights.length,
        created: applied.created.length,
        refreshed: applied.refreshed.length,
        retired: applied.retired.length,
      });

      if (opts.onGallery && galleryOps.length > 0) {
        opts.onGallery(galleryStore.getArtifacts());
      }

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
      await loadCredentials();

      if (!privacy.allowOffHostInference) {
        logger.info('inference', 'engine.local_only_mode', {
          message: 'Off-host inference is disabled until the user explicitly opts in.'
        });
        return;
      }

      client = opts.client ?? await createInferenceClient();

      if (!client) {
        logger.warn('inference', 'engine.no_client', {
          message: 'No inference client available. Shadow insights disabled.',
        });
        return;
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
      client = null;
      logger.info('inference', 'engine.stopped');
    },
  };
}
