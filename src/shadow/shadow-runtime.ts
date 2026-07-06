import type { InferenceClient, InferenceRequest, ToolCall } from '../inference/inference-client';
import type { ShadowDatabase } from '../db/database';
import { createLogger, type Logger } from '../shared/logger';
import { getAllTools, type ShadowTool, type ToolContext, type ToolResult } from './tools/index';

const logger = createLogger({ minLevel: 'info' });

const MAX_TOOL_ITERATIONS = 10;

export interface ShadowRuntimeOptions {
  db: ShadowDatabase;
  sessionId: string;
  client: InferenceClient;
  logger?: Logger;
}

export interface ShadowRuntimeResult {
  finalText: string;
  toolCallsExecuted: number;
  iterations: number;
}

export interface ShadowRuntime {
  run(request: InferenceRequest): Promise<ShadowRuntimeResult>;
  getSessionId(): string;
}

export function createShadowRuntime(opts: ShadowRuntimeOptions): ShadowRuntime {
  const { db, client } = opts;
  const sessionId = opts.sessionId;
  const log = opts.logger ?? logger;
  const tools = getAllTools();

  const toolContext: ToolContext = { db, sessionId };

  async function executeToolCall(tc: ToolCall): Promise<ToolResult> {
    const tool = tools.find((t) => t.name === tc.name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${tc.name}` };
    }
    log.info('app', 'runtime.tool_call', { tool: tc.name, args: JSON.stringify(tc.arguments).slice(0, 200) });
    try {
      return await tool.execute(toolContext, tc.arguments);
    } catch (error) {
      log.error('app', 'runtime.tool_error', { tool: tc.name, error });
      return { success: false, error: `Tool execution error: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  return {
    getSessionId() {
      return sessionId;
    },

    async run(request: InferenceRequest): Promise<ShadowRuntimeResult> {
      let systemPrompt = request.systemPrompt;
      const toolDefs = tools.map((t: ShadowTool) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as Record<string, unknown>,
      }));

      let currentMessage = request.userMessage;
      let totalToolCalls = 0;
      let toolResults: Array<{ name: string; result: ToolResult }> = [];

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        if (toolResults.length > 0) {
          const resultsText = toolResults
            .map((tr) => `Tool ${tr.name} returned: ${JSON.stringify(tr.result)}`)
            .join('\n');
          currentMessage = `Previous tool results:\n${resultsText}\n\nContinue the task based on these results.`;
          toolResults = [];
        }

        const inferenceRequest: InferenceRequest = {
          systemPrompt,
          userMessage: currentMessage,
          tools: toolDefs,
        };

        log.info('app', 'runtime.iteration', { iteration, toolDefs: toolDefs.length });
        const result = await client.infer(inferenceRequest);

        if (!result.toolCalls || result.toolCalls.length === 0) {
          return {
            finalText: result.text,
            toolCallsExecuted: totalToolCalls,
            iterations: iteration + 1,
          };
        }

        for (const tc of result.toolCalls) {
          const toolResult = await executeToolCall(tc);
          toolResults.push({ name: tc.name, result: toolResult });
          totalToolCalls++;
        }
      }

      return {
        finalText: `Reached max iterations (${MAX_TOOL_ITERATIONS}) with ${totalToolCalls} tool calls executed.`,
        toolCallsExecuted: totalToolCalls,
        iterations: MAX_TOOL_ITERATIONS,
      };
    },
  };
}
