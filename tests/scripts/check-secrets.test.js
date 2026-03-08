/**
 * Secret Detection Script Tests
 *
 * Tests the scanForSecrets function that detects API keys,
 * tokens, and private key material in file contents.
 */

const { scanForSecrets } = require('../../scripts/check-secrets');

describe('check-secrets', () => {
  describe('scanForSecrets', () => {
    it('detects OpenRouter API keys', () => {
      const content = 'const key = "sk-or-v1-abc123def456";';
      const results = scanForSecrets(content, 'test.js');
      expect(results).toHaveLength(1);
      expect(results[0].pattern).toBe('sk-or-');
    });

    it('detects Anthropic API keys', () => {
      const content = 'ANTHROPIC_KEY=sk-ant-abc123';
      const results = scanForSecrets(content, '.env');
      expect(results).toHaveLength(1);
      expect(results[0].pattern).toBe('sk-ant-');
    });

    it('detects AWS access keys', () => {
      const content = 'aws_key = "AKIAIOSFODNN7EXAMPLE"';
      const results = scanForSecrets(content, 'config.js');
      expect(results).toHaveLength(1);
      expect(results[0].pattern).toBe('AKIA');
    });

    it('detects GitHub personal access tokens', () => {
      const content = 'token: "ghp_abc123def456ghi789"';
      const results = scanForSecrets(content, 'config.js');
      expect(results).toHaveLength(1);
      expect(results[0].pattern).toBe('ghp_');
    });

    it('detects private key blocks', () => {
      const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIE...';
      const results = scanForSecrets(content, 'key.pem');
      expect(results).toHaveLength(1);
      expect(results[0].pattern).toMatch(/BEGIN.*KEY/);
    });

    it('returns empty array for clean content', () => {
      const content = 'const x = 42;\nfunction hello() { return "world"; }';
      const results = scanForSecrets(content, 'clean.js');
      expect(results).toHaveLength(0);
    });

    it('detects multiple secrets in one file', () => {
      const content = 'const a = "sk-or-v1-abc";\nconst b = "ghp_xyz123abcdef456ghi789jkl012mno345pqr678";';
      const results = scanForSecrets(content, 'bad.js');
      expect(results).toHaveLength(2);
    });

    it('skips allowlisted patterns in test files', () => {
      const content = 'const mockKey = "sk-or-v1-mock-test-key";';
      const results = scanForSecrets(content, 'tests/mock.test.js', {
        allowlistPaths: ['tests/**']
      });
      expect(results).toHaveLength(0);
    });

    it('detects .env file patterns', () => {
      const content = 'OPENROUTER_API_KEY=sk-or-v1-realkey123';
      const results = scanForSecrets(content, '.env');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });
});
