/**
 * MCP-facing curator facade (host/mcp curator-bridge).
 *
 * Structurally implements the CuratorFacade expected by host/mcp without
 * importing MCP types (avoids a reverse package dependency). Uses
 * GalleryMemory + CuratorRunner; mock mode when credentials are absent.
 */
import { resolveAuthMode, type AuthMode } from './auth/codex-provider.ts'
import { TokenStore } from './auth/token-store.ts'
import { GalleryMemory } from './gallery-memory.ts'
import { summarizeObservation, type ObservationQuery } from './observation.ts'
import { CuratorRunner, type CuratorInvestigateResult } from './runner.ts'
import type { ExhibitArtifact } from './types.ts'

export interface CuratorFacadeOptions {
  jsonlPath: string | null
  watching: boolean
  /** Force offline mock gallery (also AVC_CURATOR_MODE=mock). */
  forceMock?: boolean
  tokenStore?: TokenStore
  gallery?: GalleryMemory
}

export interface GallerySummary {
  configured: boolean
  artifactCount: number
  artifacts: Array<{
    id: string
    exhibitType?: string
    title?: string
    status?: string
    relevance?: number
  }>
  latestSummary: string | null
}

export interface CuratorStatusSnapshot {
  curatorConfigured: boolean
  storeSize: number
  jsonlPath: string | null
  watching: boolean
  phaseLike: string
  latestEvent: ReturnType<ObservationQuery['recent']>[number] | null
  gallery: GallerySummary
  note?: string
  authMode?: AuthMode
}

export interface CuratorAskResult {
  configured: boolean
  answer: string
  citedEventIds?: string[]
  artifacts?: ExhibitArtifact[]
  mode?: AuthMode
}

export interface CuratorFacade {
  getStatus(store: ObservationQuery): CuratorStatusSnapshot | Promise<CuratorStatusSnapshot>
  ask(
    question: string,
    store: ObservationQuery,
  ): CuratorAskResult | Promise<CuratorAskResult>
}

function inferPhaseLike(store: ObservationQuery): string {
  const recent = store.recent(1)[0]
  if (!recent) return 'idle'
  switch (recent.event.type) {
    case 'agent_spawn':
    case 'subagent_dispatch':
      return 'exploring'
    case 'tool_call_start':
      return 'acting'
    case 'tool_call_end':
      return 'integrating'
    case 'message':
      return 'reasoning'
    case 'agent_complete':
    case 'subagent_return':
      return 'settling'
    default:
      return 'observing'
  }
}

function toGallerySummary(gallery: GalleryMemory, last: CuratorInvestigateResult | null): GallerySummary {
  const artifacts = gallery.list()
  const latestSummary =
    last?.text?.trim().slice(0, 400) ||
    artifacts[0]?.narrative?.slice(0, 400) ||
    null
  return {
    configured: true,
    artifactCount: artifacts.length,
    artifacts: artifacts.map((a) => ({
      id: a.id,
      exhibitType: a.exhibitType,
      title: a.title,
      status: a.status,
      relevance: a.relevance,
    })),
    latestSummary,
  }
}

function formatAskAnswer(
  question: string,
  result: CuratorInvestigateResult,
  cited: string[],
  storeSize: number,
): string {
  const lines = [
    `Question: ${question.trim() || '(empty)'}`,
    `Mode: ${result.mode}${result.skipped ? ` (skipped: ${result.reason ?? 'busy'})` : ''}`,
    `Store size: ${storeSize}`,
    `Gallery: ${result.artifacts.length} artifact(s)`,
  ]

  if (result.artifacts.length > 0) {
    lines.push('', 'Exhibits:')
    for (const a of result.artifacts.slice(0, 8)) {
      lines.push(
        `- [${a.exhibitType}] ${a.title} (relevance=${a.relevance.toFixed(2)}, status=${a.status})`,
      )
      if (a.narrative) lines.push(`  ${a.narrative.slice(0, 220)}`)
    }
  }

  if (cited.length > 0) {
    lines.push('', `Cited event ids: ${cited.join(', ')}`)
  }

  return lines.join('\n')
}

/**
 * Create the MCP curator facade bound to optional JSONL watch metadata.
 */
export function createCuratorFacade(options: CuratorFacadeOptions): CuratorFacade {
  const gallery = options.gallery ?? new GalleryMemory()
  const tokenStore = options.tokenStore ?? new TokenStore()
  const forceMock =
    options.forceMock === true || process.env.AVC_CURATOR_MODE === 'mock'

  let runner: CuratorRunner | null = null
  let boundQuery: ObservationQuery | null = null

  function runnerFor(store: ObservationQuery): CuratorRunner {
    if (!runner || boundQuery !== store) {
      runner = new CuratorRunner({
        query: store,
        gallery,
        tokenStore,
        forceMock,
      })
      boundQuery = store
    }
    return runner
  }

  function currentAuthMode(): AuthMode {
    if (forceMock) return 'mock'
    return resolveAuthMode({ tokenStore })
  }

  return {
    getStatus(store) {
      const mode = currentAuthMode()
      const activeRunner = boundQuery === store ? runner : null
      const latest = store.recent(1)[0] ?? null
      return {
        curatorConfigured: true,
        storeSize: store.size,
        jsonlPath: options.jsonlPath,
        watching: options.watching,
        phaseLike: inferPhaseLike(store),
        latestEvent: latest,
        gallery: toGallerySummary(gallery, activeRunner?.last ?? null),
        authMode: mode,
        note:
          mode === 'mock'
            ? 'curator facade active in mock mode (no OAuth/API credentials); investigations use the offline gallery'
            : `curator facade active (auth=${mode})`,
      }
    },

    async ask(question, store) {
      const q = question.trim()
      const active = runnerFor(store)
      const result = await active.trigger(`mcp-ask: ${q.slice(0, 120) || 'empty'}`)

      const searchHits = q ? store.searchTranscript(q, { limit: 8 }) : []
      const recent = store.recent(5)
      const cited = [
        ...new Set([...searchHits.map((o) => o.id), ...recent.map((o) => o.id)]),
      ]

      // Light evidence preview in the answer when search hits exist.
      const evidence =
        searchHits.length > 0
          ? [
              '',
              'Evidence (transcript search):',
              ...searchHits.slice(0, 5).map((o) => {
                const s = summarizeObservation(o)
                return `- ${o.id} type=${String(s.type)} ${JSON.stringify(s.preview ?? {})}`
              }),
            ].join('\n')
          : ''

      return {
        configured: true,
        answer: `${formatAskAnswer(q, result, cited, store.size)}${evidence}`,
        citedEventIds: cited,
        artifacts: result.artifacts,
        mode: result.mode,
      }
    },
  }
}
