/**
 * Parse Claude Code stream-json output into structured transcript.
 * @param {string[]} lines - Raw stream-json lines
 * @returns {{ toolCalls: Array, bashCommands: string[], errors: string[], inputTokens: number, outputTokens: number }}
 */
function parseTranscript(lines) {
  const toolCalls = [];
  const bashCommands = [];
  const errors = [];
  let inputTokens = 0;
  let outputTokens = 0;
  const pendingToolUses = new Map(); // tool_use_id -> { tool, params, toolUseId, result }
  const BASH_TOOL_NAMES = new Set(['Bash', 'bash', 'execute_command', 'shell']);

  for (const line of lines) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }

    if (event.type === 'assistant' && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === 'tool_use') {
          pendingToolUses.set(block.id, {
            tool: block.name,
            params: block.input || {},
            toolUseId: block.id,
            result: null,
          });
          if (BASH_TOOL_NAMES.has(block.name) && block.input?.command) {
            bashCommands.push(block.input.command);
          }
        }
      }
      // Extract per-message token usage
      if (event.message.usage) {
        inputTokens += event.message.usage.input_tokens || 0;
        outputTokens += event.message.usage.output_tokens || 0;
      }
    }

    // Tool results in user events (standard stream-json format)
    if (event.type === 'user' && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === 'tool_result') {
          const resultText = extractResultText(block.content);
          if (block.is_error) {
            errors.push(resultText);
          }
          const pending = pendingToolUses.get(block.tool_use_id);
          if (pending) {
            pending.result = resultText;
            toolCalls.push(pending);
            pendingToolUses.delete(block.tool_use_id);
          }
        }
      }
    }

    // Tool results as result events (legacy format)
    if (event.type === 'result' && event.subtype === 'tool_result') {
      const resultText = extractResultText(event.content);
      if (event.is_error) {
        errors.push(resultText);
      }
      // Match to most recent pending tool use
      const lastKey = [...pendingToolUses.keys()].pop();
      if (lastKey) {
        const pending = pendingToolUses.get(lastKey);
        pending.result = resultText;
        toolCalls.push(pending);
        pendingToolUses.delete(lastKey);
      }
    }

    // Final result event has authoritative total usage
    if (event.type === 'result' && event.subtype === 'success' && event.usage) {
      inputTokens = event.usage.input_tokens || 0;
      outputTokens = event.usage.output_tokens || 0;
    }

    // Legacy: standalone usage events (if any)
    if (event.type === 'usage' && event.usage) {
      inputTokens += event.usage.input_tokens || 0;
      outputTokens += event.usage.output_tokens || 0;
    }
  }

  return { toolCalls, bashCommands, errors, inputTokens, outputTokens };
}

/** Extract text from tool result content (string, array, or object) */
function extractResultText(content) {
  if (typeof content === 'string') { return content; }
  if (Array.isArray(content)) {
    return content.map(c => c.text || JSON.stringify(c)).join('\n');
  }
  return JSON.stringify(content);
}

module.exports = { parseTranscript };
