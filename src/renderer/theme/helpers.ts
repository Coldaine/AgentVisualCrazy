import type { AgentNode } from '../../shared/schema';
import { colors } from './colors';

/** Append alpha to a partial rgba base string, e.g. `'rgba(80, 160, 220,'`. */
export function withAlpha(rgbaBase: string, alpha: number): string {
  if (!rgbaBase.trimEnd().endsWith(',')) {
    throw new Error('withAlpha expects a partial rgba base ending with a comma');
  }
  return `${rgbaBase} ${alpha})`;
}

export function getStateColor(state: AgentNode['state']): string {
  switch (state) {
    case 'active':
      return colors.stateThinking;
    case 'completed':
      return colors.stateComplete;
    case 'idle':
    default:
      return colors.stateIdle;
  }
}
