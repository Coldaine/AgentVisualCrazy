import type { ShadowTool, ToolContext, ToolResult } from './types';

export const writeInterpretationTool: ShadowTool = {
  name: 'write_interpretation',
  description: 'Write an interpretation insight (summary, risk, phase, intent, etc.) for the current session',
  parameters: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['objective', 'phase', 'risk', 'next_move', 'attention', 'summary'],
        description: 'The kind of insight',
      },
      summary: {
        type: 'string',
        description: 'The insight text',
      },
      confidence: {
        type: 'number',
        description: 'Confidence score 0-1',
      },
      scope: {
        type: 'string',
        enum: ['session', 'agent', 'file'],
        description: 'Scope of the insight',
      },
      evidenceEventIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Event IDs supporting this insight',
      },
    },
    required: ['kind', 'summary', 'confidence'],
  },
  execute(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
    const kind = args.kind as string;
    const scope = (args.scope as string) ?? 'session';
    const insight = {
      kind: kind as 'objective' | 'phase' | 'risk' | 'next_move' | 'attention' | 'summary',
      source: 'model' as const,
      confidence: args.confidence as number,
      scope: scope as 'session' | 'agent' | 'file',
      summary: args.summary as string,
      evidenceEventIds: (args.evidenceEventIds as string[]) ?? [],
      structuredPayload: {},
    };
    ctx.db.insertInterpretations(ctx.sessionId, [insight]);
    return {
      success: true,
      data: { kind: insight.kind, summary: insight.summary },
    };
  },
};
