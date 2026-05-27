import { CanonicalEvent, DerivedState, ShadowInsight } from './schema';
import { sanitizeTranscriptText } from './privacy';
import { driverRegistry } from '../capture/drivers';
import type { HarnessCapabilities } from '../capture/drivers/harness-driver';

const TOOL_FILE_KEYS = ['filePath', 'file_path', 'path'];

/**
 * Capabilities used when an event has no harnessId and the registry default
 * is not yet available (e.g. very early bootstrap or tests with hand-rolled
 * events). The registry's default driver covers the normal case.
 */
const FALLBACK_CAPABILITIES: HarnessCapabilities = {
  emitsSubagentEvents: false,
  fileAttention: 'tool-args',
  riskHeuristics: ['tool_failures', 'shell_churn', 'exploration_volume'],
};

function getCapabilitiesForEvent(event: CanonicalEvent): HarnessCapabilities {
  if (event.harnessId) {
    const byId = driverRegistry.get(event.harnessId);
    if (byId) return byId.capabilities;
  }
  const bySource = driverRegistry.getForSource(event.source);
  if (bySource) return bySource.capabilities;
  try {
    return driverRegistry.getDefault().capabilities;
  } catch {
    return FALLBACK_CAPABILITIES;
  }
}

function normalizeToolName(rawName: string, capabilities: HarnessCapabilities): string {
  const lowered = rawName.toLowerCase();
  if (!capabilities.toolNameMap) return lowered;
  return capabilities.toolNameMap(lowered).toLowerCase();
}

