/**
 * Claude Code session discovery: locates the active transcript JSONL file
 * under `~/.claude/projects/`.
 *
 * Extracted from capture/session-discovery.ts so the path is owned by the
 * driver, not the dispatcher. The dispatcher now consults each driver's
 * DiscoveryStrategy and picks the most recent session across all of them.
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

function getClaudeProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

async function findJsonlFiles(
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
        const nested = await findJsonlFiles(fullPath);
        results.push(...nested);
      } else if (entry.endsWith('.jsonl') || entry.endsWith('.ndjson')) {
        results.push({ filePath: fullPath, mtime: info.mtimeMs });
      }
    } catch {
      // Skip unreadable paths
    }
  }
  return results;
}

export interface ClaudeCodeDiscoveryOptions {
  /** Override the discovery root. Defaults to `~/.claude/projects/`. */
  projectsDir?: string;
}

export function createClaudeCodeDiscovery(
  options: ClaudeCodeDiscoveryOptions = {}
): DiscoveryStrategy {
  return {
    async discoverSessions(): Promise<DriverDiscoveredSession[]> {
      const projectsDir = options.projectsDir ?? getClaudeProjectsDir();
      logger.debug('capture', 'claude_code_discovery.scan_start', { projectsDir });

      const files = await findJsonlFiles(projectsDir);
      if (files.length === 0) {
        logger.debug('capture', 'claude_code_discovery.no_sessions_found', {
          projectsDir,
        });
        return [];
      }

      return files.map(({ filePath, mtime }) => ({
        filePath,
        sessionId: path.basename(filePath, path.extname(filePath)),
        lastModified: mtime,
        // JSONL discovery is the transcript-tail surface. The hook receiver
        // path (claude-hook) does its own discovery, not this scan.
        source: 'claude-transcript' as const,
      }));
    },
  };
}

export const claudeCodeDiscovery = createClaudeCodeDiscovery();
