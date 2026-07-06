import type { ShadowTool, ToolContext, ToolResult } from './types';

export const readSessionContinuityTool: ShadowTool = {
  name: 'read_session_continuity',
  description: 'Read the metadata and continuity state for the current agent session',
  parameters: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Optional session ID. Defaults to the current session.',
      },
    },
  },
  execute(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
    const sessionId = (args.sessionId as string) ?? ctx.sessionId;
    const session = ctx.db.getSession(sessionId);
    if (!session) {
      return { success: false, error: `Session not found: ${sessionId}` };
    }
    const eventCount = ctx.db.getEventCount(sessionId);
    const interpretations = ctx.db.getInterpretations(sessionId);
    return {
      success: true,
      data: {
        sessionId: session.sessionId,
        title: session.title,
        startedAt: session.startedAt,
        updatedAt: session.updatedAt,
        source: session.source,
        eventCount,
        priorInterpretationCount: interpretations.length,
      },
    };
  },
};
