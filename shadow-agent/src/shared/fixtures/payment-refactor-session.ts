import { CanonicalEvent } from '../schema';

function event(
  id: string,
  actor: string,
  kind: CanonicalEvent['kind'],
  timestamp: string,
  payload: Record<string, unknown>,
  source: CanonicalEvent['source'] = 'replay'
): CanonicalEvent {
  return {
    id,
    sessionId: 'payment-refactor-session',
    source,
    timestamp,
    actor,
    kind,
    payload
  };
}

export const paymentRefactorSession: CanonicalEvent[] = [
  event('evt-1', 'system', 'session_started', '2026-03-26T01:00:00.000Z', { label: 'Payment refactor session' }),
  event('evt-2', 'user', 'message', '2026-03-26T01:00:01.000Z', {
    text: 'Refactor the payment system to support Stripe and PayPal, add webhook handling, and write integration tests.'
  }),
  event('evt-3', 'orchestrator', 'agent_spawned', '2026-03-26T01:00:03.000Z', { label: 'orchestrator' }),
  event('evt-4', 'orchestrator', 'tool_started', '2026-03-26T01:00:05.000Z', {
    toolName: 'Glob',
    pattern: 'src/**/*.ts'
  }),
  event('evt-5', 'orchestrator', 'tool_completed', '2026-03-26T01:00:06.000Z', {
    toolName: 'Glob',
    result: '47 files matched'
  }),
  event('evt-6', 'orchestrator', 'tool_started', '2026-03-26T01:00:07.000Z', {
    toolName: 'Read',
    filePath: 'src/services/payment.ts'
  }),
  event('evt-7', 'orchestrator', 'tool_completed', '2026-03-26T01:00:08.000Z', {
    toolName: 'Read',
    filePath: 'src/services/payment.ts'
  }),
  event('evt-8', 'orchestrator', 'tool_started', '2026-03-26T01:00:10.000Z', {
    toolName: 'TodoWrite'
  }),
  event('evt-9', 'orchestrator', 'tool_completed', '2026-03-26T01:00:10.500Z', {
    toolName: 'TodoWrite'
  }),
  event('evt-10', 'orchestrator', 'subagent_dispatched', '2026-03-26T01:00:12.000Z', {
    childId: 'research-agent',
    task: 'Research Stripe and PayPal API patterns'
  }),
  event('evt-11', 'research-agent', 'agent_spawned', '2026-03-26T01:00:13.000Z', {
    label: 'research-agent',
    parentId: 'orchestrator'
  }),
  event('evt-12', 'research-agent', 'tool_started', '2026-03-26T01:00:14.000Z', {
    toolName: 'WebSearch',
    query: 'Stripe PaymentIntents Node.js TypeScript'
  }),
  event('evt-13', 'research-agent', 'tool_completed', '2026-03-26T01:00:17.000Z', {
    toolName: 'WebSearch',
    result: 'PaymentIntents is the recommended API'
  }),
  event('evt-14', 'research-agent', 'subagent_returned', '2026-03-26T01:00:19.000Z', {
    summary: 'Stripe PaymentIntents and PayPal Orders API v2 are the target patterns.'
  }),
  event('evt-15', 'research-agent', 'agent_completed', '2026-03-26T01:00:19.500Z', {
    label: 'research-agent'
  }),
  event('evt-16', 'orchestrator', 'tool_started', '2026-03-26T01:00:21.000Z', {
    toolName: 'Write',
    filePath: 'src/services/payment-gateway.ts'
  }),
  event('evt-17', 'orchestrator', 'tool_completed', '2026-03-26T01:00:22.000Z', {
    toolName: 'Write',
    filePath: 'src/services/payment-gateway.ts'
  }),
  event('evt-18', 'orchestrator', 'tool_started', '2026-03-26T01:00:23.000Z', {
    toolName: 'Edit',
    filePath: 'src/routes/checkout.ts'
  }),
  event('evt-19', 'orchestrator', 'tool_completed', '2026-03-26T01:00:24.000Z', {
    toolName: 'Edit',
    filePath: 'src/routes/checkout.ts'
  }),
  event('evt-20', 'orchestrator', 'tool_started', '2026-03-26T01:00:26.000Z', {
    toolName: 'Bash',
    command: 'npm test -- --coverage'
  }),
  event('evt-21', 'orchestrator', 'tool_failed', '2026-03-26T01:00:30.000Z', {
    toolName: 'Bash',
    command: 'npm test -- --coverage',
    error: 'STRIPE_SECRET_KEY is not defined'
  }),
  event('evt-22', 'orchestrator', 'message', '2026-03-26T01:00:31.000Z', {
    text: 'Tests are failing because Stripe secrets are not mocked during setup.'
  }),
  event('evt-23', 'orchestrator', 'tool_started', '2026-03-26T01:00:33.000Z', {
    toolName: 'Write',
    filePath: 'src/__tests__/setup.ts'
  }),
  event('evt-24', 'orchestrator', 'tool_completed', '2026-03-26T01:00:34.000Z', {
    toolName: 'Write',
    filePath: 'src/__tests__/setup.ts'
  }),
  event('evt-25', 'orchestrator', 'tool_started', '2026-03-26T01:00:36.000Z', {
    toolName: 'Bash',
    command: 'npm test -- --coverage'
  }),
  event('evt-26', 'orchestrator', 'tool_completed', '2026-03-26T01:00:41.000Z', {
    toolName: 'Bash',
    command: 'npm test -- --coverage',
    result: '18 tests passed'
  }),
  event('evt-27', 'orchestrator', 'agent_completed', '2026-03-26T01:00:43.000Z', { label: 'orchestrator' }),
  event('evt-28', 'system', 'session_ended', '2026-03-26T01:00:44.000Z', { label: 'Payment refactor session' })
];
