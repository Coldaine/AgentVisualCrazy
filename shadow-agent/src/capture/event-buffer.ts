/**
 * In-memory ring buffer for CanonicalEvents.
 * Supports push, getRecent, getAll, getSince, and subscribe.
 * Capacity defaults to 2000 events.
 */
import type { CanonicalEvent } from '../shared/schema';
import { createLogger } from '../shared/logger';

const logger = createLogger({ minLevel: 'info' });

const DEFAULT_CAPACITY = 2000;

export type EventSubscriber = (events: CanonicalEvent[]) => void;

export interface EventBuffer {
  push(events: CanonicalEvent[]): void;
  getRecent(n: number): CanonicalEvent[];
  getAll(): CanonicalEvent[];
  getSince(eventId: string): CanonicalEvent[];
  subscribe(cb: EventSubscriber): () => void;
  clear(): void;
  get size(): number;
}

export function createEventBuffer(capacity = DEFAULT_CAPACITY): EventBuffer {
  const ring: CanonicalEvent[] = [];
  const subscribers = new Set<EventSubscriber>();

  const notify = (events: CanonicalEvent[]) => {
    for (const sub of subscribers) {
      try {
        sub(events);
      } catch (err) {
        logger.error('capture', 'buffer.subscriber_error', { error: err });
      }
    }
  };

  return {
    push(events: CanonicalEvent[]) {
      for (const event of events) {
        if (ring.length >= capacity) {
          ring.shift();
        }
        ring.push(event);
      }
      if (events.length > 0) {
        logger.debug('capture', 'buffer.pushed', { count: events.length, total: ring.length });
        notify(events);
      }
    },

    getRecent(n: number): CanonicalEvent[] {
      return ring.slice(Math.max(0, ring.length - n));
    },

    getAll(): CanonicalEvent[] {
      return [...ring];
    },

    getSince(eventId: string): CanonicalEvent[] {
      const idx = ring.findIndex((e) => e.id === eventId);
      if (idx === -1) return [...ring];
      return ring.slice(idx + 1);
    },

    subscribe(cb: EventSubscriber): () => void {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },

    clear() {
      ring.length = 0;
      logger.info('capture', 'buffer.cleared');
    },

    get size() {
      return ring.length;
    },
  };
}
