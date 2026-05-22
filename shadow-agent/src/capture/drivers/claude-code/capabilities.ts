import type { HarnessCapabilities } from '../harness-driver';

export const claudeCodeCapabilities: HarnessCapabilities = {
  supportsSubagents: true,
  supportsThinking: true,
  supportsPermissions: true,
  transportKinds: ['file-tail']
};
