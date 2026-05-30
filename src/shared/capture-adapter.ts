import type { CanonicalEvent, EventSource } from './schema';

/**
 * Concrete capture adapters must ship with focused unit tests that exercise
 * source metadata and normalization behavior. New implementations should land
 * with a sibling `*.test.ts` that proves the adapter boundary, not just the
 * parsing helpers behind it.
 */
export interface CaptureAdapter<TInput = string> {
  readonly id: string;
  readonly source: EventSource;
  parse(input: TInput): CanonicalEvent[];
}
