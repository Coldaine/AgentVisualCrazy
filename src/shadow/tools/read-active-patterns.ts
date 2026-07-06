import type { ShadowTool, ToolContext, ToolResult } from './types';

export const readActivePatternsTool: ShadowTool = {
  name: 'read_active_patterns',
  description: 'List all active visual patterns available for selection in the pattern library',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute(ctx: ToolContext, _args: Record<string, unknown>): ToolResult {
    const patterns = ctx.db.getActivePatterns();
    return {
      success: true,
      data: patterns.map((p) => ({
        id: p.id,
        name: p.name,
        origin: p.origin,
        trigger: p.triggerJson,
      })),
    };
  },
};
