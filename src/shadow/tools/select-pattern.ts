import type { ShadowTool, ToolContext, ToolResult } from './types';

export const selectPatternTool: ShadowTool = {
  name: 'select_pattern',
  description: 'Select and apply a visual pattern to the current session. Available patterns can be listed with read_active_patterns.',
  parameters: {
    type: 'object',
    properties: {
      patternId: {
        type: 'string',
        description: 'The pattern ID to apply',
      },
    },
    required: ['patternId'],
  },
  execute(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
    const patternId = args.patternId as string;
    const pattern = ctx.db.getPatternById(patternId);
    if (!pattern) {
      return { success: false, error: `Pattern not found: ${patternId}` };
    }
    const seen = ctx.db.getSeenPatternOutcome(patternId, ctx.sessionId);
    ctx.db.recordPatternApplication(patternId, ctx.sessionId, 'applied');
    ctx.db.setPresentationState(ctx.sessionId, {
      ...ctx.db.getPresentationState(ctx.sessionId),
      activePatternId: patternId,
    });
    return {
      success: true,
      data: {
        patternId,
        name: (pattern as Record<string, unknown>).name,
        previouslyApplied: seen !== null,
      },
    };
  },
};
