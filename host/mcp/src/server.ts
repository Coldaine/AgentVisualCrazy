/**
 * Curator MCP server — read-only tools over ObservationStore (+ optional curator).
 *
 * Tools (req-v1-curator §4.10):
 *   curator_status  — gallery / latest summary / phase-like status
 *   curator_events  — recent ObservationStore events (n)
 *   curator_ask     — focused question (stub until host/curator binds)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ObservationQuery } from '@agentvisualcrazy/ingestion'
import type { CuratorFacade } from './curator-bridge.ts'
import {
  handleCuratorAsk,
  handleCuratorEvents,
  handleCuratorStatus,
  textResult,
} from './tools.ts'

export const MCP_SERVER_NAME = 'agentvisualcrazy-curator'
export const MCP_SERVER_VERSION = '0.1.0'

export interface CreateCuratorMcpServerOptions {
  store: ObservationQuery
  curator: CuratorFacade
}

/** Build an McpServer with curator_* tools registered (no transport). */
export function createCuratorMcpServer(options: CreateCuratorMcpServerOptions): McpServer {
  const { store, curator } = options

  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        'Read-only AgentVisualCrazy curator tools. Never mutate the watched repo. Tool names are curator_* (not shadow_*).',
    },
  )

  const readOnly = {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  } as const

  server.registerTool(
    'curator_status',
    {
      title: 'Curator status',
      description:
        'Current gallery summary (if curator configured), store size, latest event, and a phase-like status inferred from recent ObservationStore activity.',
      inputSchema: {},
      annotations: readOnly,
    },
    async () => textResult(await handleCuratorStatus(store, curator)),
  )

  server.registerTool(
    'curator_events',
    {
      title: 'Recent curator events',
      description:
        'Return the most recent ObservationStore events. Parameter n caps how many (default 20, max 200). Read-only.',
      inputSchema: {
        n: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Number of recent events to return (default 20, max 200)'),
      },
      annotations: readOnly,
    },
    async ({ n }) => textResult(await handleCuratorEvents(store, n ?? 20)),
  )

  server.registerTool(
    'curator_ask',
    {
      title: 'Ask the curator',
      description:
        'Ask a focused question about the observed session. Triggers a curator investigation when host/curator is wired; otherwise returns a clear "curator not configured" stub plus last store ids.',
      inputSchema: {
        question: z.string().min(1).describe('Focused question for the curator'),
      },
      annotations: readOnly,
    },
    async ({ question }) => textResult(await handleCuratorAsk(store, curator, question)),
  )

  return server
}
