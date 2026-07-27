/**
 * Claude Code HarnessDriver.
 *
 * Reuses agent-flow patterns from:
 *   - extension/src/event-source.ts     → JsonlTailSource (vscode-free)
 *   - extension/src/transcript-parser.ts → TranscriptParser for session JSONL
 *   - extension/src/session-watcher.ts / hook-server.ts / claude-runtime.ts
 *     → composition documented below; full fs discovery + HookServer still live
 *     in extension/ until vscode is stripped for Electron main.
 *
 * Primary scaffold path: AgentEvent JSONL (extension/scripts/simulate-events.js).
 */
import type { AgentEvent } from '../protocol.ts'
import type {
  HarnessDriver,
  HarnessDriverContext,
  HarnessDriverStartOptions,
} from '../harness-driver.ts'
import { JsonlTailSource, parseAgentEventLine } from '../jsonl-tail.ts'
import { TranscriptParser } from '../../../../extension/src/transcript-parser.ts'
import type { WatchedSession } from '../../../../extension/src/protocol.ts'
import { ORCHESTRATOR_NAME, SYSTEM_PROMPT_BASE_TOKENS } from '../../../../extension/src/constants.ts'

function createMinimalSession(sessionId: string): WatchedSession {
  const now = Date.now()
  return {
    sessionId,
    filePath: '',
    fileWatcher: null,
    pollTimer: null,
    fileSize: 0,
    sessionStartTime: now,
    pendingToolCalls: new Map(),
    seenToolUseIds: new Set(),
    seenMessageHashes: new Set(),
    sessionDetected: true,
    sessionCompleted: false,
    lastActivityTime: now,
    inactivityTimer: null,
    subagentWatchers: new Map(),
    spawnedSubagents: new Set(),
    inlineProgressAgents: new Set(),
    subagentsDirWatcher: null,
    subagentsDir: null,
    label: sessionId.slice(0, 8),
    labelSet: false,
    model: null,
    modelDetectedAgents: new Map(),
    permissionTimer: null,
    permissionEmitted: false,
    contextBreakdown: {
      systemPrompt: SYSTEM_PROMPT_BASE_TOKENS,
      userMessages: 0,
      toolResults: 0,
      reasoning: 0,
      subagentResults: 0,
    },
  }
}

export class ClaudeCodeDriver implements HarnessDriver {
  readonly id = 'claude-code'
  readonly label = 'Claude Code'

  private ctx: HarnessDriverContext | null = null
  private tail: { dispose(): void } | null = null
  private readonly sessions = new Map<string, WatchedSession>()
  private sessionStartTimes = new Map<string, number>()

  private readonly parser = new TranscriptParser({
    emit: (event, sessionId) => this.emitWithSession(event, sessionId),
    elapsed: (sessionId) => this.elapsed(sessionId),
    getSession: (sessionId) => this.sessions.get(sessionId),
    fireSessionLifecycle: () => {
      /* lifecycle → ObservationStore is event-stream only for M2 scaffold */
    },
    emitContextUpdate: (agentName, session, sessionId) => {
      const breakdown = session.contextBreakdown
      const tokens =
        breakdown.systemPrompt +
        breakdown.userMessages +
        breakdown.toolResults +
        breakdown.reasoning +
        breakdown.subagentResults
      this.emitWithSession(
        {
          time: this.elapsed(sessionId),
          type: 'context_update',
          payload: { agent: agentName, tokens, breakdown: { ...breakdown } },
        },
        sessionId,
      )
    },
  })

  attach(ctx: HarnessDriverContext): void {
    this.ctx = ctx
  }

  async start(options: HarnessDriverStartOptions = {}): Promise<void> {
    this.stop()
    if (!options.filePath) return

    const mode = options.claudeMode ?? 'agent-events'
    const sessionId = options.sessionId ?? 'claude-session'

    if (mode === 'agent-events') {
      const source = new JsonlTailSource(options.filePath, parseAgentEventLine)
      this.tail = source
      source.subscribe((event) => this.ingestEvent(event))
      if (options.replay) source.replayOnce()
      else source.start()
      return
    }

    // transcript mode — each line is a Claude Code session JSONL record
    const source = new JsonlTailSource(options.filePath, (line) => line)
    this.tail = source
    source.subscribe((line) => this.ingestLine(line, sessionId))
    if (options.replay) source.replayOnce()
    else source.start()
  }

  stop(): void {
    this.tail?.dispose()
    this.tail = null
  }

  ingestEvent(event: AgentEvent): void {
    this.emitWithSession(event, event.sessionId)
  }

  /**
   * Ingest one Claude Code transcript JSONL line via TranscriptParser
   * (same parser SessionWatcher uses).
   */
  ingestLine(line: string, sessionId = 'claude-session'): void {
    const session = this.ensureSession(sessionId)
    this.parser.processTranscriptLine(
      line,
      ORCHESTRATOR_NAME,
      session.pendingToolCalls,
      session.seenToolUseIds,
      sessionId,
      session.seenMessageHashes,
    )
  }

  private ensureSession(sessionId: string): WatchedSession {
    let session = this.sessions.get(sessionId)
    if (!session) {
      session = createMinimalSession(sessionId)
      this.sessions.set(sessionId, session)
      this.sessionStartTimes.set(sessionId, Date.now())
    }
    return session
  }

  private elapsed(sessionId?: string): number {
    const start = sessionId
      ? this.sessionStartTimes.get(sessionId)
      : this.sessionStartTimes.values().next().value
    if (!start) return 0
    return (Date.now() - start) / 1000
  }

  private emitWithSession(event: AgentEvent, sessionId?: string): void {
    if (!this.ctx) {
      throw new Error('ClaudeCodeDriver.attach() must be called before emitting')
    }
    const stamped: AgentEvent = sessionId
      ? { ...event, sessionId: event.sessionId ?? sessionId }
      : event
    this.ctx.emit(stamped)
  }
}

export function createClaudeCodeDriver(): ClaudeCodeDriver {
  return new ClaudeCodeDriver()
}
