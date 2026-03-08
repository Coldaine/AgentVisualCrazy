/**
 * Progress Reader Tests
 *
 * Tests for readProgress, extractLatest, computeLastActivity.
 * Reads conversation.jsonl from a session directory and returns
 * { messages, lastActivity, latest }.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  readProgress,
  extractLatest,
  computeLastActivity
} = require('../../src/sidecar/progress');

describe('Progress Reader', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('readProgress', () => {
    it('returns defaults when conversation.jsonl does not exist', () => {
      const result = readProgress(tmpDir);

      expect(result).toEqual({
        messages: 0,
        lastActivity: 'never',
        latest: 'Starting up...'
      });
    });

    it('returns defaults when conversation.jsonl is empty', () => {
      fs.writeFileSync(path.join(tmpDir, 'conversation.jsonl'), '');

      const result = readProgress(tmpDir);

      expect(result).toEqual({
        messages: 0,
        lastActivity: expect.any(String),
        latest: 'Starting up...'
      });
    });

    it('counts assistant messages and skips system/tool roles', () => {
      const lines = [
        JSON.stringify({ role: 'system', content: 'You are a helper' }),
        JSON.stringify({ role: 'assistant', content: 'Hello there' }),
        JSON.stringify({ role: 'user', content: 'Do something' }),
        JSON.stringify({ role: 'assistant', content: 'Sure thing' }),
        JSON.stringify({ role: 'tool', content: 'result data' }),
        JSON.stringify({ role: 'assistant', content: 'Done' })
      ];
      fs.writeFileSync(
        path.join(tmpDir, 'conversation.jsonl'),
        lines.join('\n')
      );

      const result = readProgress(tmpDir);

      expect(result.messages).toBe(3);
    });

    it('extracts latest from assistant text', () => {
      const lines = [
        JSON.stringify({ role: 'assistant', content: 'I will analyze the code now' })
      ];
      fs.writeFileSync(
        path.join(tmpDir, 'conversation.jsonl'),
        lines.join('\n')
      );

      const result = readProgress(tmpDir);

      expect(result.latest).toBe('I will analyze the code now');
    });

    it('truncates latest to 80 chars', () => {
      const longText = 'A'.repeat(100);
      const lines = [
        JSON.stringify({ role: 'assistant', content: longText })
      ];
      fs.writeFileSync(
        path.join(tmpDir, 'conversation.jsonl'),
        lines.join('\n')
      );

      const result = readProgress(tmpDir);

      expect(result.latest).toBe('A'.repeat(80) + '...');
      expect(result.latest.length).toBe(83);
    });

    it('extracts latest from tool_use entry', () => {
      const lines = [
        JSON.stringify({
          role: 'assistant',
          toolCall: { name: 'Read' }
        })
      ];
      fs.writeFileSync(
        path.join(tmpDir, 'conversation.jsonl'),
        lines.join('\n')
      );

      const result = readProgress(tmpDir);

      expect(result.latest).toBe('Using Read');
    });

    it('uses last entry for latest, not first', () => {
      const lines = [
        JSON.stringify({ role: 'assistant', content: 'First message' }),
        JSON.stringify({ role: 'assistant', content: 'Second message' }),
        JSON.stringify({ role: 'assistant', content: 'Third and final' })
      ];
      fs.writeFileSync(
        path.join(tmpDir, 'conversation.jsonl'),
        lines.join('\n')
      );

      const result = readProgress(tmpDir);

      expect(result.latest).toBe('Third and final');
    });

    it('computes relative lastActivity from file mtime', () => {
      const convPath = path.join(tmpDir, 'conversation.jsonl');
      fs.writeFileSync(convPath, JSON.stringify({ role: 'assistant', content: 'hi' }));

      // Touch the file to set mtime to ~2 seconds ago
      const twoSecondsAgo = new Date(Date.now() - 2000);
      fs.utimesSync(convPath, twoSecondsAgo, twoSecondsAgo);

      const result = readProgress(tmpDir);

      // Should be something like "2s ago" or "3s ago" (timing flexibility)
      expect(result.lastActivity).toMatch(/^\d+s ago$/);
    });

    it('handles malformed JSONL lines gracefully', () => {
      const lines = [
        '{ invalid json',
        JSON.stringify({ role: 'assistant', content: 'Valid line' }),
        'another bad line {{',
        '',
        JSON.stringify({ role: 'assistant', toolCall: { name: 'Bash' } })
      ];
      fs.writeFileSync(
        path.join(tmpDir, 'conversation.jsonl'),
        lines.join('\n')
      );

      const result = readProgress(tmpDir);

      // Should count only valid assistant entries
      expect(result.messages).toBe(2);
      // Should use last valid assistant entry
      expect(result.latest).toBe('Using Bash');
    });
  });

  describe('extractLatest', () => {
    it('returns "Starting up..." for empty entries array', () => {
      expect(extractLatest([])).toBe('Starting up...');
    });

    it('returns "Starting up..." when no assistant entries exist', () => {
      const entries = [
        { role: 'user', content: 'Hello' },
        { role: 'system', content: 'Init' }
      ];
      expect(extractLatest(entries)).toBe('Starting up...');
    });

    it('returns tool_use format for toolCall entries', () => {
      const entries = [
        { role: 'assistant', toolCall: { name: 'Write' } }
      ];
      expect(extractLatest(entries)).toBe('Using Write');
    });

    it('returns first line of text content', () => {
      const entries = [
        { role: 'assistant', content: 'First line\nSecond line\nThird line' }
      ];
      expect(extractLatest(entries)).toBe('First line');
    });

    it('truncates text longer than 80 chars', () => {
      const entries = [
        { role: 'assistant', content: 'B'.repeat(90) }
      ];
      expect(extractLatest(entries)).toBe('B'.repeat(80) + '...');
    });

    it('uses the last assistant entry', () => {
      const entries = [
        { role: 'assistant', content: 'Old' },
        { role: 'user', content: 'Question' },
        { role: 'assistant', toolCall: { name: 'Grep' } }
      ];
      expect(extractLatest(entries)).toBe('Using Grep');
    });
  });

  describe('computeLastActivity', () => {
    it('returns "never" when mtime is null', () => {
      expect(computeLastActivity(null)).toBe('never');
    });

    it('returns "never" when mtime is undefined', () => {
      expect(computeLastActivity(undefined)).toBe('never');
    });

    it('returns seconds ago for recent times', () => {
      const tenSecondsAgo = new Date(Date.now() - 10000);
      expect(computeLastActivity(tenSecondsAgo)).toBe('10s ago');
    });

    it('returns minutes ago for older times', () => {
      const threeMinutesAgo = new Date(Date.now() - 180000);
      expect(computeLastActivity(threeMinutesAgo)).toBe('3m ago');
    });

    it('returns hours ago for much older times', () => {
      const twoHoursAgo = new Date(Date.now() - 7200000);
      expect(computeLastActivity(twoHoursAgo)).toBe('2h ago');
    });

    it('returns "0s ago" for current time', () => {
      const now = new Date();
      expect(computeLastActivity(now)).toBe('0s ago');
    });
  });
});
