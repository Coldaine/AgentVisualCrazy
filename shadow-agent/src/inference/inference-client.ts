export interface InferenceRequest {
  systemPrompt: string;
  userMessage: string;
}

export interface InferenceResult {
  text: string;
  model: string;
  latencyMs: number;
}

export interface InferenceClient {
  readonly provider: 'opencode' | 'anthropic' | 'fake';
  infer(request: InferenceRequest): Promise<InferenceResult>;
}
