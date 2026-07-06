import type { ShadowDatabase } from '../../db/database';

export interface ToolContext {
  db: ShadowDatabase;
  sessionId: string;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ShadowTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(ctx: ToolContext, args: Record<string, unknown>): ToolResult;
}