function extractFilePath(
  event: CanonicalEvent,
  capabilities: HarnessCapabilities
): string | null {
  if (capabilities.fileAttention === 'tool-args') {
    for (const key of TOOL_FILE_KEYS) {
      const value = event.payload[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
    return null;
  }
  // 'explicit-event' and 'inferred-from-text' have no in-tree implementation
  // yet — drivers that declare them must wire their own extraction or accept
  // empty file attention until the work is done. Falling through silently is
  // intentional: the capability is declarative, derive.ts is non-blocking.
  return null;
}

function detectPhase(events: CanonicalEvent[]): string {
  const toolNames = events
    .filter((event) => event.kind === 'tool_started' || event.kind === 'tool_completed' || event.kind === 'tool_failed')
    .map((event) => {
      const caps = getCapabilitiesForEvent(event);
      return normalizeToolName(String(event.payload.toolName ?? ''), caps);
    });

  if (toolNames.some((name) => name.includes('write') || name.includes('edit'))) {
    return 'implementation';
  }
  if (toolNames.some((name) => name.includes('todo') || name.includes('plan'))) {
    return 'planning';
  }
  if (toolNames.some((name) => name.includes('bash') || name.includes('test'))) {
    return 'validation';
  }
  if (toolNames.some((name) => name.includes('read') || name.includes('grep') || name.includes('glob'))) {
    return 'exploration';
  }
  return 'observation';
}

/**
 * Each entry is a capability-gated risk check. Derive runs a check only when
 * the corresponding ID appears in the event's driver's `riskHeuristics`. New
 * harnesses opt in to checks by listing their IDs; they opt out of irrelevant
 * checks by omitting them.
 */
const RISK_CHECKS: Record<string, (events: CanonicalEvent[]) => string | null> = {
  tool_failures: (events) => {
    const failedTools = events.filter((event) => event.kind === 'tool_failed');
    if (failedTools.length === 0) return null;
    return `${failedTools.length} failed tool call${failedTools.length === 1 ? '' : 's'} detected`;
  },
  shell_churn: (events) => {
    const bashTools = events.filter((event) => {
      if (event.kind !== 'tool_started' && event.kind !== 'tool_completed' && event.kind !== 'tool_failed') {
        return false;
      }
      const caps = getCapabilitiesForEvent(event);
      const name = normalizeToolName(String(event.payload.toolName ?? ''), caps);
      return name.includes('bash');
    });
    if (bashTools.length < 4) return null;
    return 'Heavy shell/tool churn suggests validation or recovery thrash';
  },
  exploration_volume: (events) => {
    const repeatedReads = events.filter((event) => {
      if (event.kind !== 'tool_started') return false;
      const caps = getCapabilitiesForEvent(event);
      const name = normalizeToolName(String(event.payload.toolName ?? ''), caps);
      return name === 'read' || name === 'grep' || name === 'glob';
    });
    if (repeatedReads.length < 6) return null;
    return 'Large exploration volume may indicate uncertainty or missing plan convergence';
  },
};

function collectRiskSignals(events: CanonicalEvent[]): string[] {
  // Union the heuristic IDs declared by every driver represented in this event
  // batch. Single-harness sessions get exactly one driver's set; multi-harness
  // sessions get the union, so a check supported by any participating driver
  // runs over the full event list. A driver that explicitly declares an empty
  // riskHeuristics list contributes nothing — derive must respect that, not
  // override it with a fallback set.
  const enabledIds = new Set<string>();
  for (const event of events) {
    for (const id of getCapabilitiesForEvent(event).riskHeuristics) {
      enabledIds.add(id);
    }
  }

  const risks: string[] = [];
  for (const id of enabledIds) {
    const check = RISK_CHECKS[id];
    if (!check) continue;
    const signal = check(events);
    if (signal) risks.push(signal);
  }
  return risks;
}

function buildNextMoves(phase: string, riskSignals: string[]): string[] {
  const nextMoves: string[] = [];
  if (phase === 'exploration') {
    nextMoves.push('Collapse exploration into a concrete plan and file shortlist');
  }
  if (phase === 'planning') {
    nextMoves.push('Promote the current plan into implementation tasks with explicit targets');
  }
  if (phase === 'implementation') {
    nextMoves.push('Verify changed files and hand off into a focused validation loop');
  }
  if (phase === 'validation') {
    nextMoves.push('Resolve failing checks or finalize the session if signals are clean');
  }
  if (riskSignals.length > 0) {
    nextMoves.push('Investigate the highest-risk signal before expanding scope');
  }
  if (nextMoves.length === 0) {
    nextMoves.push('Wait for stronger signals before producing a new recommendation');
  }
  return nextMoves;
}

function buildInsights(title: string, phase: string, riskSignals: string[], nextMoves: string[]): ShadowInsight[] {
  return [
    {
      kind: 'objective',
      confidence: 0.72,
      scope: 'session',
      summary: title,
      evidenceEventIds: []
    },
    {
      kind: 'phase',
      confidence: 0.68,
      scope: 'session',
      summary: `Current phase appears to be ${phase}.`,
      evidenceEventIds: []
    },
    ...riskSignals.map<ShadowInsight>((risk) => ({
      kind: 'risk',
      confidence: 0.61,
      scope: 'session',
      summary: risk,
      evidenceEventIds: []
    })),
    ...nextMoves.slice(0, 2).map<ShadowInsight>((move) => ({
      kind: 'next_move',
      confidence: 0.58,
      scope: 'session',
      summary: move,
      evidenceEventIds: []
    }))
  ];
}

export function deriveState(events: CanonicalEvent[], title = 'Observed session'): DerivedState {
  const sessionId = events[0]?.sessionId ?? 'unknown';
  const sanitizedTitle = sanitizeTranscriptText(title);
  const phase = detectPhase(events);
  const riskSignals = collectRiskSignals(events);
  const nextMoves = buildNextMoves(phase, riskSignals);

  const agentMap = new Map<string, DerivedState['agentNodes'][number]>();
  const transcript: DerivedState['transcript'] = [];
  const timeline: DerivedState['timeline'] = [];
  const fileAttention = new Map<string, number>();
  let currentObjective = sanitizedTitle;

  for (const event of events) {
    timeline.push({
      id: event.id,
      timestamp: event.timestamp,
      label: `${event.actor}: ${event.kind}`,
      kind: event.kind
    });

    if (event.kind === 'message' && typeof event.payload.text === 'string') {
      const sanitizedText = sanitizeTranscriptText(event.payload.text);
      transcript.push({
        id: event.id,
        actor: event.actor,
        text: sanitizedText,
        timestamp: event.timestamp,
        redacted: sanitizedText !== event.payload.text
      });
      if (event.actor === 'user' && currentObjective === sanitizedTitle) {
        currentObjective = sanitizedText;
      }
    }

    if (event.kind === 'agent_spawned' || event.kind === 'agent_idle' || event.kind === 'agent_completed') {
      // emitsSubagentEvents is informational — if a driver never emits these
      // event kinds, this branch never executes. No explicit gate needed.
      const existing = agentMap.get(event.actor) ?? {
        id: event.actor,
        label: String(event.payload.label ?? event.actor),
        parentId: typeof event.payload.parentId === 'string' ? event.payload.parentId : undefined,
        harnessId: event.harnessId,
        state: 'active' as const,
        toolCount: 0
      };
      existing.state =
        event.kind === 'agent_completed' ? 'completed' :
        event.kind === 'agent_idle' ? 'idle' :
        'active';
      agentMap.set(event.actor, existing);
    }

    if (event.kind === 'tool_started' || event.kind === 'tool_completed' || event.kind === 'tool_failed') {
      const existing = agentMap.get(event.actor) ?? {
        id: event.actor,
        label: event.actor,
        harnessId: event.harnessId,
        state: 'active' as const,
        toolCount: 0
      };
      existing.toolCount += 1;
      agentMap.set(event.actor, existing);

      const filePath = extractFilePath(event, getCapabilitiesForEvent(event));
      if (filePath) {
        const sanitizedFilePath = sanitizeTranscriptText(filePath);
        fileAttention.set(sanitizedFilePath, (fileAttention.get(sanitizedFilePath) ?? 0) + 1);
      }
    }
  }

  return {
    sessionId,
    title: sanitizedTitle,
    currentObjective,
    activePhase: phase,
    agentNodes: [...agentMap.values()],
    timeline,
    transcript,
    fileAttention: [...fileAttention.entries()]
      .map(([filePath, touches]) => ({ filePath, touches }))
      .sort((a, b) => b.touches - a.touches),
    riskSignals,
    nextMoves,
    shadowInsights: buildInsights(currentObjective, phase, riskSignals, nextMoves)
  };
}
