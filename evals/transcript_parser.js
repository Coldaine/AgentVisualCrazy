/**
 * Parse Claude Code stream-json output into structured transcript.
 * @param {string[]} lines - Raw stream-json lines
 * @returns {{ toolCalls: Array, errors: string[], inputTokens: number, outputTokens: number }}
 */
function parseTranscript(lines) {
  const toolCalls = [];
  const errors = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let pendingToolUse = null;

  for (const line of lines) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }

    if (event.type === 'assistant' && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === 'tool_use') {
          pendingToolUse = {
            tool: block.name,
            params: block.input || {},
            toolUseId: block.id,
            result: null,
          };
        }
      }
    }

    if (event.type === 'result' && event.subtype === 'tool_result') {
      const resultText = typeof event.content === 'string'
        ? event.content
        : JSON.stringify(event.content);

      if (event.is_error) {
        errors.push(resultText);
      }

      if (pendingToolUse) {
        pendingToolUse.result = resultText;
        toolCalls.push(pendingToolUse);
        pendingToolUse = null;
      }
    }

    if (event.type === 'usage' && event.usage) {
      inputTokens += event.usage.input_tokens || 0;
      outputTokens += event.usage.output_tokens || 0;
    }
  }

  return { toolCalls, errors, inputTokens, outputTokens };
}

module.exports = { parseTranscript };
