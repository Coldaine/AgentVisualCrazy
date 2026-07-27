import type { AgentEvent } from './protocol.ts'

/**
 * Pluggable boundary for one observed AI coding harness (M2 / req §4.3).
 *
 * Drivers adapt agent-flow extension parsers into AgentEvent streams.
 * They do not write to the watched agent's repo (read-only constraint).
 */
export interface HarnessDriverContext {
  /** Deliver a normalized agent-flow event into the ingestion pipeline. */
  emit(event: AgentEvent): void
  /** Optional workspace root for discovery (Claude projects / Codex cwd filter). */
  workspacePath?: string | null
}

export interface HarnessDriverStartOptions {
  /**
   * Path to a JSONL file to watch or replay.
   * Claude: AgentEvent JSONL (simulate-events) or Claude transcript JSONL.
   * Codex: rollout-*.jsonl.
   */
  filePath?: string
  /**
   * How to interpret `filePath` for the Claude driver.
   * - `agent-events` — each line is already an AgentEvent (simulate-events.js)
   * - `transcript` — Claude Code session transcript lines via TranscriptParser
   */
  claudeMode?: 'agent-events' | 'transcript'
  /** When true, read the whole file once instead of watching for appends. */
  replay?: boolean
  sessionId?: string
}

export interface HarnessDriver {
  /** Stable id stamped on StoredObservation.harnessId. */
  readonly id: string
  readonly label: string
  /** Bind the emit sink before start / ingest. */
  attach(ctx: HarnessDriverContext): void
  start(options?: HarnessDriverStartOptions): Promise<void> | void
  stop(): void
  /**
   * Push one raw JSONL line (harness-native format) for tests / replay.
   * Optional — drivers that only support file watch may omit this.
   */
  ingestLine?(line: string, sessionId?: string): void
  /** Push an already-normalized AgentEvent (bypass harness parsing). */
  ingestEvent?(event: AgentEvent): void
}

export class HarnessDriverRegistry {
  private readonly byId = new Map<string, HarnessDriver>()
  private defaultId: string | null = null

  register(driver: HarnessDriver): this {
    this.byId.set(driver.id, driver)
    if (this.defaultId === null) this.defaultId = driver.id
    return this
  }

  get(id: string): HarnessDriver | undefined {
    return this.byId.get(id)
  }

  getDefault(): HarnessDriver {
    const driver = this.defaultId ? this.byId.get(this.defaultId) : undefined
    if (!driver) {
      throw new Error('HarnessDriverRegistry has no registered drivers')
    }
    return driver
  }

  get registeredIds(): string[] {
    return [...this.byId.keys()]
  }
}
