/**
 * Optional binding to host/curator (Mastra). Until that module exists, MCP tools
 * operate on ObservationStore alone and curator_ask returns a clear stub message.
 *
 * Follow-up: when host/curator exports a facade, resolve it here — no MCP API change.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ObservationQuery, StoredObservation } from '@agentvisualcrazy/ingestion'

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
  latestEvent: StoredObservation | null
  gallery: GallerySummary
  note?: string
}

export interface CuratorAskResult {
  configured: boolean
  answer: string
  citedEventIds?: string[]
}

export interface CuratorFacade {
  getStatus(store: ObservationQuery): CuratorStatusSnapshot | Promise<CuratorStatusSnapshot>
  ask(
    question: string,
    store: ObservationQuery,
  ): CuratorAskResult | Promise<CuratorAskResult>
}

const CURATOR_NOT_CONFIGURED =
  'curator not configured — host/curator is not present yet; MCP is ObservationStore-only until the Mastra curator is wired'

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

function stubGallery(): GallerySummary {
  return {
    configured: false,
    artifactCount: 0,
    artifacts: [],
    latestSummary: null,
  }
}

/** Default facade used when host/curator is missing. */
export function createStubCuratorFacade(options: {
  jsonlPath: string | null
  watching: boolean
}): CuratorFacade {
  return {
    getStatus(store) {
      const latest = store.recent(1)[0] ?? null
      return {
        curatorConfigured: false,
        storeSize: store.size,
        jsonlPath: options.jsonlPath,
        watching: options.watching,
        phaseLike: inferPhaseLike(store),
        latestEvent: latest,
        gallery: stubGallery(),
        note: CURATOR_NOT_CONFIGURED,
      }
    },
    ask(question, store) {
      const recent = store.recent(5)
      const cited = recent.map((o) => o.id)
      return {
        configured: false,
        answer: [
          CURATOR_NOT_CONFIGURED,
          '',
          `Question: ${question.trim() || '(empty)'}`,
          `Store size: ${store.size}`,
          cited.length
            ? `Last event ids (store only, no investigation): ${cited.join(', ')}`
            : 'Store is empty — no events to summarize.',
        ].join('\n'),
        citedEventIds: cited,
      }
    },
  }
}

/**
 * Try dynamic import of host/curator entry points. Returns null if absent.
 * Expected future export: `{ createCuratorFacade }` or default `{ createCuratorFacade }`.
 */
export async function tryLoadCuratorFacade(options: {
  jsonlPath: string | null
  watching: boolean
}): Promise<CuratorFacade> {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '../../curator/src/index.ts'),
    join(here, '../../curator/src/facade.ts'),
    join(here, '../../curator/index.ts'),
  ]

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    try {
      const mod = (await import(pathToFileURL(candidate).href)) as {
        createCuratorFacade?: (opts: typeof options) => CuratorFacade | Promise<CuratorFacade>
        default?: {
          createCuratorFacade?: (opts: typeof options) => CuratorFacade | Promise<CuratorFacade>
        }
      }
      const factory = mod.createCuratorFacade ?? mod.default?.createCuratorFacade
      if (typeof factory === 'function') {
        return await factory(options)
      }
    } catch (err) {
      console.error('[mcp] host/curator present but failed to load; using stub:', err)
    }
  }

  return createStubCuratorFacade(options)
}
