/**
 * Every concrete adapter must name the focused unit test file that covers its
 * boundary. This keeps adapter authors from satisfying the structural contract
 * without also landing regression coverage for the implementation.
 */
export interface AdapterUnitTestRequirement {
  readonly testFile: string;
  readonly covers: readonly string[];
}

/**
 * Shared adapter boundary fields for capture, inference, and renderer-input
 * adapters. Domain-specific contracts extend this interface with their own
 * input/output methods.
 */
export interface AdapterContract {
  readonly id: string;
  readonly unitTests: AdapterUnitTestRequirement;
}
