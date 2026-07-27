import { HarnessDriverRegistry } from '../harness-driver.ts'
import { createClaudeCodeDriver } from './claude-code.ts'
import { createCodexDriver } from './codex.ts'

export { ClaudeCodeDriver, createClaudeCodeDriver } from './claude-code.ts'
export { CodexDriver, createCodexDriver } from './codex.ts'

/** Registry seeded with in-tree drivers (Claude first; Codex stub). */
export function createDefaultDriverRegistry(): HarnessDriverRegistry {
  return new HarnessDriverRegistry()
    .register(createClaudeCodeDriver())
    .register(createCodexDriver())
}
