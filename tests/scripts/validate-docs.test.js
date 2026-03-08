/**
 * CLAUDE.md Drift Detection Script Tests
 *
 * Tests the validate-docs functions that detect when CLAUDE.md
 * is out of sync with the actual codebase structure.
 */

const {
  extractSection,
  findFilesInSection,
  checkDrift,
  checkStagedFilesDrift,
} = require('../../scripts/validate-docs');

describe('validate-docs', () => {
  describe('extractSection', () => {
    it('extracts a section by heading', () => {
      const md = '# Top\n\n## Directory Structure\n\n```\nsrc/\n  foo.js\n```\n\n## Other\n\nstuff';
      const section = extractSection(md, 'Directory Structure');
      expect(section).toContain('foo.js');
      expect(section).not.toContain('stuff');
    });

    it('returns empty string for missing section', () => {
      const md = '# Top\n\n## Other\n\nstuff';
      const section = extractSection(md, 'Nonexistent');
      expect(section).toBe('');
    });
  });

  describe('findFilesInSection', () => {
    it('extracts .js filenames from a code block', () => {
      const section = '```\nsrc/\n├── cli.js\n├── context.js\n```';
      const files = findFilesInSection(section);
      expect(files).toContain('cli.js');
      expect(files).toContain('context.js');
    });

    it('extracts filenames from markdown table rows', () => {
      const section = '| `context.js` | Context filtering | `filterContext()` |';
      const files = findFilesInSection(section);
      expect(files).toContain('context.js');
    });

    it('returns empty array for no matches', () => {
      const section = 'No files mentioned here.';
      const files = findFilesInSection(section);
      expect(files).toHaveLength(0);
    });
  });

  describe('checkDrift', () => {
    it('reports files on disk missing from docs', () => {
      const docFiles = ['cli.js', 'context.js'];
      const diskFiles = ['cli.js', 'context.js', 'new-module.js'];
      const drift = checkDrift(docFiles, diskFiles);
      expect(drift.missingFromDocs).toContain('new-module.js');
    });

    it('reports files in docs missing from disk', () => {
      const docFiles = ['cli.js', 'removed.js'];
      const diskFiles = ['cli.js'];
      const drift = checkDrift(docFiles, diskFiles);
      expect(drift.missingFromDisk).toContain('removed.js');
    });

    it('reports no drift when synced', () => {
      const docFiles = ['cli.js', 'context.js'];
      const diskFiles = ['cli.js', 'context.js'];
      const drift = checkDrift(docFiles, diskFiles);
      expect(drift.missingFromDocs).toHaveLength(0);
      expect(drift.missingFromDisk).toHaveLength(0);
    });
  });

  describe('checkStagedFilesDrift', () => {
    it('warns when src/ files changed but CLAUDE.md not staged', () => {
      const stagedFiles = ['src/new-module.js'];
      const result = checkStagedFilesDrift(stagedFiles);
      expect(result.warn).toBe(true);
      expect(result.changedFiles).toContain('src/new-module.js');
    });

    it('does not warn when CLAUDE.md is also staged', () => {
      const stagedFiles = ['src/new-module.js', 'CLAUDE.md'];
      const result = checkStagedFilesDrift(stagedFiles);
      expect(result.warn).toBe(false);
    });

    it('does not warn for non-tracked directories', () => {
      const stagedFiles = ['tests/new-test.js', 'docs/readme.md'];
      const result = checkStagedFilesDrift(stagedFiles);
      expect(result.warn).toBe(false);
    });

    it('tracks bin/ and scripts/ changes', () => {
      const stagedFiles = ['bin/new-cli.js'];
      const result = checkStagedFilesDrift(stagedFiles);
      expect(result.warn).toBe(true);
    });
  });
});
