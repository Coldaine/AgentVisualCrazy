import { describe, expect, it } from 'vitest';
import { sanitizeTranscriptText } from '../src/shared/privacy';

describe('privacy sanitization', () => {
  it('redacts emails, tokens, and local paths from transcript text', () => {
    const sanitized = sanitizeTranscriptText(
      'Contact dev@example.com with Bearer abcdefghijklmnop and inspect D:\\_projects\\AgentVisualCrazy\\secret.txt'
    );

    expect(sanitized).toBe('Contact [redacted-email] with Bearer [redacted-token] and inspect [redacted-path]');
  });
});
