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
  it('sanitizes transcript-like content for local processing by default', () => {
    const message = buildUserMessage(packet);

    expect(message).toContain('Privacy mode: local-only');
    expect(message).toContain('[redacted-email]');
    expect(message).toContain('[redacted-token]');
  });

  it('blocks off-host delivery until the user opts in', () => {
    expect(() => buildUserMessage(packet, { delivery: 'off-host' })).toThrow(/disabled until the user explicitly opts in/i);
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

  it('sanitizes file-attention paths in prompt payloads by default', () => {
    const message = buildUserMessage({
      ...packet,
      fileAttention: [{ filePath: 'D:\\_projects\\AgentVisualCrazy\\secret.txt', touches: 2 }]
    });

    expect(message).toContain('[redacted-path]: 2 touches');
  });
});
