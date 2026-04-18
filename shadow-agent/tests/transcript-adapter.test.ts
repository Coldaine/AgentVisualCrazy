import { describe, expect, it } from 'vitest';
import { getTranscriptCaptureAdapter } from '../src/shared/capture-adapters';
import { claudeTranscriptCaptureAdapter, parseClaudeTranscriptJsonl } from '../src/shared/transcript-adapter';

describe('parseClaudeTranscriptJsonl', () => {
  it('exposes explicit capture adapter metadata for the Claude transcript implementation', () => {
    expect(claudeTranscriptCaptureAdapter.id).toBe('claude-transcript-jsonl');
    expect(claudeTranscriptCaptureAdapter.source).toBe('claude-transcript');
  });

  it('converts text, tool_use, and tool_result blocks into canonical events deterministically', () => {
    const raw = [
      JSON.stringify({
        sessionId: 'abc',
        cwd: 'D:/demo',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Investigating payment flow.' },
            { type: 'tool_use', name: 'Read', input: { file_path: 'src/payment.ts' } },
            { type: 'tool_result', tool_use_id: 'tool-1', content: 'done', is_error: true }
          ]
        }
      })
    ].join('\n');

    const events = claudeTranscriptCaptureAdapter.parse(raw);
    const secondRunEvents = parseClaudeTranscriptJsonl(raw);

    expect(events.some((event) => event.kind === 'session_started')).toBe(true);
    expect(events.some((event) => event.kind === 'message')).toBe(true);
    expect(events.some((event) => event.kind === 'tool_started')).toBe(true);
    expect(events.some((event) => event.kind === 'tool_failed')).toBe(true);
    expect(events.at(-1)?.kind).toBe('session_ended');
    expect(secondRunEvents).toEqual(events);
  });

  it('routes callers through the internal transcript adapter interface', () => {
    expect(getTranscriptCaptureAdapter()).toBe(claudeTranscriptCaptureAdapter);
  });
});
