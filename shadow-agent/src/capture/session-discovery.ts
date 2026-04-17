/**
 * Scans Claude Code's transcript directories for active sessions.
 * Returns the path to the most recently modified JSONL file.
 */
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createLogger } from '../shared/logger';

const logger = createLogger({ minLevel: 'info' });

export interface DiscoveredSession {
  filePath: string;
  sessionId: string;
  lastModified: number;
}

function getClaudeProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

async function findJsonlFiles(dir: string): Promise<Array<{ filePath: string; mtime: number }>> {
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

/**
 * Discover the active Claude Code session.
 * Returns the most recently modified JSONL file under `~/.claude/projects/`.
 * If `overridePath` is provided, that path is used directly.
 */
export async function discoverActiveSession(
  overridePath?: string
): Promise<DiscoveredSession | null> {
  if (overridePath) {
    try {
      const info = await stat(overridePath);
      const sessionId = path.basename(overridePath, path.extname(overridePath));
      logger.info('capture', 'session_discovery.override', { filePath: overridePath });
      return { filePath: overridePath, sessionId, lastModified: info.mtimeMs };
    } catch {
      logger.warn('capture', 'session_discovery.override_not_found', { filePath: overridePath });
      return null;
    }
  }

  const projectsDir = getClaudeProjectsDir();
  logger.debug('capture', 'session_discovery.scan_start', { projectsDir });

  const files = await findJsonlFiles(projectsDir);
  if (files.length === 0) {
    logger.info('capture', 'session_discovery.no_sessions_found');
    return null;
  }

  const latest = files.sort((a, b) => b.mtime - a.mtime)[0];
  const sessionId = path.basename(latest.filePath, path.extname(latest.filePath));
  logger.info('capture', 'session_discovery.found', { filePath: latest.filePath, sessionId });

  return { filePath: latest.filePath, sessionId, lastModified: latest.mtime };
}
