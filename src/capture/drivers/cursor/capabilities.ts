import type { HarnessCapabilities } from '../harness-driver';

/**
 * Cursor tool names (Shell, Read, Write, Grep, Delete, Task, MCP:…) differ
 * from Claude Code's. Map the common ones so derive.ts phase detection and
 * risk heuristics stay meaningful without forking derive.
 */
export function cursorToolNameMap(toolName: string): string {
  const lowered = toolName.toLowerCase();
  if (lowered === 'shell' || lowered.startsWith('shell:')) return 'Bash';
  if (lowered === 'write' || lowered === 'edit' || lowered === 'delete') return 'Edit';
  if (lowered === 'read' || lowered === 'grep') return 'Read';
  if (lowered === 'task') return 'Task';
  if (lowered.startsWith('mcp:')) return toolName.slice(4) || toolName;
  return toolName;
}

export const cursorCapabilities: HarnessCapabilities = {
  // Cursor fires subagentStart / subagentStop hooks; the normalizer emits
  // agent_spawned / agent_completed for them.
  emitsSubagentEvents: true,
  fileAttention: 'tool-args',
  toolNameMap: cursorToolNameMap,
  riskHeuristics: [
    'tool_failures',
    'shell_churn',
    'exploration_volume',
  ],
};
