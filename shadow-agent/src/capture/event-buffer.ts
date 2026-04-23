/**
 * Bounded event queue with spill-to-disk, backpressure signalling, and
 * consumer-side checkpoints.
 *
 * The queue keeps a hot in-memory window for fast subscriptions while spilling
 * older events into a session-scoped JSONL file so consumers can catch up even
 * after the in-memory window rotates.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  CanonicalEvent,
  EventQueueBackpressureLevel,
  EventQueueBackpressureState,
  EventQueueCheckpoint,
  EventQueueMetrics
} from '../shared/schema';
import { createLogger } from '../shared/logger';

const logger = createLogger({ minLevel: 'info' });

const DEFAULT_MEMORY_CAPACITY = 2_000;
const DEFAULT_TOTAL_CAPACITY = 10_000;
const DEFAULT_HIGH_WATERMARK = 0.75;
const DEFAULT_CRITICAL_WATERMARK = 0.9;
const DEFAULT_PERSISTENCE_ROOT = path.join(os.tmpdir(), 'shadow-agent-event-queue');
const DEFAULT_SESSION_ID = 'default';
const SPILL_FILE = 'spill.jsonl';
const CHECKPOINT_FILE = 'checkpoints.json';

interface EventEnvelope {
  offset: number;
  event: CanonicalEvent;
}

interface SerializedCheckpointMap {
  [consumerId: string]: EventQueueCheckpoint;
}

export interface EventBufferOptions {
  memoryCapacity?: number;
  totalCapacity?: number;
  persistenceRoot?: string;
  highWatermark?: number;
  criticalWatermark?: number;
  sessionId?: string;
}

export type EventSubscriber = (events: CanonicalEvent[], metrics: EventQueueMetrics) => void;

export interface EventEnqueueResult {
  accepted: number;
  spilled: number;
  dropped: number;
  metrics: EventQueueMetrics;
  backpressure: EventQueueBackpressureState;
}

export interface EventReadResult {
  consumerId: string;
  events: CanonicalEvent[];
  checkpoint: EventQueueCheckpoint;
  hasMore: boolean;
  truncated: boolean;
}

export interface EventBuffer {
  setSession(sessionId: string): Promise<void>;
  push(events: CanonicalEvent[]): Promise<EventEnqueueResult>;
  getRecent(n: number): Promise<CanonicalEvent[]>;
  getAll(): Promise<CanonicalEvent[]>;
  getSince(eventId: string): Promise<CanonicalEvent[]>;
  subscribe(cb: EventSubscriber): () => void;
  registerConsumer(consumerId: string, options?: { startAt?: 'latest' | 'earliest' }): Promise<EventQueueCheckpoint>;
  readPending(consumerId: string, limit?: number): Promise<EventReadResult>;
  commitCheckpoint(consumerId: string, eventId: string): Promise<EventQueueCheckpoint>;
  clear(): Promise<void>;
  getMetrics(): EventQueueMetrics;
  getBackpressure(): EventQueueBackpressureState;
  get size(): number;
}

function encodeSessionId(sessionId: string): string {
  return encodeURIComponent(sessionId);
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function parseEnvelope(line: string): EventEnvelope | null {
  try {
    const parsed = JSON.parse(line) as Partial<EventEnvelope>;
    if (typeof parsed.offset !== 'number' || !parsed.event) {
      return null;
    }
    return {
      offset: parsed.offset,
      event: parsed.event as CanonicalEvent
    };
  } catch {
    return null;
  }
}

async function readSpillFile(filePath: string): Promise<EventEnvelope[]> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parseEnvelope)
      .filter((envelope): envelope is EventEnvelope => envelope !== null);
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as { code?: string }).code) : undefined;
    if (code === 'ENOENT') {
      return [];
    }
    logger.error('capture', 'buffer.spill_read_failed', { filePath, error });
    return [];
  }
}

async function writeSpillFile(filePath: string, envelopes: EventEnvelope[]): Promise<void> {
  if (envelopes.length === 0) {
    await rm(filePath, { force: true });
    return;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  const payload = `${envelopes.map((envelope) => JSON.stringify(envelope)).join('\n')}\n`;
  await writeFile(filePath, payload, 'utf8');
}

async function readCheckpointFile(filePath: string): Promise<Map<string, EventQueueCheckpoint>> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as SerializedCheckpointMap;
    return new Map(Object.entries(parsed));
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as { code?: string }).code) : undefined;
    if (code === 'ENOENT') {
      return new Map();
    }
    logger.error('capture', 'buffer.checkpoint_read_failed', { filePath, error });
    return new Map();
  }
}

async function writeCheckpointFile(filePath: string, checkpoints: Map<string, EventQueueCheckpoint>): Promise<void> {
  if (checkpoints.size === 0) {
    await rm(filePath, { force: true });
    return;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  const serialized = Object.fromEntries(checkpoints.entries());
  await writeFile(filePath, `${JSON.stringify(serialized, null, 2)}\n`, 'utf8');
}

export function createEventBuffer(capacityOrOptions: number | EventBufferOptions = DEFAULT_MEMORY_CAPACITY): EventBuffer {
  const options = typeof capacityOrOptions === 'number' ? { memoryCapacity: capacityOrOptions } : capacityOrOptions;
  const memoryCapacity = Math.max(1, options.memoryCapacity ?? DEFAULT_MEMORY_CAPACITY);
  const totalCapacity = Math.max(memoryCapacity, options.totalCapacity ?? DEFAULT_TOTAL_CAPACITY);
  const persistenceRoot = options.persistenceRoot ?? DEFAULT_PERSISTENCE_ROOT;
  const highWatermark = clampRatio(options.highWatermark ?? DEFAULT_HIGH_WATERMARK);
  const criticalWatermark = Math.max(highWatermark, clampRatio(options.criticalWatermark ?? DEFAULT_CRITICAL_WATERMARK));
  const subscribers = new Set<EventSubscriber>();
  const consumerDefaults = new Map<string, { startAt: 'latest' | 'earliest' }>();
  const checkpoints = new Map<string, EventQueueCheckpoint>();
  const memory: EventEnvelope[] = [];

  let sessionId = options.sessionId ?? DEFAULT_SESSION_ID;
  let nextOffset = 0;
  let spilledDepth = 0;
  let oldestOffset: number | null = null;
  let newestOffset: number | null = null;
  let pendingWrites = 0;
  let operationChain: Promise<void> = Promise.resolve();
  let lastBackpressureLevel: EventQueueBackpressureLevel = 'normal';

  const sessionDir = () => path.join(persistenceRoot, encodeSessionId(sessionId));
  const spillPath = () => path.join(sessionDir(), SPILL_FILE);
  const checkpointPath = () => path.join(sessionDir(), CHECKPOINT_FILE);

  const computeBackpressure = (): EventQueueBackpressureState => {
    const totalDepth = spilledDepth + memory.length;
    const totalRatio = clampRatio(totalDepth / totalCapacity);
    let level: EventQueueBackpressureLevel = 'normal';

    if (pendingWrites >= 4 || totalRatio >= criticalWatermark) {
      level = 'critical';
    } else if (pendingWrites >= 2 || totalRatio >= highWatermark) {
      level = 'high';
    }

    return {
      level,
      shouldThrottle: level !== 'normal',
      totalRatio,
      pendingWrites
    };
  };

  const buildMetrics = (): EventQueueMetrics => {
    const backpressure = computeBackpressure();
    const consumers = [...checkpoints.values()]
      .sort((left, right) => left.consumerId.localeCompare(right.consumerId))
      .map((checkpoint) => ({
        ...checkpoint,
        lag: newestOffset === null ? 0 : Math.max(0, newestOffset - checkpoint.lastOffset)
      }));

    return {
      memoryDepth: memory.length,
      spilledDepth,
      totalDepth: spilledDepth + memory.length,
      memoryCapacity,
      totalCapacity,
      pendingWrites,
      subscriberCount: subscribers.size,
      oldestOffset,
      newestOffset,
      consumers,
      backpressure
    };
  };

  const updateOffsets = (spilled: EventEnvelope[]) => {
    const first = spilled[0] ?? memory[0];
    const last = memory.at(-1) ?? spilled.at(-1);
    oldestOffset = first?.offset ?? null;
    newestOffset = last?.offset ?? null;
    spilledDepth = spilled.length;
  };

  const logBackpressureTransition = (metrics: EventQueueMetrics) => {
    const level = metrics.backpressure.level;
    if (level === lastBackpressureLevel) {
      return;
    }
    lastBackpressureLevel = level;
    logger.info('capture', 'buffer.backpressure_changed', {
      level,
      totalDepth: metrics.totalDepth,
      totalCapacity: metrics.totalCapacity,
      pendingWrites: metrics.pendingWrites
    });
  };

  const notify = (events: CanonicalEvent[], metrics: EventQueueMetrics) => {
    for (const subscriber of subscribers) {
      try {
        subscriber(events, metrics);
      } catch (error) {
        logger.error('capture', 'buffer.subscriber_error', { error });
      }
    }
  };

  const persistCheckpoints = async () => {
    await writeCheckpointFile(checkpointPath(), checkpoints);
  };

  const ensureCheckpoint = async (
    consumerId: string,
    options?: { startAt?: 'latest' | 'earliest' }
  ): Promise<EventQueueCheckpoint> => {
    if (checkpoints.has(consumerId)) {
      return checkpoints.get(consumerId)!;
    }

    const defaults = {
      startAt: options?.startAt ?? consumerDefaults.get(consumerId)?.startAt ?? 'latest'
    } as const;
    consumerDefaults.set(consumerId, defaults);

    // Lazy-load persisted checkpoints if this session already has them.
    if (checkpoints.size === 0) {
      const persisted = await readCheckpointFile(checkpointPath());
      for (const [id, checkpoint] of persisted.entries()) {
        checkpoints.set(id, checkpoint);
      }
      const restored = checkpoints.get(consumerId);
      if (restored) {
        return restored;
      }
    }

    const initialOffset =
      defaults.startAt === 'earliest'
        ? (oldestOffset ?? 0) - 1
        : newestOffset ?? -1;

    const checkpoint: EventQueueCheckpoint = {
      consumerId,
      lastOffset: initialOffset,
      updatedAt: new Date().toISOString()
    };
    checkpoints.set(consumerId, checkpoint);
    await persistCheckpoints();
    return checkpoint;
  };

  const loadAllEnvelopes = async (): Promise<EventEnvelope[]> => {
    const spilled = spilledDepth > 0 ? await readSpillFile(spillPath()) : [];
    return [...spilled, ...memory];
  };

  const readAllEnvelopes = async (): Promise<EventEnvelope[]> => {
    await operationChain;
    return loadAllEnvelopes();
  };

  const enqueueMutation = async <T>(mutator: () => Promise<T>): Promise<T> => {
    pendingWrites += 1;
    const operationPromise = operationChain.then(mutator, mutator);
    operationChain = operationPromise.then(() => undefined, () => undefined);
    try {
      return await operationPromise;
    } finally {
      pendingWrites -= 1;
    }
  };

  return {
    async setSession(nextSessionId: string) {
      await enqueueMutation(async () => {
        const previousDir = sessionDir();
        sessionId = nextSessionId;
        memory.length = 0;
        nextOffset = 0;
        spilledDepth = 0;
        oldestOffset = null;
        newestOffset = null;
        lastBackpressureLevel = 'normal';

        const resetCheckpoints = new Map<string, EventQueueCheckpoint>();
        for (const consumerId of consumerDefaults.keys()) {
          resetCheckpoints.set(consumerId, {
            consumerId,
            lastOffset: -1,
            updatedAt: new Date().toISOString()
          });
        }
        checkpoints.clear();
        for (const [consumerId, checkpoint] of resetCheckpoints.entries()) {
          checkpoints.set(consumerId, checkpoint);
        }

        await rm(previousDir, { recursive: true, force: true });
        await rm(sessionDir(), { recursive: true, force: true });
        await persistCheckpoints();
        logger.info('capture', 'buffer.session_set', { sessionId: nextSessionId });
      });
    },

    async push(events: CanonicalEvent[]) {
      if (events.length === 0) {
        const metrics = buildMetrics();
        return {
          accepted: 0,
          spilled: 0,
          dropped: 0,
          metrics,
          backpressure: metrics.backpressure
        };
      }

      return enqueueMutation(async () => {
        const acceptedEnvelopes = events.map((event) => ({
          offset: nextOffset++,
          event
        }));
        memory.push(...acceptedEnvelopes);

        const overflow = Math.max(0, memory.length - memoryCapacity);
        let spilled = overflow > 0 ? await readSpillFile(spillPath()) : [];
        let spilledCount = 0;
        let droppedCount = 0;

        if (overflow > 0) {
          const spillBatch = memory.splice(0, overflow);
          spilled.push(...spillBatch);
          spilledCount = spillBatch.length;
        }

        const totalDepth = spilled.length + memory.length;
        const overflowTotal = Math.max(0, totalDepth - totalCapacity);
        if (overflowTotal > 0) {
          droppedCount = overflowTotal;
          if (spilled.length >= overflowTotal) {
            spilled = spilled.slice(overflowTotal);
          } else {
            const spillDrop = spilled.length;
            spilled = [];
            memory.splice(0, overflowTotal - spillDrop);
          }
        }

        if (spilledCount > 0 || droppedCount > 0 || spilledDepth > 0) {
          await writeSpillFile(spillPath(), spilled);
        }

        updateOffsets(spilled);

        const metrics = buildMetrics();
        logBackpressureTransition(metrics);
        logger.debug('capture', 'buffer.pushed', {
          accepted: events.length,
          spilled: spilledCount,
          dropped: droppedCount,
          totalDepth: metrics.totalDepth,
          memoryDepth: metrics.memoryDepth,
          spilledDepth: metrics.spilledDepth
        });
        notify(events, metrics);

        return {
          accepted: events.length,
          spilled: spilledCount,
          dropped: droppedCount,
          metrics,
          backpressure: metrics.backpressure
        };
      });
    },

    async getRecent(n: number) {
      if (n <= 0) {
        return [];
      }
      const all = await readAllEnvelopes();
      return all.slice(Math.max(0, all.length - n)).map((entry) => entry.event);
    },

    async getAll() {
      const all = await readAllEnvelopes();
      return all.map((entry) => entry.event);
    },

    async getSince(eventId: string) {
      const all = await readAllEnvelopes();
      const index = all.findIndex((entry) => entry.event.id === eventId);
      if (index === -1) {
        return all.map((entry) => entry.event);
      }
      return all.slice(index + 1).map((entry) => entry.event);
    },

    subscribe(cb: EventSubscriber) {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },

    async registerConsumer(consumerId: string, options?: { startAt?: 'latest' | 'earliest' }) {
      return enqueueMutation(async () => ensureCheckpoint(consumerId, options));
    },

    async readPending(consumerId: string, limit = Number.POSITIVE_INFINITY) {
      const checkpoint = await ensureCheckpoint(consumerId);
      const all = await readAllEnvelopes();
      const earliestAvailableOffset = all[0]?.offset ?? null;
      const pending = all.filter((entry) => entry.offset > checkpoint.lastOffset);
      const take = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : pending.length;
      const batch = pending.slice(0, take);
      return {
        consumerId,
        events: batch.map((entry) => entry.event),
        checkpoint,
        hasMore: pending.length > batch.length,
        truncated:
          earliestAvailableOffset !== null &&
          checkpoint.lastOffset < earliestAvailableOffset - 1
      };
    },

    async commitCheckpoint(consumerId: string, eventId: string) {
      return enqueueMutation(async () => {
        const checkpoint = await ensureCheckpoint(consumerId);
        const all = await loadAllEnvelopes();
        const target = all.find((entry) => entry.event.id === eventId);

        if (!target) {
          logger.warn('capture', 'buffer.checkpoint_target_missing', {
            consumerId,
            eventId
          });
          return checkpoint;
        }

        const nextCheckpoint: EventQueueCheckpoint = {
          consumerId,
          lastOffset: target.offset,
          lastEventId: target.event.id,
          updatedAt: new Date().toISOString()
        };
        checkpoints.set(consumerId, nextCheckpoint);
        await persistCheckpoints();
        return nextCheckpoint;
      });
    },

    async clear() {
      await enqueueMutation(async () => {
        memory.length = 0;
        nextOffset = 0;
        spilledDepth = 0;
        oldestOffset = null;
        newestOffset = null;
        checkpoints.clear();
        for (const consumerId of consumerDefaults.keys()) {
          checkpoints.set(consumerId, {
            consumerId,
            lastOffset: -1,
            updatedAt: new Date().toISOString()
          });
        }
        await rm(sessionDir(), { recursive: true, force: true });
        await persistCheckpoints();
        lastBackpressureLevel = 'normal';
        logger.info('capture', 'buffer.cleared');
      });
    },

    getMetrics() {
      return buildMetrics();
    },

    getBackpressure() {
      return computeBackpressure();
    },

    get size() {
      return spilledDepth + memory.length;
    }
  };
}
