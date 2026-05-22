import type { HarnessNormalizer } from '../harness-driver';
import type { ParsedEntry } from '../../incremental-parser';

export const claudeCodeNormalizer: HarnessNormalizer = {
  extractTimestamp(entry: ParsedEntry): string {
    const ts = entry.timestamp ?? entry.created_at;
    if (typeof ts === 'string') return ts;
    return new Date().toISOString();
  },

  detectSessionStart(entry: ParsedEntry): boolean {
    const type = typeof entry.type === 'string' ? entry.type : '';
    return type === 'session' || (type === '' && Boolean(entry.cwd));
  }
};
