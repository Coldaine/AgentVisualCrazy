import type { Agent } from '@mastra/core/agent'
import { createCuratorAgent } from './agent.ts'
import { createCuratorModel, type AuthMode, type ResolveModelOptions } from './auth/codex-provider.ts'
import type { TokenStore } from './auth/token-store.ts'
import { GalleryMemory } from './gallery-memory.ts'
import { buildMockArtifacts, mockInvestigateText } from './mock-model.ts'
import type { ObservationQuery } from './observation.ts'
import { parseExhibitArtifacts } from './parse-artifacts.ts'
import type { ExhibitArtifact } from './types.ts'

export interface CuratorInvestigateResult {
  artifacts: ExhibitArtifact[]
  mode: AuthMode
  skipped: boolean
  reason?: string
  text?: string
  eventCursor: number
}

export interface CuratorRunnerOptions {
  query: ObservationQuery
  gallery?: GalleryMemory
  tokenStore?: TokenStore
  modelOptions?: Omit<ResolveModelOptions, 'tokenStore' | 'mockModel'>
  /** Force mock path (also AVC_CURATOR_MODE=mock). */
  forceMock?: boolean
  maxSteps?: number
  /** Injected agent factory for tests. */
  createAgent?: typeof createCuratorAgent
  /** Override investigate implementation (tests). */
  investigateFn?: (prompt: string) => Promise<{ text: string }>
}

/**
 * Single-flight curator runner (M12). At most one investigation in flight.
 */
export class CuratorRunner {
  readonly gallery: GalleryMemory
  private readonly query: ObservationQuery
  private readonly tokenStore?: TokenStore
  private readonly modelOptions: CuratorRunnerOptions['modelOptions']
  private readonly forceMock: boolean
  private readonly maxSteps: number
  private readonly createAgent: typeof createCuratorAgent
  private readonly investigateFn?: CuratorRunnerOptions['investigateFn']
  private inFlight: Promise<CuratorInvestigateResult> | null = null
  private lastResult: CuratorInvestigateResult | null = null

  constructor(options: CuratorRunnerOptions) {
    this.query = options.query
    this.gallery = options.gallery ?? new GalleryMemory()
    this.tokenStore = options.tokenStore
    this.modelOptions = options.modelOptions
    this.forceMock =
      options.forceMock === true || process.env.AVC_CURATOR_MODE === 'mock'
    this.maxSteps = options.maxSteps ?? 8
    this.createAgent = options.createAgent ?? createCuratorAgent
    this.investigateFn = options.investigateFn
  }

  get busy(): boolean {
    return this.inFlight != null
  }

  get last(): CuratorInvestigateResult | null {
    return this.lastResult
  }

  /**
   * Trigger an investigation. If one is already running, returns skipped=true
   * without starting a second flight (M12).
   */
  trigger(reason = 'manual'): Promise<CuratorInvestigateResult> {
    if (this.inFlight) {
      return Promise.resolve({
        artifacts: this.gallery.list(),
        mode: this.lastResult?.mode ?? 'mock',
        skipped: true,
        reason: `single-flight: already running (${reason})`,
        eventCursor: this.query.size,
      })
    }

    this.inFlight = this.runInvestigate(reason).finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async runInvestigate(reason: string): Promise<CuratorInvestigateResult> {
    const eventCursor = this.query.size
    const prefer =
      this.forceMock || this.modelOptions?.prefer === 'mock'
        ? 'mock'
        : this.modelOptions?.prefer

    let mode: AuthMode = 'mock'
    let text: string

    if (prefer === 'mock' || this.forceMock) {
      mode = 'mock'
      text = mockInvestigateText(eventCursor)
    } else if (this.investigateFn) {
      // Test injection only — not Platform API auth.
      mode = 'oauth'
      const result = await this.investigateFn(this.buildPrompt(reason, eventCursor))
      text = result.text
    } else {
      try {
        const resolved = createCuratorModel({
          ...this.modelOptions,
          tokenStore: this.tokenStore,
          prefer,
        })
        mode = resolved.mode
        const agent = this.createAgent({
          query: this.query,
          gallery: this.gallery,
          model: resolved.model,
        })
        text = await this.generateWithAgent(agent, reason, eventCursor)
      } catch (err) {
        // No credentials → deterministic offline gallery.
        console.warn('[curator] model unavailable, using mock:', err)
        mode = 'mock'
        text = mockInvestigateText(eventCursor)
      }
    }

    let artifacts: ExhibitArtifact[]
    try {
      artifacts = parseExhibitArtifacts(text, eventCursor)
    } catch (err) {
      console.warn('[curator] failed to parse artifacts, using mock fallback:', err)
      artifacts = buildMockArtifacts(eventCursor)
    }

    if (artifacts.length === 0) {
      artifacts = buildMockArtifacts(eventCursor)
    }

    const upserted = this.gallery.upsertMany(artifacts, eventCursor)
    const result: CuratorInvestigateResult = {
      artifacts: upserted,
      mode,
      skipped: false,
      reason,
      text,
      eventCursor,
    }
    this.lastResult = result
    return result
  }

  private buildPrompt(reason: string, eventCursor: number): string {
    return [
      `Investigate the current session and curate exhibit artifacts.`,
      `Trigger reason: ${reason}`,
      `Observation store size (event cursor): ${eventCursor}`,
      `Prior gallery size: ${this.gallery.size}`,
      `Use lookback tools first, then respond with a JSON array of ExhibitArtifact only.`,
    ].join('\n')
  }

  private async generateWithAgent(
    agent: Agent,
    reason: string,
    eventCursor: number,
  ): Promise<string> {
    const prompt = this.buildPrompt(reason, eventCursor)
    const result = await agent.generate(prompt, {
      maxSteps: this.maxSteps,
    })
    // Mastra generate result exposes `.text`
    const text =
      typeof result === 'object' && result && 'text' in result
        ? String((result as { text: unknown }).text ?? '')
        : String(result ?? '')
    return text
  }
}
