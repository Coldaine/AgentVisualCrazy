#!/usr/bin/env node
/**
 * Stdio entry for the AgentVisualCrazy curator MCP server.
 *
 *   npm run mcp
 *   AVC_OBSERVATION_JSONL=path/to/events.jsonl npm run mcp
 *
 * stdout is JSON-RPC — log only to stderr.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { tryLoadCuratorFacade } from './curator-bridge.ts'
import { createCuratorMcpServer } from './server.ts'
import { bootstrapObservationStore, OBSERVATION_JSONL_ENV } from './store-bootstrap.ts'

async function main(): Promise<void> {
  const boot = bootstrapObservationStore()
  const curator = await tryLoadCuratorFacade({
    jsonlPath: boot.jsonlPath,
    watching: boot.watching,
  })

  const server = createCuratorMcpServer({
    store: boot.store.asQuery(),
    curator,
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error(
    `[mcp] ${boot.jsonlPath ? `loaded store from ${boot.jsonlPath}` : `no ${OBSERVATION_JSONL_ENV}; empty store`} (size=${boot.store.size}, watch=${boot.watching}, curatorConfigured=${(await curator.getStatus(boot.store)).curatorConfigured})`,
  )

  const shutdown = () => {
    boot.dispose()
    void server.close()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[mcp] fatal:', err)
  process.exit(1)
})
