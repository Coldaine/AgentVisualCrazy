import type { InferenceClient, InferenceRequest, InferenceResult } from '../../src/inference/inference-client';

type ResponseFactory = (request: InferenceRequest) => InferenceResult | Promise<InferenceResult>;

export class FakeInferenceClient implements InferenceClient {
  readonly id = 'fake-inference-client';
  readonly provider = 'fake' as const;
  private queue: ResponseFactory[] = [];
  readonly calls: InferenceRequest[] = [];

  enqueue(result: InferenceResult): this {
    this.queue.push(() => result);
    return this;
  }

  enqueueError(error: Error): this {
    this.queue.push(() => { throw error; });
    return this;
  }

  enqueueFactory(factory: ResponseFactory): this {
    this.queue.push(factory);
    return this;
  }

  async infer(request: InferenceRequest): Promise<InferenceResult> {
    this.calls.push(request);
    const factory = this.queue.shift();
    if (!factory) {
      throw new Error('FakeInferenceClient: no more queued responses');
    }
    return factory(request);
  }

  get pendingCount(): number {
    return this.queue.length;
  }
}
