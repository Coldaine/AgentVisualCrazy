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

describe('buildUserMessage', () => {
  it('renders the packet raw — no sanitization, no privacy-mode line', () => {
    const message = buildUserMessage(packet);

    // Content passes through unchanged — nothing is scrubbed or gated.
    expect(message).toContain('echo sk-abcdefghijklmnop');
    expect(message).toContain('dev@example.com');
    expect(message).not.toContain('[redacted-token]');
    expect(message).not.toContain('Privacy mode:');
  });

  it('includes file-attention paths unmodified', () => {
    const filePath = 'D:\\_projects\\AgentVisualCrazy\\secret.txt';
    const message = buildUserMessage({
      ...packet,
      fileAttention: [{ filePath, touches: 2 }]
    });

    expect(message).toContain(`${filePath}: 2 touches`);
    expect(message).not.toContain('[redacted-path]');
  });
});
