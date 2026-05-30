/**
 * Generic session-discovery dispatcher.
 *
 * Iterates every registered HarnessDriver that exposes a DiscoveryStrategy,
 * collects candidate sessions, and returns the most recently modified one.
 * Each driver owns its own harness-specific filesystem layout
 * (e.g. claude-code → `~/.claude/projects/`).
 *
 * An explicit `overridePath` short-circuits driver dispatch and returns the
 * given file directly — useful for tests and CLI flags.
 */
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '../shared/logger';
import { driverRegistry } from './drivers';
import type { HarnessDriverRegistry } from './drivers';
import type { DriverDiscoveredSession } from './drivers/harness-driver';
import type { EventSource } from '../shared/schema';

const logger = createLogger({ minLevel: 'info' });

/**
 * Alias for the driver-level type. Kept as a re-export so existing callers
 * (`transcript-watcher.ts`, etc.) don't need to know about the driver module
 * layout. The `source` field carries the driver's attribution forward so
 * downstream session-manager hands the right driver back the work.
 */
export type DiscoveredSession = DriverDiscoveredSession;

/**
 * Source assigned to an override-path discovery when no driver was consulted.
 * Defaults to 'claude-transcript' because the override flow predates
 * multi-harness and was always a Claude JSONL pointer.
 */
const OVERRIDE_DEFAULT_SOURCE: EventSource = 'claude-transcript';

export interface DiscoverActiveSessionOptions {
  registry?: HarnessDriverRegistry;
  /** Override the source attribution when overridePath is supplied. */
  overrideSource?: EventSource;
}

/**
 * Discover the most recently active session across all registered drivers.
 *
 * If `overridePath` is provided, return that path directly (no driver dispatch).
 */
export async function discoverActiveSession(
  overridePath?: string,
  options: DiscoverActiveSessionOptions = {}
): Promise<DiscoveredSession | null> {
  if (overridePath) {
    try {
      const info = await stat(overridePath);
      const sessionId = path.basename(overridePath, path.extname(overridePath));
      logger.info('capture', 'session_discovery.override', { filePath: overridePath });
      return {
        filePath: overridePath,
        sessionId,
        lastModified: info.mtimeMs,
        source: options.overrideSource ?? OVERRIDE_DEFAULT_SOURCE,
      };
    } catch {
      logger.warn('capture', 'session_discovery.override_not_found', { filePath: overridePath });
      return null;
    }
  }

  const registry = options.registry ?? driverRegistry;
  const candidates: DiscoveredSession[] = [];

  for (const driverId of registry.registeredIds) {
    const driver = registry.get(driverId);
    if (!driver?.discovery) continue;
    try {
      const sessions = await driver.discovery.discoverSessions();
      candidates.push(...sessions);
    } catch (error) {
      logger.warn('capture', 'session_discovery.driver_error', { driverId, error });
    }
  }

  if (candidates.length === 0) {
    logger.info('capture', 'session_discovery.no_sessions_found');
    return null;
  }

  const latest = candidates.sort((a, b) => b.lastModified - a.lastModified)[0];
  logger.info('capture', 'session_discovery.found', {
    filePath: latest.filePath,
    sessionId: latest.sessionId,
    source: latest.source,
  });
  return latest;
}
