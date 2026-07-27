/**
 * Wires Mastra curator into Electron main (M11–M12).
 * Triggers on timer and/or observation event-count; publishes exhibit artifacts via IPC.
 */

import { safeStorage } from 'electron'
import {
  CuratorRunner,
  TokenStore,
  type AuthMode,
  type CuratorInvestigateResult,
  type ExhibitArtifact,
  type ObservationQuery,
} from '../host/curator/src/index.ts'
import { IPC } from './ipc-channels'

export type HostMessage = Record<string, unknown>

export interface CuratorHostOptions {
  query: ObservationQuery
  send: (message: HostMessage) => void
  /** Optional dedicated IPC publish (defaults to also sending on EXHIBIT_ARTIFACTS). */
  sendExhibits?: (message: HostMessage) => void
  /** Timer interval ms (default 45s). Set 0 to disable timer. */
  intervalMs?: number
  /** Fire when store grows by this many events (default 25). Set 0 to disable. */
  eventCountThreshold?: number
  /** Override token store (tests). */
  tokenStore?: TokenStore
  forceMock?: boolean
}

export class CuratorHost {
  private readonly send: (message: HostMessage) => void
  private readonly sendExhibits: (message: HostMessage) => void
  private readonly query: ObservationQuery
  readonly runner: CuratorRunner
  readonly tokenStore: TokenStore
  private timer: ReturnType<typeof setInterval> | null = null
  private unsub: (() => void) | null = null
  private lastSize = 0
  private readonly intervalMs: number
  private readonly eventCountThreshold: number
  private started = false

  constructor(options: CuratorHostOptions) {
    this.send = options.send
    this.sendExhibits = options.sendExhibits ?? options.send
    this.query = options.query
    this.intervalMs = options.intervalMs ?? Number(process.env.AVC_CURATOR_INTERVAL_MS ?? 45_000)
    this.eventCountThreshold =
      options.eventCountThreshold ?? Number(process.env.AVC_CURATOR_EVENT_THRESHOLD ?? 25)

    this.tokenStore =
      options.tokenStore ??
      new TokenStore({
        safeStorage: {
          isEncryptionAvailable: () => {
            try {
              return safeStorage.isEncryptionAvailable()
            } catch {
              return false
            }
          },
          encryptString: (plain) => safeStorage.encryptString(plain),
          decryptString: (buf) => safeStorage.decryptString(buf),
        },
      })

    const preferEnv = process.env.AVC_CURATOR_AUTH as AuthMode | undefined
    this.runner = new CuratorRunner({
      query: options.query,
      tokenStore: this.tokenStore,
      forceMock: options.forceMock,
      modelOptions: {
        // OAuth or offline mock only — no OPENAI_API_KEY / Platform API path.
        prefer: preferEnv === 'oauth' || preferEnv === 'mock' ? preferEnv : undefined,
      },
    })
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.lastSize = this.query.size

    if (this.intervalMs > 0) {
      this.timer = setInterval(() => {
        void this.fire('timer')
      }, this.intervalMs)
      // Don't keep the event loop alive solely for curator ticks.
      this.timer.unref?.()
    }

    // Event-count trigger via polling size (ObservationQuery has no subscribe).
    if (this.eventCountThreshold > 0) {
      const poll = setInterval(() => {
        const size = this.query.size
        if (size - this.lastSize >= this.eventCountThreshold) {
          this.lastSize = size
          void this.fire('event-count')
        }
      }, 2_000)
      poll.unref?.()
      this.unsub = () => clearInterval(poll)
    }

    console.log(
      `[curator-host] started (interval=${this.intervalMs}ms, eventThreshold=${this.eventCountThreshold})`,
    )
  }

  /** Kick an investigation immediately (e.g. after renderer ready + ingestion). */
  async kick(reason = 'kick'): Promise<CuratorInvestigateResult> {
    return this.fire(reason)
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.unsub?.()
    this.unsub = null
    this.started = false
  }

  private async fire(reason: string): Promise<CuratorInvestigateResult> {
    const result = await this.runner.trigger(reason)
    if (result.skipped) {
      console.log(`[curator-host] skipped: ${result.reason}`)
      return result
    }
    this.publish(result.artifacts, result.mode, reason)
    return result
  }

  private publish(artifacts: ExhibitArtifact[], mode: AuthMode, reason: string): void {
    const message = {
      type: 'exhibit-artifacts' as const,
      channel: IPC.EXHIBIT_ARTIFACTS,
      artifacts,
      mode,
      reason,
      at: Date.now(),
    }
    this.send(message)
    this.sendExhibits(message)
    console.log(
      `[curator-host] published ${artifacts.length} artifacts (mode=${mode}, reason=${reason})`,
    )
  }
}
