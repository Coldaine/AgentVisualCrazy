/**
 * File Size Enforcement Script Tests
 *
 * Tests the checkFileSize and checkFiles functions that enforce
 * the 300-line maximum file size limit for src/ files.
 */

const { checkFileSize, checkFiles } = require('../../scripts/check-file-sizes');

describe('check-file-sizes', () => {
  describe('checkFileSize', () => {
    it('passes for files under the limit', () => {
      const content = 'line\n'.repeat(100);
      const result = checkFileSize(content, 'src/small.js', 300);
      expect(result).toBeNull();
    });

    it('fails for files over the limit', () => {
      const content = 'line\n'.repeat(350);
      const result = checkFileSize(content, 'src/big.js', 300);
      expect(result).not.toBeNull();
      expect(result.file).toBe('src/big.js');
      expect(result.lines).toBe(350);
      expect(result.limit).toBe(300);
    });

    it('passes for files exactly at the limit', () => {
      const content = 'line\n'.repeat(300);
      const result = checkFileSize(content, 'src/exact.js', 300);
      expect(result).toBeNull();
    });
  });

  describe('checkFiles', () => {
    it('returns empty array when all files pass', () => {
      const files = [
        { path: 'src/a.js', content: 'line\n'.repeat(50) },
        { path: 'src/b.js', content: 'line\n'.repeat(100) },
      ];
      const results = checkFiles(files, 300);
      expect(results).toHaveLength(0);
    });

    it('returns violations for files over limit', () => {
      const files = [
        { path: 'src/ok.js', content: 'line\n'.repeat(50) },
        { path: 'src/big.js', content: 'line\n'.repeat(400) },
      ];
      const results = checkFiles(files, 300);
      expect(results).toHaveLength(1);
      expect(results[0].file).toBe('src/big.js');
    });

    it('catches multiple violations', () => {
      const files = [
        { path: 'src/a.js', content: 'line\n'.repeat(301) },
        { path: 'src/b.js', content: 'line\n'.repeat(500) },
      ];
      const results = checkFiles(files, 300);
      expect(results).toHaveLength(2);
    });
  });
});
