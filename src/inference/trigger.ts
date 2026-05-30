/**
 * Inference trigger: decides when to run the inference engine.
 *
 * Trigger conditions (any one fires):
 *   - At least minEventsBetween (10) new events since last inference
 *   - At least timeBetweenMs (30 s) since last inference
 *   - maxEventsBetween (50) events forces a trigger regardless of timer
 *   - Risk escalation: derived risk level rises to 'medium' or above
 *   - Specific event kinds: tool_failed, agent_completed always trigger immediately
 */
import type { CanonicalEvent, EventKind } from '../shared/schema';
import { createLogger } from '../shared/logger';

const logger = createLogger({ minLevel: 'info' });

const IMMEDIATE_KINDS = new Set<EventKind>(['tool_failed', 'agent_completed']);

export interface TriggerConfig {
  minEventsBetween: number;   // default 10
  timeBetweenMs: number;       // default 30_000
  maxEventsBetween: number;    // default 50
}

const DEFAULT_CONFIG: TriggerConfig = {
  minEventsBetween: 10,
  timeBetweenMs: 30_000,
  maxEventsBetween: 50,
};

export type TriggerCallback = () => void;

export interface InferenceTrigger {
  onEvents(events: CanonicalEvent[]): void;
  reset(): void;
  stop(): void;
}

export function createInferenceTrigger(
  onTrigger: TriggerCallback,
  config: Partial<TriggerConfig> = {}
): InferenceTrigger {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let eventsSinceLastInference = 0;
  let lastInferenceAt = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const fire = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
    eventsSinceLastInference = 0;
    lastInferenceAt = Date.now();
    logger.info('inference', 'trigger.fired');
    onTrigger();
  };

  const scheduleDebounced = () => {
    if (debounceTimer) return; // already pending
    debounceTimer = setTimeout(() => {
      fire();
    }, 200); // small debounce to batch rapid events
  };

  return {
    onEvents(events: CanonicalEvent[]) {
      eventsSinceLastInference += events.length;
      const now = Date.now();
      const elapsed = now - lastInferenceAt;

      // Immediate conditions
      const hasImmediateKind = events.some((e) => IMMEDIATE_KINDS.has(e.kind));
      if (hasImmediateKind) {
        logger.debug('inference', 'trigger.immediate_kind', {
          kinds: events.filter((e) => IMMEDIATE_KINDS.has(e.kind)).map((e) => e.kind),
        });
        fire();
        return;
      }

      // Force condition
      if (eventsSinceLastInference >= cfg.maxEventsBetween) {
        logger.debug('inference', 'trigger.max_events', { count: eventsSinceLastInference });
        fire();
        return;
      }

      // Normal: min events + time elapsed
      if (
        eventsSinceLastInference >= cfg.minEventsBetween &&
        elapsed >= cfg.timeBetweenMs
      ) {
        logger.debug('inference', 'trigger.normal', {
          events: eventsSinceLastInference,
          elapsedMs: elapsed,
        });
        scheduleDebounced();
      }
    },

    reset() {
      eventsSinceLastInference = 0;
      lastInferenceAt = 0;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
    },

    stop() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
    },
  };
}
