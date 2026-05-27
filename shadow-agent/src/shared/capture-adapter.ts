import type { CanonicalEvent, EventSource } from './schema';
import type { AdapterContract } from './adapter-contracts';

/**
 * Concrete capture adapters must ship with focused unit tests that exercise
 * source metadata and normalization behavior. New implementations should land
 * with a sibling `*.test.ts` that proves the adapter boundary, not just the
 * parsing helpers behind it.
 */
export interface CaptureAdapter<TInput = string> extends AdapterContract {
  readonly source: EventSource;
  parse(input: TInput): CanonicalEvent[];
}
