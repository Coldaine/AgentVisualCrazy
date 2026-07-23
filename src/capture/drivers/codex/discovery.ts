/**
 * Codex session discovery: locates the active rollout JSONL file under
 * `~/.codex/sessions/` (Codex CLI nests these `YYYY/MM/DD/rollout-*.jsonl`,
 * but we walk recursively rather than assuming that exact shape so future
 * layout changes don't silently break discovery).
 *
 * Mirrors claude-code/discovery.ts's structure; see that file's header for
 * the general discovery-strategy rationale.
 */
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type {
  DiscoveryStrategy,
  DriverDiscoveredSession,
} from '../harness-driver';
import { createLogger } from '../../../shared/logger';

const logger = createLogger({ minLevel: 'info' });

const SOURCE = 'codex-rollout' as const;

/**
 * UUID suffix at the end of a Codex rollout filename, e.g.
 * `rollout-2026-07-23T12-16-30-019f8ee7-e51f-7ed1-b650-b7fb11ffecda.jsonl`
 * -> `019f8ee7-e51f-7ed1-b650-b7fb11ffecda`.
 */
const UUID_SUFFIX_RE = /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

function getCodexSessionsDir(): string {
  return process.env.CODEX_SESSIONS_DIR || path.join(os.homedir(), '.codex', 'sessions');
}

/** sessionId = the UUID suffix of the filename; fallback: full basename. */
function extractSessionId(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  const match = base.match(UUID_SUFFIX_RE);
  return match ? match[1]! : base;
}

async function findRolloutFiles(
  dir: string
): Promise<Array<{ filePath: string; mtime: number }>> {
  const results: Array<{ filePath: string; mtime: number }> = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    try {
      const info = await stat(fullPath);
      if (info.isDirectory()) {
        const nested = await findRolloutFiles(fullPath);
        results.push(...nested);
      } else if (entry.startsWith('rollout-') && entry.endsWith('.jsonl')) {
        results.push({ filePath: fullPath, mtime: info.mtimeMs });
      }
    } catch {
      // Skip unreadable paths
    }
  }
  return results;
}

export interface CodexDiscoveryOptions {
  /** Override the discovery root. Defaults to `CODEX_SESSIONS_DIR` env var, then `~/.codex/sessions/`. */
  sessionsDir?: string;
}

export function createCodexDiscovery(
  options: CodexDiscoveryOptions = {}
): DiscoveryStrategy {
  return {
    async discoverSessions(): Promise<DriverDiscoveredSession[]> {
      const sessionsDir = options.sessionsDir ?? getCodexSessionsDir();
      logger.debug('capture', 'codex_discovery.scan_start', { sessionsDir });

      const files = await findRolloutFiles(sessionsDir);
      if (files.length === 0) {
        logger.debug('capture', 'codex_discovery.no_sessions_found', { sessionsDir });
        return [];
      }

      return files.map(({ filePath, mtime }) => ({
        filePath,
        sessionId: extractSessionId(filePath),
        lastModified: mtime,
        source: SOURCE,
      }));
    },
  };
}

export const codexDiscovery = createCodexDiscovery();
