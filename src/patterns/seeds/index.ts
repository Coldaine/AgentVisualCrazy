import type { ShadowDatabase } from '../../db/database';
import { createPattern } from '../pattern-library';

export function seedCraftedPatterns(db: ShadowDatabase): void {
  const existing = db.getActivePatterns();
  if (existing.length > 0) return;

  createPattern(db, {
    name: 'Tool Burst Collapse',
    origin: 'crafted',
    status: 'active',
    trigger: {
      toolBurstThreshold: 8,
      kinds: ['tool_started', 'tool_completed'],
    },
    visual: {
      viewName: 'timeline',
      collapseThreshold: 8,
      annotationTemplate: 'Burst of {count} rapid tool calls',
    },
    description: 'Collapse sequences of rapid tool calls into summary groups to reduce visual noise',
  });

  createPattern(db, {
    name: 'Risk Cluster Pin',
    origin: 'crafted',
    status: 'active',
    trigger: {
      riskSignalCount: 2,
    },
    visual: {
      viewName: 'graph',
      emphasis: 'high',
      annotationTemplate: '{count} risk signals detected in this cluster',
    },
    description: 'Pin and highlight regions where multiple risk signals cluster together',
  });

  createPattern(db, {
    name: 'Phase Transition Highlight',
    origin: 'crafted',
    status: 'active',
    trigger: {
      kinds: ['session_started', 'agent_spawned', 'agent_completed'],
    },
    visual: {
      viewName: 'timeline',
      emphasis: 'medium',
      annotationTemplate: 'Phase transition: {phase}',
    },
    description: 'Highlight transitions between phases (planning, implementation, validation)',
  });

  createPattern(db, {
    name: 'Exploration Summary',
    origin: 'crafted',
    status: 'active',
    trigger: {
      phase: 'exploration',
      eventCountMin: 20,
    },
    visual: {
      viewName: 'summary',
      collapseThreshold: 15,
      annotationTemplate: 'Exploration phase with {count} events',
    },
    description: 'Condense long exploration phases into a summary card with key findings',
  });
}
