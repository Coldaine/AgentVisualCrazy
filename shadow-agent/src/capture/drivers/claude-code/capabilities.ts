import type { HarnessCapabilities } from '../harness-driver';

export const claudeCodeCapabilities: HarnessCapabilities = {
  // Claude Code's Task tool spawns subagents, but the current normalizer
  // does not yet emit agent_spawned/agent_completed events for them. Keep
  // this false until those event kinds are wired so capability-driven
  // consumers in derive.ts don't infer topology that isn't actually present.
  emitsSubagentEvents: false,
  fileAttention: 'tool-args',
  riskHeuristics: [
    'many_deletes',
    'large_write',
    'shell_exec',
  ],
};
