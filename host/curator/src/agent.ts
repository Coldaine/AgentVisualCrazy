import { Agent } from '@mastra/core/agent'
import type { GalleryMemory } from './gallery-memory.ts'
import type { ObservationQuery } from './observation.ts'
import { CURATOR_SYSTEM_PROMPT } from './prompts.ts'
import { createCuratorTools } from './tools.ts'

export interface CreateCuratorAgentOptions {
  query: ObservationQuery
  gallery: GalleryMemory
  /** Mastra model config (string router id, LanguageModel, or wrapLanguageModel result). */
  model: unknown
  id?: string
  name?: string
  instructions?: string
}

/**
 * Multi-step Mastra curator agent with read-only lookback tools (M3, M7, M11).
 */
export function createCuratorAgent(options: CreateCuratorAgentOptions): Agent {
  const tools = createCuratorTools(options.query, options.gallery)
  return new Agent({
    id: options.id ?? 'avc-curator',
    name: options.name ?? 'AgentVisualCrazy Curator',
    instructions: options.instructions ?? CURATOR_SYSTEM_PROMPT,
    // Mastra accepts LanguageModel / wrapLanguageModel results as model config.
    model: options.model as ConstructorParameters<typeof Agent>[0]['model'],
    tools,
  })
}

export type CuratorAgent = Agent
