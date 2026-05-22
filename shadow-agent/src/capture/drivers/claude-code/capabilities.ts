import type { HarnessCapabilities } from '../harness-driver';

export const claudeCodeCapabilities: HarnessCapabilities = {
  emitsSubagentEvents: true,
  fileAttention: 'tool-args',
  riskHeuristics: [
    'many_deletes',
    'large_write',
    'shell_exec',
  ],
};
