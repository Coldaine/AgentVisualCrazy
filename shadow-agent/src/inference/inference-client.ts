import type { CanonicalEvent } from '../shared/schema';

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

export interface InferenceClient {
  readonly provider: Provider;
  infer(request: InferenceRequest): Promise<InferenceResult>;
}

/**
 * Structural interface for the event buffer.
 * The concrete implementation lives in src/capture/event-buffer.ts.
 * Defined here so inference code can depend on the shape without a cross-module import.
 */
export interface EventBufferLike {
  getAll(): CanonicalEvent[];
  getRecent(n: number): CanonicalEvent[];
  get size(): number;
  subscribe(cb: (events: CanonicalEvent[]) => void): () => void;
}
