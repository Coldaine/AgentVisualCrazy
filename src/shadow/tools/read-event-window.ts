import type { ShadowTool, ToolContext, ToolResult } from './types';

export const readEventWindowTool: ShadowTool = {
  name: 'read_event_window',
  description: 'Read a window of agent events for analysis. Returns events ordered by timestamp.',
  parameters: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Optional session ID. Defaults to the current session.',
      },
      offset: {
        type: 'number',
        description: 'Event offset to start from (0 = earliest).',
      },
      limit: {
        type: 'number',
        description: 'Maximum events to return (default 50, max 200).',
      },
      sinceKind: {
        type: 'string',
        description: 'If set, only return events of this kind (e.g. "tool_started", "message").',
      },
    },
  },
  execute(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
    const sessionId = (args.sessionId as string) ?? ctx.sessionId;
    const offset = (args.offset as number) ?? 0;
    const limit = Math.min((args.limit as number) ?? 50, 200);

    try {
      let events = ctx.db.getEvents(sessionId, offset, limit);
      const sinceKind = args.sinceKind as string | undefined;
      if (sinceKind) {
        events = events.filter((e) => e.kind === sinceKind);
      }
      return {
        success: true,
        data: {
          total: ctx.db.getEventCount(sessionId),
          offset,
          limit,
          returned: events.length,
          events: events.map((e) => ({
            id: e.id,
            kind: e.kind,
            actor: e.actor,
            timestamp: e.timestamp,
            source: e.source,
            toolName: e.payload?.toolName ?? null,
            text: typeof e.payload?.text === 'string' ? String(e.payload.text).slice(0, 200) : null,
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read events: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
