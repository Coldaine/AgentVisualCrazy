const { parseTranscript } = require('../transcript_parser');

describe('parseTranscript', () => {
  test('extracts MCP tool calls from stream-json lines', () => {
    const lines = [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"sidecar_start","input":{"model":"gemini","prompt":"test","agent":"Build"}}]}}',
      '{"type":"result","subtype":"tool_result","tool_use_id":"1","content":"{\\"taskId\\":\\"abc123\\"}"}',
    ];
    const transcript = parseTranscript(lines);
    expect(transcript.toolCalls).toHaveLength(1);
    expect(transcript.toolCalls[0].tool).toBe('sidecar_start');
    expect(transcript.toolCalls[0].params.model).toBe('gemini');
    expect(transcript.toolCalls[0].result).toContain('abc123');
  });

  test('extracts token usage from usage events', () => {
    const lines = [
      '{"type":"usage","usage":{"input_tokens":1000,"output_tokens":500}}',
    ];
    const transcript = parseTranscript(lines);
    expect(transcript.inputTokens).toBe(1000);
    expect(transcript.outputTokens).toBe(500);
  });

  test('captures errors from tool results', () => {
    const lines = [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"sidecar_status","input":{"taskId":"bad"}}]}}',
      '{"type":"result","subtype":"tool_result","tool_use_id":"1","content":"Error: Session bad not found.","is_error":true}',
    ];
    const transcript = parseTranscript(lines);
    expect(transcript.errors).toHaveLength(1);
    expect(transcript.errors[0]).toContain('not found');
  });

  test('handles empty input', () => {
    const transcript = parseTranscript([]);
    expect(transcript.toolCalls).toEqual([]);
    expect(transcript.errors).toEqual([]);
    expect(transcript.inputTokens).toBe(0);
    expect(transcript.outputTokens).toBe(0);
  });

  test('skips malformed JSON lines gracefully', () => {
    const lines = ['not json', '{"type":"usage","usage":{"input_tokens":10,"output_tokens":5}}'];
    const transcript = parseTranscript(lines);
    expect(transcript.inputTokens).toBe(10);
  });

  test('extracts bash commands from Bash tool calls', () => {
    const lines = [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","id":"tu1","input":{"command":"sidecar start --model gemini --briefing \\"test\\""}}]}}',
      '{"type":"result","subtype":"tool_result","tool_use_id":"tu1","content":"Task started: abc123"}',
    ];
    const transcript = parseTranscript(lines);
    expect(transcript.bashCommands).toHaveLength(1);
    expect(transcript.bashCommands[0]).toContain('sidecar start');
  });

  test('extracts bash commands from lowercase bash tool name', () => {
    const lines = [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"bash","id":"tu2","input":{"command":"sidecar read abc123 --summary"}}]}}',
      '{"type":"result","subtype":"tool_result","tool_use_id":"tu2","content":"Summary: ..."}',
    ];
    const transcript = parseTranscript(lines);
    expect(transcript.bashCommands).toHaveLength(1);
    expect(transcript.bashCommands[0]).toContain('sidecar read');
  });

  test('returns empty bashCommands when no bash tool calls', () => {
    const lines = [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"sidecar_start","id":"tu3","input":{"model":"gemini"}}]}}',
      '{"type":"result","subtype":"tool_result","tool_use_id":"tu3","content":"{}"}',
    ];
    const transcript = parseTranscript(lines);
    expect(transcript.bashCommands).toEqual([]);
  });
});
