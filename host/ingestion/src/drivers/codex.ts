/**
 * Stub Codex HarnessDriver.
 *
 * Wraps extension/src/codex-rollout-parser.ts (same parser CodexSessionWatcher uses).
 * Full ~/.codex/sessions discovery + fs.watch remains in extension/src/codex-session-watcher.ts;
 * this driver exposes line/file ingest for fixtures and future Electron wiring.
 */
import type { AgentEvent } from '../protocol.ts'
import type {
  HarnessDriver,
  HarnessDriverContext,
  HarnessDriverStartOptions,
} from '../harness-driver.ts'
import { JsonlTailSource } from '../jsonl-tail.ts'
import {
  CodexRolloutParser,
  createCodexRolloutState,
  type CodexRolloutState,
} from '../../../../extension/src/codex-rollout-parser.ts'

export class CodexDriver implements HarnessDriver {
  readonly id = 'codex'
  readonly label = 'Codex CLI (stub)'

  private ctx: HarnessDriverContext | null = null
  private tail: JsonlTailSource<string> | null = null
  private state: CodexRolloutState = createCodexRolloutState()
  private sessionStart = Date.now()
  private sessionId = 'codex-session'

  private readonly parser = new CodexRolloutParser({
    emit: (event) => this.emit(event),
    elapsed: () => (Date.now() - this.sessionStart) / 1000,
    setLabel: () => {
      /* label updates surface via ObservationStore message events */
    },
  })

  attach(ctx: HarnessDriverContext): void {
    this.ctx = ctx
  }

  async start(options: HarnessDriverStartOptions = {}): Promise<void> {
    this.stop()
    this.resetState()
    if (options.sessionId) this.sessionId = options.sessionId
    if (!options.filePath) return

    const source = new JsonlTailSource(options.filePath, (line) => line)
    this.tail = source
    source.subscribe((line) => this.ingestLine(line))
    if (options.replay) source.replayOnce()
    else source.start()
  }

  stop(): void {
    this.tail?.dispose()
    this.tail = null
  }

  ingestEvent(event: AgentEvent): void {
    this.emit(event)
  }

  /** Ingest one Codex rollout JSONL line via CodexRolloutParser. */
  ingestLine(line: string): void {
    this.parser.processLine(line, this.state)
  }

  resetState(): void {
    this.state = createCodexRolloutState()
    this.sessionStart = Date.now()
  }

  private emit(event: AgentEvent): void {
    if (!this.ctx) {
      throw new Error('CodexDriver.attach() must be called before emitting')
    }
    this.ctx.emit({ ...event, sessionId: event.sessionId ?? this.sessionId })
  }
}

export function createCodexDriver(): CodexDriver {
  return new CodexDriver()
}
