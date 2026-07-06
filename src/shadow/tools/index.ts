import type { ShadowTool } from './types';
import { readSessionContinuityTool } from './read-session-continuity';
import { readEventWindowTool } from './read-event-window';
import { readActivePatternsTool } from './read-active-patterns';
import { writeInterpretationTool } from './write-interpretation';
import { writePresentationTool } from './write-presentation';
import { selectPatternTool } from './select-pattern';

const TOOL_REGISTRY: ShadowTool[] = [
  readSessionContinuityTool,
  readEventWindowTool,
  readActivePatternsTool,
  writeInterpretationTool,
  writePresentationTool,
  selectPatternTool,
];

export function getAllTools(): ShadowTool[] {
  return [...TOOL_REGISTRY];
}

export function getToolByName(name: string): ShadowTool | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}

export { type ShadowTool, type ToolContext, type ToolResult } from './types';
