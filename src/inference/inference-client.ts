import type {
  CanonicalEvent,
  EventQueueCheckpoint,
  EventQueueMetrics
} from '../shared/schema';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface InferenceRequest {
  systemPrompt: string;
  userMessage: string;
  tools?: ToolDefinition[];
}

export interface InferenceResult {
  text: string;
  model: string;
  latencyMs: number;
  toolCalls?: ToolCall[];
}

export type Provider = 'opencode' | 'anthropic' | 'openai' | 'fake' | 'deepseek';

export interface InferenceAdapter {
  readonly id: string;
  readonly provider: Provider;
  infer(request: InferenceRequest): Promise<InferenceResult>;
}

export type InferenceClient = InferenceAdapter;

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
