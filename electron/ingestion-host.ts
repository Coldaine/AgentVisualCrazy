/**
 * Wires host/ingestion (ObservationStore + HarnessDriver) into Electron main.
 *
 * Prefers a live Claude Code transcript under ~/.claude/projects; falls back to
 * host/ingestion/fixtures/simulate-events.jsonl so the renderer still lights up.
 *
 * Forwards store events as vscode-bridge protocol messages (agent-event, config,
 * connection-status, session-started) over the existing avc:host-message channel.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  createIngestionAdapter,
  type AgentEvent,
  type IngestionAdapter,
  type StoredObservation,
} from '../host/ingestion/src/index.ts'

export type HostMessage = Record<string, unknown>

export interface IngestionHostOptions {
  /** Push a vscode-bridge-shaped message to the focused BrowserWindow. */
  send: (message: HostMessage) => void
  /** Override fixture path (tests). */
  fixturePath?: string
  /** Override Claude projects root (tests). */
  claudeProjectsDir?: string
}

export type IngestionSourceKind = 'claude-transcript' | 'fixture'

export interface IngestionHostStatus {
  kind: IngestionSourceKind
  filePath: string
  sessionId: string
  harnessId: string
}

/**
 * Discover the most recently modified Claude Code session JSONL under
 * ~/.claude/projects/<encoded>/<session-uuid>.jsonl
 */
export function findLatestClaudeTranscript(
  projectsDir = path.join(os.homedir(), '.claude', 'projects'),
): { filePath: string; sessionId: string } | null {
  if (!fs.existsSync(projectsDir)) return null

  let best: { filePath: string; sessionId: string; mtime: number } | null = null

  let projectEntries: fs.Dirent[]
  try {
    projectEntries = fs.readdirSync(projectsDir, { withFileTypes: true })
  } catch {
    return null
  }

  for (const project of projectEntries) {
    if (!project.isDirectory()) continue
    const dir = path.join(projectsDir, project.name)
    let files: fs.Dirent[]
    try {
      files = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.jsonl')) continue
      // Session files sit directly under the project dir; skip nested agent trees.
      const filePath = path.join(dir, file.name)
      let mtime: number
      try {
        mtime = fs.statSync(filePath).mtimeMs
      } catch {
        continue
      }
      if (!best || mtime > best.mtime) {
        best = {
          filePath,
          sessionId: path.basename(file.name, '.jsonl'),
          mtime,
        }
      }
    }
  }

  return best ? { filePath: best.filePath, sessionId: best.sessionId } : null
}

function defaultFixturePath(): string {
  return path.join(__dirname, '../host/ingestion/fixtures/simulate-events.jsonl')
}

export class IngestionHost {
  readonly adapter: IngestionAdapter
  private readonly send: (message: HostMessage) => void
  private readonly fixturePath: string
  private readonly claudeProjectsDir: string
  private status: IngestionHostStatus | null = null
  /** When false, adapter IPC emits are dropped (used during fixture bulk replay). */
  private forwardToRenderer = false

  constructor(options: IngestionHostOptions) {
    this.send = options.send
    this.fixturePath = options.fixturePath ?? defaultFixturePath()
    this.claudeProjectsDir =
      options.claudeProjectsDir ?? path.join(os.homedir(), '.claude', 'projects')

    this.adapter = createIngestionAdapter({
      emitIpc: (_channel, payload) => {
        if (!this.forwardToRenderer) return
        const msg = payload as { type?: string; event?: AgentEvent }
        if (msg?.type !== 'agent-event' || !msg.event) return
        this.send({
          type: 'agent-event',
          event: this.stampSession(msg.event),
        })
      },
    })
  }

  get query() {
    return this.adapter.query
  }

  get currentStatus(): IngestionHostStatus | null {
    return this.status
  }

  /** Curator lookback helper — recent StoredObservations. */
  queryRecent(n = 50): StoredObservation[] {
    return this.adapter.query.recent(n)
  }

  /**
   * Called when the renderer sends `{ type: 'ready' }`.
   * Announces config/session, then starts ingestion so events arrive after
   * the visualizer has a selected session.
   */
  async onRendererReady(): Promise<IngestionHostStatus> {
    this.adapter.stopAll()
    this.adapter.store.clear()
    this.forwardToRenderer = false

    const planned = this.planSource()
    this.status = planned

    this.send({
      type: 'config',
      config: { showMockData: false, mode: 'live', autoPlay: true },
    })
    this.send({
      type: 'connection-status',
      status: planned.kind === 'claude-transcript' ? 'watching' : 'connected',
      source: planned.kind === 'claude-transcript' ? 'claude-code' : 'fixture',
    })
    this.send({
      type: 'session-started',
      session: {
        id: planned.sessionId,
        label:
          planned.kind === 'claude-transcript'
            ? planned.sessionId.slice(0, 8)
            : 'simulate-events',
        status: 'active',
        startTime: Date.now(),
        lastActivityTime: Date.now(),
      },
    })

    await this.startPlanned(planned)
    return planned
  }

  dispose(): void {
    this.adapter.stopAll()
    this.forwardToRenderer = false
  }

  private planSource(): IngestionHostStatus {
    const transcript = findLatestClaudeTranscript(this.claudeProjectsDir)
    if (transcript && fs.existsSync(transcript.filePath)) {
      return {
        kind: 'claude-transcript',
        filePath: transcript.filePath,
        sessionId: transcript.sessionId,
        harnessId: 'claude-code',
      }
    }

    if (!fs.existsSync(this.fixturePath)) {
      throw new Error(
        `[ingestion-host] No Claude transcript and fixture missing: ${this.fixturePath}`,
      )
    }

    return {
      kind: 'fixture',
      filePath: this.fixturePath,
      sessionId: 'simulate-events',
      harnessId: 'claude-code',
    }
  }

  private async startPlanned(planned: IngestionHostStatus): Promise<void> {
    if (planned.kind === 'claude-transcript') {
      console.log(`[ingestion-host] Claude transcript: ${planned.filePath}`)
      this.forwardToRenderer = true
      await this.adapter.startDriver('claude-code', {
        filePath: planned.filePath,
        claudeMode: 'transcript',
        sessionId: planned.sessionId,
        replay: false,
      })
      return
    }

    console.log(`[ingestion-host] Fixture replay: ${planned.filePath}`)
    // Bulk-load into the store without per-event IPC, then one batch.
    this.forwardToRenderer = false
    await this.adapter.startDriver('claude-code', {
      filePath: planned.filePath,
      claudeMode: 'agent-events',
      sessionId: planned.sessionId,
      replay: true,
    })
    for (const obs of this.adapter.query.getAll()) {
      if (!obs.event.sessionId) {
        obs.event.sessionId = planned.sessionId
      }
    }
    const events = this.adapter.query.getAll().map((o) => this.stampSession(o.event))
    this.forwardToRenderer = true
    if (events.length > 0) {
      this.send({ type: 'agent-event-batch', events })
    }
  }

  private stampSession(event: AgentEvent): AgentEvent {
    const sessionId = event.sessionId ?? this.status?.sessionId
    return sessionId ? { ...event, sessionId } : event
  }
}
