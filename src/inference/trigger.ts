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
import { realClock, type Clock, type ClockTimer } from '../shared/clock';

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

/** Which condition caused a trigger to fire. */
export type TriggerReason = 'immediate_kind' | 'max_events' | 'normal';

// Callers may ignore the reason argument (existing ones do), so a plain
// `() => void` remains assignable to TriggerCallback.
export type TriggerCallback = (reason: TriggerReason) => void;

export interface InferenceTrigger {
  onEvents(events: CanonicalEvent[]): void;
  reset(): void;
  stop(): void;
}

export function createInferenceTrigger(
  onTrigger: TriggerCallback,
  config: Partial<TriggerConfig> = {},
  clock: Clock = realClock
): InferenceTrigger {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let eventsSinceLastInference = 0;
  let lastInferenceAt = 0;
  let debounceTimer: ClockTimer | null = null;

  const fire = (reason: TriggerReason) => {
    if (debounceTimer) clock.clearTimeout(debounceTimer);
    debounceTimer = null;
    eventsSinceLastInference = 0;
    lastInferenceAt = clock.now();
    logger.info('inference', 'trigger.fired');
    onTrigger(reason);
  };

  const scheduleDebounced = () => {
    if (debounceTimer) return; // already pending
    debounceTimer = clock.setTimeout(() => {
      fire('normal');
    }, 200); // small debounce to batch rapid events
  };

  return {
    onEvents(events: CanonicalEvent[]) {
      eventsSinceLastInference += events.length;
      const now = clock.now();
      const elapsed = now - lastInferenceAt;

      // Immediate conditions
      const hasImmediateKind = events.some((e) => IMMEDIATE_KINDS.has(e.kind));
      if (hasImmediateKind) {
        logger.debug('inference', 'trigger.immediate_kind', {
          kinds: events.filter((e) => IMMEDIATE_KINDS.has(e.kind)).map((e) => e.kind),
        });
        fire('immediate_kind');
        return;
      }

      // Force condition
      if (eventsSinceLastInference >= cfg.maxEventsBetween) {
        logger.debug('inference', 'trigger.max_events', { count: eventsSinceLastInference });
        fire('max_events');
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
      if (debounceTimer) clock.clearTimeout(debounceTimer);
      debounceTimer = null;
    },

    stop() {
      if (debounceTimer) clock.clearTimeout(debounceTimer);
      debounceTimer = null;
    },
  };
}
