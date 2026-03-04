/**
 * Sidecar Resume Tests
 *
 * Tests for session resumption, including OpenCode session reconnection,
 * file drift detection, and metadata handling.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

const {
  loadSessionMetadata,
  loadInitialContext,
  checkFileDrift,
  buildDriftWarning,
  updateSessionStatus
} = require('../../src/sidecar/resume');

describe('Resume Operations', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sidecar-resume-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadSessionMetadata', () => {
    it('should load metadata from session directory', () => {
      const meta = {
        taskId: 'abc123',
        model: 'openrouter/google/gemini-3-flash-preview',
        status: 'complete',
        opencodeSessionId: 'ses_test123'
      };
      fs.writeFileSync(path.join(tmpDir, 'metadata.json'), JSON.stringify(meta));

      const loaded = loadSessionMetadata(tmpDir);
      expect(loaded.taskId).toBe('abc123');
      expect(loaded.opencodeSessionId).toBe('ses_test123');
    });

    it('should throw if metadata file missing', () => {
      expect(() => loadSessionMetadata('/nonexistent/path'))
        .toThrow('Session metadata not found');
    });
  });

  describe('loadInitialContext', () => {
    it('should load initial context from file', () => {
      fs.writeFileSync(path.join(tmpDir, 'initial_context.md'), '# System Prompt\nTest prompt');

      const context = loadInitialContext(tmpDir);
      expect(context).toContain('Test prompt');
    });

    it('should return empty string if file missing', () => {
      const context = loadInitialContext(tmpDir);
      expect(context).toBe('');
    });
  });

  describe('checkFileDrift', () => {
    it('should detect changed files', () => {
      const testFile = path.join(tmpDir, 'test.js');
      fs.writeFileSync(testFile, 'content');

      const metadata = {
        filesRead: ['test.js'],
        completedAt: new Date(Date.now() - 60000).toISOString()
      };

      const drift = checkFileDrift(metadata, tmpDir);
      expect(drift.hasChanges).toBe(true);
      expect(drift.changedFiles).toContain('test.js');
    });

    it('should not detect drift when no files changed', () => {
      const metadata = {
        filesRead: ['nonexistent.js'],
        completedAt: new Date().toISOString()
      };

      const drift = checkFileDrift(metadata, tmpDir);
      expect(drift.hasChanges).toBe(false);
    });

    it('should handle empty filesRead', () => {
      const metadata = {
        filesRead: [],
        completedAt: new Date().toISOString()
      };

      const drift = checkFileDrift(metadata, tmpDir);
      expect(drift.hasChanges).toBe(false);
    });
  });

  describe('buildDriftWarning', () => {
    it('should format drift warning with changed files', () => {
      const warning = buildDriftWarning(['src/index.js', 'src/utils.js'], Date.now() - 7200000);
      expect(warning).toContain('RESUME NOTICE');
      expect(warning).toContain('src/index.js');
      expect(warning).toContain('src/utils.js');
    });
  });

  describe('updateSessionStatus', () => {
    it('should update session status and add resumedAt', () => {
      const meta = { taskId: 'abc123', status: 'complete' };
      fs.writeFileSync(path.join(tmpDir, 'metadata.json'), JSON.stringify(meta));

      const updated = updateSessionStatus(tmpDir, 'running');
      expect(updated.status).toBe('running');
      expect(updated.resumedAt).toBeDefined();
    });
  });

  describe('OpenCode session ID in metadata', () => {
    it('should persist opencodeSessionId when stored in metadata', () => {
      const meta = {
        taskId: 'test123',
        model: 'openrouter/google/gemini-3-flash-preview',
        status: 'complete',
        opencodeSessionId: 'ses_abc123def456'
      };
      fs.writeFileSync(path.join(tmpDir, 'metadata.json'), JSON.stringify(meta));

      const loaded = loadSessionMetadata(tmpDir);
      expect(loaded.opencodeSessionId).toBe('ses_abc123def456');
    });

    it('should handle metadata without opencodeSessionId (legacy sessions)', () => {
      const meta = {
        taskId: 'old123',
        model: 'openrouter/google/gemini-2.5-flash',
        status: 'complete'
      };
      fs.writeFileSync(path.join(tmpDir, 'metadata.json'), JSON.stringify(meta));

      const loaded = loadSessionMetadata(tmpDir);
      expect(loaded.opencodeSessionId).toBeUndefined();
    });
  });
});
