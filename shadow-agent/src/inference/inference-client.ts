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
