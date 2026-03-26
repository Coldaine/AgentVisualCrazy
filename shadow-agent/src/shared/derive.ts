import { CanonicalEvent, DerivedState, ShadowInsight } from './schema';

const TOOL_FILE_KEYS = ['filePath', 'file_path', 'path'];

function extractFilePath(payload: Record<string, unknown>): string | null {
  for (const key of TOOL_FILE_KEYS) {
    const value = payload[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
}

function detectPhase(events: CanonicalEvent[]): string {
  const toolNames = events
    .filter((event) => event.kind === 'tool_started' || event.kind === 'tool_completed' || event.kind === 'tool_failed')
    .map((event) => String(event.payload.toolName ?? '').toLowerCase());

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

function collectRiskSignals(events: CanonicalEvent[]): string[] {
  const risks: string[] = [];
  const failedTools = events.filter((event) => event.kind === 'tool_failed');
  if (failedTools.length > 0) {
    risks.push(`${failedTools.length} failed tool call${failedTools.length === 1 ? '' : 's'} detected`);
  }

  const bashTools = events.filter(
    (event) =>
      (event.kind === 'tool_started' || event.kind === 'tool_completed' || event.kind === 'tool_failed') &&
      String(event.payload.toolName ?? '').toLowerCase().includes('bash')
  );
  if (bashTools.length >= 4) {
    risks.push('Heavy shell/tool churn suggests validation or recovery thrash');
  }

  const repeatedReads = events.filter(
    (event) =>
      event.kind === 'tool_started' &&
      ['read', 'grep', 'glob'].includes(String(event.payload.toolName ?? '').toLowerCase())
  );
  if (repeatedReads.length >= 6) {
    risks.push('Large exploration volume may indicate uncertainty or missing plan convergence');
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
  const phase = detectPhase(events);
  const riskSignals = collectRiskSignals(events);
  const nextMoves = buildNextMoves(phase, riskSignals);

  const agentMap = new Map<string, DerivedState['agentNodes'][number]>();
  const transcript: DerivedState['transcript'] = [];
  const timeline: DerivedState['timeline'] = [];
  const fileAttention = new Map<string, number>();
  let currentObjective = title;

  for (const event of events) {
    timeline.push({
      id: event.id,
      timestamp: event.timestamp,
      label: `${event.actor}: ${event.kind}`,
      kind: event.kind
    });

    if (event.kind === 'message' && typeof event.payload.text === 'string') {
      transcript.push({
        id: event.id,
        actor: event.actor,
        text: event.payload.text,
        timestamp: event.timestamp
      });
      if (event.actor === 'user' && currentObjective === title) {
        currentObjective = event.payload.text;
      }
    }

    if (event.kind === 'agent_spawned' || event.kind === 'agent_idle' || event.kind === 'agent_completed') {
      const existing = agentMap.get(event.actor) ?? {
        id: event.actor,
        label: String(event.payload.label ?? event.actor),
        parentId: typeof event.payload.parentId === 'string' ? event.payload.parentId : undefined,
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
        state: 'active' as const,
        toolCount: 0
      };
      existing.toolCount += 1;
      agentMap.set(event.actor, existing);

      const filePath = extractFilePath(event.payload);
      if (filePath) {
        fileAttention.set(filePath, (fileAttention.get(filePath) ?? 0) + 1);
      }
    }
  }

  return {
    sessionId,
    title,
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
