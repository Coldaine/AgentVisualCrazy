/**
 * Sidecar Progress Reader
 *
 * Reads conversation.jsonl from a session directory and returns
 * progress info: message count, last activity time, and latest action.
 */

const fs = require('fs');
const path = require('path');

/**
 * Extract the latest action description from parsed JSONL entries.
 *
 * @param {object[]} entries - Parsed JSONL entries
 * @returns {string} Short description of last assistant action
 */
function extractLatest(entries) {
  const assistantEntries = entries.filter(e => e.role === 'assistant');

  if (assistantEntries.length === 0) {
    return 'Starting up...';
  }

  const last = assistantEntries[assistantEntries.length - 1];

  // Tool use entry
  if (last.toolCall && last.toolCall.name) {
    return `Using ${last.toolCall.name}`;
  }

  // Text content: take first line, truncate to 80 chars
  if (last.content) {
    const firstLine = String(last.content).split('\n')[0];
    if (firstLine.length > 80) {
      return firstLine.slice(0, 80) + '...';
    }
    return firstLine;
  }

  return 'Starting up...';
}

/**
 * Compute a relative time string from a file mtime.
 *
 * @param {Date|null|undefined} mtime - File modification time
 * @returns {string} Relative time (e.g., "12s ago", "3m ago", "2h ago", "never")
 */
function computeLastActivity(mtime) {
  if (!mtime) {
    return 'never';
  }

  const diffMs = Date.now() - mtime.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }

  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

/**
 * Read progress from a session's conversation.jsonl file.
 *
 * @param {string} sessionDir - Path to the session directory
 * @returns {{ messages: number, lastActivity: string, latest: string }}
 */
function readProgress(sessionDir) {
  const convPath = path.join(sessionDir, 'conversation.jsonl');

  // File does not exist
  if (!fs.existsSync(convPath)) {
    return { messages: 0, lastActivity: 'never', latest: 'Starting up...' };
  }

  // Read file mtime for lastActivity
  const stat = fs.statSync(convPath);
  const lastActivity = computeLastActivity(stat.mtime);

  // Read and parse JSONL, skipping malformed lines
  const content = fs.readFileSync(convPath, 'utf-8');
  const entries = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }

  // Count assistant messages
  const messages = entries.filter(e => e.role === 'assistant').length;

  // Extract latest action
  const latest = extractLatest(entries);

  return { messages, lastActivity, latest };
}

module.exports = {
  readProgress,
  extractLatest,
  computeLastActivity
};
