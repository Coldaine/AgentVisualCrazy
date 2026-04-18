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
 * provider metadata and request/response mapping behavior.
 */
export interface InferenceAdapter {
  readonly provider: Provider;
  infer(request: InferenceRequest): Promise<InferenceResult>;
}

export type InferenceClient = InferenceAdapter;
