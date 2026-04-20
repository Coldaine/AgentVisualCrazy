import type {
  CanonicalEvent,
  EventQueueCheckpoint,
  EventQueueMetrics
} from '../shared/schema';

export interface InferenceRequest {
  systemPrompt: string;
  userMessage: string;
}

export interface InferenceResult {
  text: string;
  model: string;
  latencyMs: number;
}

export type Provider = 'opencode' | 'anthropic' | 'fake';

/**
 * Concrete inference adapters must ship with focused unit tests that exercise
 * provider identity, request forwarding, and response normalization.
 */
export interface InferenceAdapter {
  readonly id: string;
  readonly provider: Provider;
  infer(request: InferenceRequest): Promise<InferenceResult>;
}

export type InferenceClient = InferenceAdapter;

/**
 * Structural interface for the event buffer.
 * The concrete implementation lives in src/capture/event-buffer.ts.
 * Defined here so inference code can depend on the shape without a cross-module import.
 */
export interface EventBufferLike {
  getAll(): Promise<CanonicalEvent[]>;
  getRecent(n: number): Promise<CanonicalEvent[]>;
  get size(): number;
  subscribe(cb: (events: CanonicalEvent[]) => void): () => void;
  registerConsumer?(consumerId: string, options?: { startAt?: 'latest' | 'earliest' }): Promise<EventQueueCheckpoint>;
  readPending?(
    consumerId: string,
    limit?: number
  ): Promise<{
    consumerId: string;
    events: CanonicalEvent[];
    checkpoint: EventQueueCheckpoint;
    hasMore: boolean;
    truncated: boolean;
  }>;
  commitCheckpoint?(consumerId: string, eventId: string): Promise<EventQueueCheckpoint>;
  getMetrics?(): EventQueueMetrics;
}
