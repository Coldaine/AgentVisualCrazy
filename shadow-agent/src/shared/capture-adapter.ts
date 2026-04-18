import type { CanonicalEvent, EventSource } from './schema';

/**
 * Concrete capture adapters must ship with focused unit tests that exercise
 * source metadata and normalization behavior.
 */
export interface CaptureAdapter<TInput = string> {
  readonly id: string;
  readonly source: EventSource;
  parse(input: TInput): CanonicalEvent[];
}
