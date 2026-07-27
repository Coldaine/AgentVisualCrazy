/**
 * vscode-free JSONL tail — same contract as extension/src/event-source.ts
 * (JsonlEventSource) but using TypedEventEmitter so it runs in Electron main.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { TypedEventEmitter } from '../../../extension/src/typed-event-emitter.ts'
import { readNewFileLines } from '../../../extension/src/fs-utils.ts'
import type { AgentEvent } from './protocol.ts'

export type JsonlLineParser<T> = (line: string) => T | null

export function parseAgentEventLine(line: string): AgentEvent | null {
  try {
    const parsed = JSON.parse(line.trim()) as Partial<AgentEvent>
    if (parsed && typeof parsed.type === 'string' && typeof parsed.time === 'number') {
      return parsed as AgentEvent
    }
    return null
  } catch {
    return null
  }
}

export class JsonlTailSource<T> {
  private watcher: fs.FSWatcher | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private fileSize = 0
  private tail = ''
  private readonly onLine = new TypedEventEmitter<T>()
  private readonly onStatus = new TypedEventEmitter<'connected' | 'disconnected'>()

  readonly subscribe = this.onLine.event
  readonly onConnection = this.onStatus.event

  constructor(
    private readonly filePath: string,
    private readonly parseLine: JsonlLineParser<T>,
    private readonly pollMs = 500,
  ) {}

  /** Read existing content and begin watching for appends. */
  start(): void {
    if (!fs.existsSync(this.filePath)) {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      fs.writeFileSync(this.filePath, '')
    }

    const stat = fs.statSync(this.filePath)
    this.fileSize = 0
    this.tail = ''
    this.readFrom(0)
    this.fileSize = stat.size

    try {
      this.watcher = fs.watch(this.filePath, (eventType) => {
        if (eventType === 'change') this.readNew()
      })
    } catch {
      // fall through to poll
    }

    this.pollTimer = setInterval(() => this.readNew(), this.pollMs)
    this.onStatus.fire('connected')
  }

  /** One-shot replay of the entire file (no watch). */
  replayOnce(): void {
    if (!fs.existsSync(this.filePath)) return
    this.fileSize = 0
    this.tail = ''
    this.readFrom(0)
  }

  private readFrom(offset: number): void {
    const result = readNewFileLines(this.filePath, offset, this.tail)
    if (!result) return
    this.fileSize = result.newSize
    this.tail = result.tail
    for (const line of result.lines) {
      const value = this.parseLine(line)
      if (value !== null) this.onLine.fire(value)
    }
  }

  private readNew(): void {
    this.readFrom(this.fileSize)
  }

  dispose(): void {
    this.watcher?.close()
    this.watcher = null
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.onStatus.fire('disconnected')
    this.onLine.dispose()
    this.onStatus.dispose()
  }
}
