import { describe, expect, it } from 'vitest';
import { buildUserMessage, type ShadowContextPacket } from '../src/inference/prompt-builder';

const packet: ShadowContextPacket = {
  sessionId: 'session-1',
  observedAgent: 'claude-code',
  sessionDuration: 42,
  currentPhase: 'implementation',
  recentEvents: [],
  toolHistory: [
    {
      tool: 'Bash',
      result: 'ok',
      argsSummary: 'echo sk-abcdefghijklmnop'
    }
  ],
  recentTranscript: [
    {
      actor: 'user',
      text: 'Reach me at dev@example.com'
    }
  ],
  fileAttention: [],
  riskSignals: []
};

describe('prompt-builder privacy', () => {
  it('sanitizes real secrets in transcript content for local delivery and leaves emails unchanged', () => {
    const message = buildUserMessage(packet);

    // Local delivery always shows local-only mode regardless of privacy settings
    expect(message).toContain('Privacy mode: local-only');
    // Token in tool history is redacted (sk-... provider token)
    expect(message).toContain('[redacted-token]');
    // Email passes through unchanged — path/email redaction was removed
    expect(message).toContain('dev@example.com');
    expect(message).not.toContain('[redacted-email]');
  });

  it('blocks off-host delivery when caller passes explicit local-only settings', () => {
    // Default (no privacy override) now succeeds — off-host is on by default
    expect(() => buildUserMessage(packet, { delivery: 'off-host' })).not.toThrow();

    // Passing explicit local-only settings still blocks off-host delivery
    expect(() =>
      buildUserMessage(packet, {
        delivery: 'off-host',
        privacy: { allowRawTranscriptStorage: false, allowOffHostInference: false }
      })
    ).toThrow(/disabled until the user explicitly opts in/i);
  });

  it('allows raw transcript delivery only after explicit opt-in', () => {
    const message = buildUserMessage(packet, {
      delivery: 'off-host',
      includeRawTranscript: true,
      privacy: {
        allowRawTranscriptStorage: true,
        allowOffHostInference: true
      }
    });

    expect(message).toContain('Privacy mode: off-host-opted-in');
    expect(message).toContain('Reach me at dev@example.com');
    expect(message).toContain('echo sk-abcdefghijklmnop');
  });

  it('requires separate raw transcript opt-in before sending unsanitized content off-host', () => {
    expect(() =>
      buildUserMessage(packet, {
        delivery: 'off-host',
        includeRawTranscript: true,
        privacy: {
          allowRawTranscriptStorage: false,
          allowOffHostInference: true
        }
      })
    ).toThrow(/raw transcript opt-in/i);
  });

  it('includes file-attention paths unredacted in prompt payloads by default', () => {
    const filePath = 'D:\\_projects\\AgentVisualCrazy\\secret.txt';
    const message = buildUserMessage({
      ...packet,
      fileAttention: [{ filePath, touches: 2 }]
    });

    // File paths now pass through unchanged — path redaction was deliberately removed
    expect(message).toContain(`${filePath}: 2 touches`);
    expect(message).not.toContain('[redacted-path]');
  });
});
