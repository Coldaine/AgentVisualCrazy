import type { ShadowTool, ToolContext, ToolResult } from './types';

export const writePresentationTool: ShadowTool = {
  name: 'write_presentation',
  description: 'Write a presentation mutation to change what the human is shown (focus, collapse, group, annotate, etc.)',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['set_focus', 'collapse_group', 'expand_group', 'pin_annotation', 'hide_node', 'show_node', 'switch_view'],
        description: 'Type of presentation mutation',
      },
      targetId: {
        type: 'string',
        description: 'The target node, group, or view ID',
      },
      payload: {
        type: 'object',
        description: 'Additional payload (emphasis level, position, label, etc.)',
      },
    },
    required: ['type', 'targetId'],
  },
  execute(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
    const mutationType = args.type as string;
    const targetId = args.targetId as string;
    const payload = (args.payload as Record<string, unknown>) ?? {};

    ctx.db.appendMutation(ctx.sessionId, {
      mutationType,
      targetId,
      payload,
      appliedBy: 'shadow',
    });

    const state = ctx.db.getPresentationState(ctx.sessionId);
    (state as Record<string, unknown>)[`_last_mutation_${mutationType}`] = {
      targetId,
      timestamp: new Date().toISOString(),
    };
    ctx.db.setPresentationState(ctx.sessionId, state);

    return {
      success: true,
      data: { mutationType, targetId, applied: true },
    };
  },
};
