/**
 * @deprecated Use the claude-code driver via HarnessDriverRegistry instead.
 *
 * This shim re-exports from the claude-code driver to maintain backward
 * compatibility with tests and any direct callers. Will be removed once all
 * consumers have migrated to driver-registry lookups.
 *
 * Session-manager no longer imports from here — it uses driverRegistry from
 * ./drivers to resolve the right driver per session source.
 */
export { normalizeEntry } from './drivers/claude-code/normalizer';
export type { CanonicalEvent as NormalizedEvent } from '../shared/schema';
