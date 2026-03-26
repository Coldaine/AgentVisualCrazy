import { describe, expect, it } from 'vitest';
import { parseClaudeTranscriptJsonl } from '../src/shared/transcript-adapter';

describe('parseClaudeTranscriptJsonl', () => {
  it('converts text, tool_use, and tool_result blocks into canonical events', () => {
    const raw = [
      JSON.stringify({
        sessionId: 'abc',
        cwd: 'D:/demo',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Investigating payment flow.' },
            { type: 'tool_use', name: 'Read', input: { file_path: 'src/payment.ts' } },
            { type: 'tool_result', tool_use_id: 'tool-1', content: 'done' }
          ]
        }
      })
    ].join('\n');

    const events = parseClaudeTranscriptJsonl(raw);
    expect(events.some((event) => event.kind === 'session_started')).toBe(true);
    expect(events.some((event) => event.kind === 'message')).toBe(true);
    expect(events.some((event) => event.kind === 'tool_started')).toBe(true);
    expect(events.some((event) => event.kind === 'tool_completed')).toBe(true);
    expect(events.at(-1)?.kind).toBe('session_ended');
  });
});
