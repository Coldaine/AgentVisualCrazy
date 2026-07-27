import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { GalleryMemory } from './gallery-memory.ts'
import type { ObservationQuery } from './observation.ts'
import { summarizeObservation } from './observation.ts'

/**
 * Read-only lookback tools over ObservationStore + gallery memory (M3, M5, M7).
 * NEVER register Write / Edit / Bash against the watched repo.
 */
export function createCuratorTools(query: ObservationQuery, gallery: GalleryMemory) {
  const recentEvents = createTool({
    id: 'recent_events',
    description:
      'Return the N most recent observations from the session store (newest last). Use for lookback.',
    inputSchema: z.object({
      n: z.number().int().min(1).max(200).default(40).describe('How many recent events'),
    }),
    execute: async ({ n }) => {
      const rows = query.recent(n ?? 40).map(summarizeObservation)
      return { count: rows.length, storeSize: query.size, events: rows }
    },
  })

  const eventsByType = createTool({
    id: 'events_by_type',
    description: 'Filter observations by agent-flow event type(s), e.g. tool_call_end, message.',
    inputSchema: z.object({
      types: z
        .union([z.string(), z.array(z.string())])
        .describe('Event type or list of types'),
      limit: z.number().int().min(1).max(200).optional(),
    }),
    execute: async ({ types, limit }) => {
      const list = Array.isArray(types) ? types : [types]
      let rows = query.byType(list).map(summarizeObservation)
      if (limit != null) rows = rows.slice(-limit)
      return { count: rows.length, types: list, events: rows }
    },
  })

  const searchTranscript = createTool({
    id: 'search_transcript',
    description:
      'Case-insensitive substring search over transcript-ish fields (messages, tool args/results).',
    inputSchema: z.object({
      query: z.string().min(1).describe('Substring to find'),
      limit: z.number().int().min(1).max(100).default(30),
    }),
    execute: async ({ query: q, limit }) => {
      const rows = query
        .searchTranscript(q, { limit: limit ?? 30 })
        .map(summarizeObservation)
      return { count: rows.length, query: q, events: rows }
    },
  })

  const getObservation = createTool({
    id: 'get_observation',
    description: 'Fetch a single observation by id for evidence citation.',
    inputSchema: z.object({
      id: z.string().min(1).describe('Observation id, e.g. obs-12'),
    }),
    execute: async ({ id }) => {
      const obs = query.getById(id)
      if (!obs) return { found: false as const, id }
      return { found: true as const, observation: summarizeObservation(obs) }
    },
  })

  const listPriorArtifacts = createTool({
    id: 'list_prior_artifacts',
    description:
      'List exhibit artifacts already in session gallery memory (optionally including retired).',
    inputSchema: z.object({
      includeRetired: z.boolean().optional().default(false),
    }),
    execute: async ({ includeRetired }) => {
      const artifacts = gallery.list({ includeRetired: includeRetired ?? false })
      return {
        count: artifacts.length,
        artifacts: artifacts.map((a) => ({
          id: a.id,
          exhibitType: a.exhibitType,
          title: a.title,
          status: a.status,
          relevance: a.relevance,
          narrative: a.narrative,
          createdAtEvent: a.createdAtEvent,
          refreshedAtEvent: a.refreshedAtEvent,
          retirementReason: a.retirementReason,
        })),
      }
    },
  })

  return {
    recentEvents,
    eventsByType,
    searchTranscript,
    getObservation,
    listPriorArtifacts,
  }
}

/** Tool ids registered on the curator — used by tests to assert no mutation tools. */
export const CURATOR_TOOL_IDS = [
  'recent_events',
  'events_by_type',
  'search_transcript',
  'get_observation',
  'list_prior_artifacts',
] as const

export const FORBIDDEN_TOOL_IDS = [
  'Write',
  'Edit',
  'Bash',
  'write_file',
  'edit_file',
  'run_terminal',
] as const
