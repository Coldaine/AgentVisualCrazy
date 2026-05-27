import type { HarnessCapabilities } from '../harness-driver';

/**
 * Risk heuristic IDs map 1:1 to checks in `shared/derive.ts:collectRiskSignals`.
 * Derive only runs a check whose ID appears in this list, so adding a new
 * harness with a different signal profile (e.g. an OTel-driven driver that
 * has reliable token-spend visibility but no shell calls) is a pure
 * capabilities edit, no derive.ts changes.
 */
export const claudeCodeCapabilities: HarnessCapabilities = {
  // Claude Code's Task tool spawns subagents, but the current normalizer
  // does not yet emit agent_spawned/agent_completed events for them. Keep
  // this false until those event kinds are wired so capability-driven
  // consumers in derive.ts don't infer topology that isn't actually present.
  emitsSubagentEvents: false,
  fileAttention: 'tool-args',
  riskHeuristics: [
    'tool_failures',
    'shell_churn',
    'exploration_volume',
  ],
};
