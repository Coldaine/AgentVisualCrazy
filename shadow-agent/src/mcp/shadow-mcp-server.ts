/**
 * Shadow MCP server — exposes shadow-agent state as MCP tools.
 *
 * Tools:
 *   shadow_status  — current DerivedState summary
 *   shadow_events  — last N CanonicalEvents from the buffer
 *   shadow_ask     — run a one-shot inference call with a custom question
 *
 * Uses @modelcontextprotocol/sdk. If the SDK is not installed, the function
 * returns null gracefully.
 */
import type { DerivedState, ShadowInsight } from '../shared/schema';
import { createLogger } from '../shared/logger';
import type { EventBufferLike } from '../inference/inference-client';
import type { InferenceClient, InferenceRequest } from '../inference/inference-client';
import { SHADOW_SYSTEM_PROMPT } from '../inference/prompts';

const logger = createLogger({ minLevel: 'info' });

export interface McpServerOptions {
  buffer: EventBufferLike;
  getState: () => DerivedState;
  inferenceClient: InferenceClient | null;
  port?: number;
}

export interface McpServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function createShadowMcpServer(
  opts: McpServerOptions
): Promise<McpServer | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let McpServerClass: new (info: { name: string; version: string }, caps: { capabilities: { tools: object } }) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let StdioServerTransport: new () => any;

  try {
    // @ts-expect-error — @modelcontextprotocol/sdk is an optional runtime dependency
    const serverMod = await import('@modelcontextprotocol/sdk/server/mcp.js') as { McpServer: typeof McpServerClass };
    // @ts-expect-error — @modelcontextprotocol/sdk is an optional runtime dependency
    const stdioMod = await import('@modelcontextprotocol/sdk/server/stdio.js') as { StdioServerTransport: typeof StdioServerTransport };
    McpServerClass = serverMod.McpServer;
    StdioServerTransport = stdioMod.StdioServerTransport;
  } catch {
    logger.warn('mcp', 'server.sdk_not_installed');
    return null;
  }

  const server = new McpServerClass(
    { name: 'shadow-agent', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  // shadow_status — returns current state summary
  server.tool(
    'shadow_status',
    'Get the current state of the observed agent session',
    {},
    async () => {
      const state = opts.getState();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                sessionId: state.sessionId,
                phase: state.activePhase,
                objective: state.currentObjective,
                riskSignals: state.riskSignals,
                nextMoves: state.nextMoves,
                eventCount: opts.buffer.size,
                agentNodes: state.agentNodes.map((n) => ({
                  id: n.id,
                  label: n.label,
                  state: n.state,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // shadow_events — returns last N events
  server.tool(
    'shadow_events',
    'Get the last N canonical events from the session buffer',
    {
      count: {
        type: 'number' as const,
        description: 'Number of events to return (default 20)',
        default: 20,
      },
    },
    async (args: { count?: number }) => {
      const n = Math.min(Math.max(1, args.count ?? 20), 200);
      const events = opts.buffer.getRecent(n);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(events, null, 2),
          },
        ],
      };
    }
  );

  // shadow_ask — one-shot inference with a custom question
  server.tool(
    'shadow_ask',
    'Ask Shadow a specific question about the observed session',
    {
      question: {
        type: 'string' as const,
        description: 'The question to ask about the session',
      },
    },
    async (args: { question: string }) => {
      if (!opts.inferenceClient) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Inference client not available. Set ANTHROPIC_API_KEY to enable.',
            },
          ],
        };
      }

      const state = opts.getState();
      const userMessage = `${args.question}\n\nCurrent session state:\n${JSON.stringify(
        { phase: state.activePhase, objective: state.currentObjective, riskSignals: state.riskSignals },
        null,
        2
      )}`;

      const request: InferenceRequest = {
        systemPrompt: SHADOW_SYSTEM_PROMPT,
        userMessage,
      };

      try {
        const result = await opts.inferenceClient.infer(request);
        return {
          content: [{ type: 'text' as const, text: result.text }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Inference error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  const transport = new StdioServerTransport();

  return {
    async start() {
      await server.connect(transport);
      logger.info('mcp', 'server.started');
    },
    async stop() {
      await server.close();
      logger.info('mcp', 'server.stopped');
    },
  };
}
