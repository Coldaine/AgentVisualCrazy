import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getTranscriptCaptureAdapter } from '../src/shared/capture-adapters';
import { claudeTranscriptCaptureAdapter, parseClaudeTranscriptJsonl } from '../src/shared/transcript-adapter';

const FIXTURE_DIR = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = join(FIXTURE_DIR, 'fixtures/transcripts');

describe('parseClaudeTranscriptJsonl', () => {
  it('exposes the Claude transcript adapter as the typed capture boundary', () => {
    const adapter = getTranscriptCaptureAdapter();
    const raw = JSON.stringify({
      sessionId: 'adapter-session',
      message: { role: 'assistant', content: 'hello from adapter' }
    });

    expect(adapter).toBe(claudeTranscriptCaptureAdapter);
    expect(adapter.id).toBe('claude-transcript-jsonl');
    expect(adapter.source).toBe('claude-transcript');
    expect(adapter.parse(raw)).toEqual(parseClaudeTranscriptJsonl(raw));
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

    const events = parseClaudeTranscriptJsonl(raw);
    const secondRunEvents = parseClaudeTranscriptJsonl(raw);

    expect(events.some((event) => event.kind === 'session_started')).toBe(true);
    expect(events.some((event) => event.kind === 'message')).toBe(true);
    expect(events.some((event) => event.kind === 'tool_started')).toBe(true);
    expect(events.some((event) => event.kind === 'tool_failed')).toBe(true);
    expect(events.at(-1)?.kind).toBe('session_ended');
    expect(secondRunEvents).toEqual(events);
  });

  // ── edge cases ────────────────────────────────────────────────────────────

  it('skips malformed JSON lines without aborting the parse', () => {
    const raw = [
      JSON.stringify({ sessionId: 's1', message: { role: 'user', content: 'hello' } }),
      'THIS IS NOT JSON',
      JSON.stringify({ sessionId: 's1', message: { role: 'assistant', content: 'hi' } }),
    ].join('\n');

    const events = parseClaudeTranscriptJsonl(raw);
    const messageEvents = events.filter((e) => e.kind === 'message');
    expect(messageEvents).toHaveLength(2);
  });

  it('returns no events for completely empty input', () => {
    expect(parseClaudeTranscriptJsonl('')).toHaveLength(0);
    expect(parseClaudeTranscriptJsonl('   \n\n  ')).toHaveLength(0);
  });

  it('handles content as a plain string (not array)', () => {
    const raw = JSON.stringify({
      sessionId: 's1',
      message: { role: 'user', content: 'Just a plain string message.' }
    });
    const events = parseClaudeTranscriptJsonl(raw);
    const msgEvent = events.find((e) => e.kind === 'message');
    expect(msgEvent).toBeDefined();
    expect(msgEvent?.payload.text).toBe('Just a plain string message.');
    expect(msgEvent?.actor).toBe('user');
  });

  it('maps tool_result with is_error=false to tool_completed', () => {
    const raw = JSON.stringify({
      sessionId: 's1',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'ok', is_error: false }]
      }
    });
    const events = parseClaudeTranscriptJsonl(raw);
    expect(events.some((e) => e.kind === 'tool_completed')).toBe(true);
    expect(events.some((e) => e.kind === 'tool_failed')).toBe(false);
  });

  it('maps tool_result with is_error=true to tool_failed', () => {
    const raw = JSON.stringify({
      sessionId: 's1',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'err', is_error: true }]
      }
    });
    const events = parseClaudeTranscriptJsonl(raw);
    expect(events.some((e) => e.kind === 'tool_failed')).toBe(true);
  });

  it('silently skips unknown block types', () => {
    const raw = JSON.stringify({
      sessionId: 's1',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Real message.' },
          { type: 'unknown_future_block_type', data: {} },
        ]
      }
    });
    // Should not throw; unknown block just produces no event
    const events = parseClaudeTranscriptJsonl(raw);
    expect(events.some((e) => e.kind === 'message')).toBe(true);
  });

  it('includes thinking blocks as message events', () => {
    const raw = JSON.stringify({
      sessionId: 's1',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'This is my reasoning...' },
          { type: 'text', text: 'My response.' },
        ]
      }
    });
    const events = parseClaudeTranscriptJsonl(raw);
    const messages = events.filter((e) => e.kind === 'message');
    expect(messages.length).toBeGreaterThanOrEqual(2);
  });

  it('always appends session_ended as the last event', () => {
    const raw = JSON.stringify({ sessionId: 's1', message: { role: 'user', content: 'hi' } });
    const events = parseClaudeTranscriptJsonl(raw);
    expect(events.at(-1)?.kind).toBe('session_ended');
    expect(events.at(-1)?.actor).toBe('system');
  });

  it('captures sessionId changes across lines', () => {
    const raw = [
      JSON.stringify({ sessionId: 'first-session', message: { role: 'user', content: 'hello' } }),
      JSON.stringify({ sessionId: 'second-session', message: { role: 'user', content: 'world' } }),
    ].join('\n');
    const events = parseClaudeTranscriptJsonl(raw);
    const sessionIds = [...new Set(events.map((e) => e.sessionId))];
    const sessionEnded = [...events].reverse().find((event) => event.kind === 'session_ended');

    expect(sessionIds).toContain('first-session');
    expect(sessionIds).toContain('second-session');
    expect(sessionEnded?.sessionId).toBe('second-session');
  });

  it('parses the happy-path fixture without errors', () => {
    const raw = readFileSync(join(FIXTURES, 'happy-path.jsonl'), 'utf8');
    const events = parseClaudeTranscriptJsonl(raw);
    expect(events.some((e) => e.kind === 'session_started')).toBe(true);
    expect(events.some((e) => e.kind === 'tool_started')).toBe(true);
    expect(events.some((e) => e.kind === 'tool_completed')).toBe(true);
    expect(events.at(-1)?.kind).toBe('session_ended');
  });

  it('parses the risk-escalation fixture and produces tool_failed events', () => {
    const raw = readFileSync(join(FIXTURES, 'risk-escalation.jsonl'), 'utf8');
    const events = parseClaudeTranscriptJsonl(raw);
    const failures = events.filter((e) => e.kind === 'tool_failed');
    expect(failures.length).toBeGreaterThanOrEqual(3);
  });

  it('parses the tool-heavy fixture and produces multiple tool events', () => {
    const raw = readFileSync(join(FIXTURES, 'tool-heavy.jsonl'), 'utf8');
    const events = parseClaudeTranscriptJsonl(raw);
    const toolEvents = events.filter((e) => e.kind === 'tool_started' || e.kind === 'tool_completed');
    expect(toolEvents.length).toBeGreaterThanOrEqual(8);
  });
});
