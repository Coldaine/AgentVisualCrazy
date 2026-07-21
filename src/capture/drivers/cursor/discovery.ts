/**
 * Cursor session discovery.
 *
 * Primary Cursor ingestion is push-based (hooks → hook-receiver transport).
 * Discovery here covers the optional agent-trace JSONL fallback
 * (`.agent-trace/traces.jsonl`) and surfaces `.cursor/hooks.json` presence so
 * operators can confirm hooks are installed — but hooks.json itself is NOT
 * a tailable transcript and is never returned as a session file.
 */
import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type {
  DiscoveryStrategy,
  DriverDiscoveredSession,
} from '../harness-driver';
import { createLogger } from '../../../shared/logger';

const logger = createLogger({ minLevel: 'info' });

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function findAgentTraceFiles(root: string): Promise<Array<{ filePath: string; mtime: number }>> {
  const results: Array<{ filePath: string; mtime: number }> = [];
  const candidate = path.join(root, '.agent-trace', 'traces.jsonl');
  try {
    const info = await stat(candidate);
    if (info.isFile()) {
      results.push({ filePath: candidate, mtime: info.mtimeMs });
    }
  } catch {
    // absent — fine
  }

  // Also scan one level of subdirs for workspace-style layouts in tests.
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const nested = path.join(root, entry, '.agent-trace', 'traces.jsonl');
    try {
      const info = await stat(nested);
      if (info.isFile()) {
        results.push({ filePath: nested, mtime: info.mtimeMs });
      }
    } catch {
      // skip
    }
  }
  return results;
}

export interface CursorDiscoveryOptions {
  /** Roots to scan for `.agent-trace/traces.jsonl`. Defaults to cwd + homedir. */
  searchRoots?: string[];
}

export function createCursorDiscovery(
  options: CursorDiscoveryOptions = {}
): DiscoveryStrategy {
  return {
    async discoverSessions(): Promise<DriverDiscoveredSession[]> {
      const roots = options.searchRoots ?? [process.cwd(), os.homedir()];
      const sessions: DriverDiscoveredSession[] = [];

      for (const root of roots) {
        const hooksPath = path.join(root, '.cursor', 'hooks.json');
        if (await pathExists(hooksPath)) {
          logger.debug('capture', 'cursor_discovery.hooks_present', { hooksPath });
        }

        const traces = await findAgentTraceFiles(root);
        for (const { filePath, mtime } of traces) {
          sessions.push({
            filePath,
            sessionId: path.basename(path.dirname(filePath)) === '.agent-trace'
              ? `cursor-trace-${path.basename(path.dirname(path.dirname(filePath))) || 'workspace'}`
              : path.basename(filePath, path.extname(filePath)),
            lastModified: mtime,
            source: 'cursor-agent-trace',
          });
        }
      }

      if (sessions.length === 0) {
        logger.debug('capture', 'cursor_discovery.no_trace_sessions', { roots });
      }
      return sessions;
    },
  };
}

export const cursorDiscovery = createCursorDiscovery();
