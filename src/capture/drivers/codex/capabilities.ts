import type { HarnessCapabilities } from '../harness-driver';

/**
 * Risk heuristic IDs map 1:1 to checks in `shared/derive.ts:collectRiskSignals`.
 * See claude-code/capabilities.ts for the general rationale.
 *
 * Codex-specific notes:
 * - `repeated_searches` is new for Codex (the GHCR-403 stuck signature: n>=3
 *   near-identical web_search queries in a window). It is implemented
 *   capability-driven in derive.ts, not as Codex-only branching, so any other
 *   driver can opt in by declaring the same ID.
 * - `toolNameMap` normalizes Codex's tool vocabulary onto the same generic
 *   names derive.ts's phase detection and shell_churn/exploration_volume
 *   checks already key off of (Claude Code's `Edit`/`Bash`/etc equivalents):
 *   `apply_patch` -> `edit` so patch application is recognized as
 *   implementation work, and `exec` -> `bash` so shell_churn can see Codex's
 *   shell tool. Without this map those two checks would be permanently dead
 *   for Codex sessions despite being declared.
 */
export const codexCapabilities: HarnessCapabilities = {
  // Codex's `wait` tool call surfaces coordinator/subagent polling, but v1
  // does not reconstruct subagent topology from it (see plan-codex-replay.md
  // non-goals). Keep this false until that upgrade lands.
  emitsSubagentEvents: false,
  fileAttention: 'tool-args',
  toolNameMap: (name) => {
    if (name === 'apply_patch') return 'edit';
    if (name === 'exec') return 'bash';
    return name;
  },
  riskHeuristics: [
    'tool_failures',
    'shell_churn',
    'exploration_volume',
    'repeated_searches',
  ],
};
