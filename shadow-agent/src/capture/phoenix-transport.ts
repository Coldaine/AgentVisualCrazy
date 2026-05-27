import { createLogger } from '../shared/logger';
import type {
  CaptureSession,
  CaptureTransport,
  CaptureTransportContext,
  CaptureTransportSubscription,
  PhoenixCaptureTransportOptions
} from './capture-transport';

const logger = createLogger({ minLevel: 'info' });
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_PROJECT_NAME = 'default';

interface PhoenixSpan {
  name: string;
  span_kind?: string;
  context?: { span_id?: string; trace_id?: string };
  parent_id?: string | null;
  start_time: string;
  end_time?: string | null;
  status_code?: string;
  status_message?: string;
  attributes?: Record<string, unknown>;
  project_name?: string;
}

interface PhoenixSpansResponse {
  data?: PhoenixSpan[];
  next_cursor?: string | null;
}

function buildSession(options: PhoenixCaptureTransportOptions): CaptureSession {
  const projectName = options.projectName ?? DEFAULT_PROJECT_NAME;
  return {
    sessionId: options.sessionId ?? `phoenix-${projectName}`,
    label: options.sessionLabel ?? `Phoenix: ${projectName}`,
    source: 'phoenix',
    path: options.url,
    transportId: 'phoenix'
  };
}

export function createPhoenixCaptureTransport(
  options: PhoenixCaptureTransportOptions
): CaptureTransport {
  return {
    id: 'phoenix',
    kind: 'phoenix',
    async start(context: CaptureTransportContext): Promise<CaptureTransportSubscription> {
      const session = buildSession(options);
      const pollIntervalMs = Math.max(500, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
      const projectName = options.projectName ?? DEFAULT_PROJECT_NAME;
      const baseUrl = options.url.replace(/\/$/, '');
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (options.apiKey) {
        headers['Authorization'] = `Bearer ${options.apiKey}`;
      }

      let stopped = false;
      let pollTimer: ReturnType<typeof setTimeout> | null = null;
      let lastStartTime: string | null = null;
      let hasConnected = false;

      const clearTimer = () => {
        if (pollTimer) {
          clearTimeout(pollTimer);
          pollTimer = null;
        }
      };

      const schedulePoll = () => {
        if (stopped || pollTimer) return;
        pollTimer = setTimeout(() => {
          pollTimer = null;
          void poll();
        }, pollIntervalMs);
      };

      const fetchSpans = async (): Promise<PhoenixSpan[]> => {
        const params = new URLSearchParams({ project_name: projectName, limit: '200' });
        if (lastStartTime) params.set('start_time', lastStartTime);
        const url = `${baseUrl}/v1/spans?${params.toString()}`;
        const response = await fetch(url, { headers });
        if (!response.ok) {
          throw new Error(`Phoenix API ${response.status} ${response.statusText}`);
        }
        const body = (await response.json()) as PhoenixSpansResponse;
        const spans = body.data ?? [];
        // sort ascending so events arrive in causal order
        return spans.sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        );
      };

      const poll = async (): Promise<void> => {
        if (stopped) return;
        try {
          const spans = await fetchSpans();

          if (!hasConnected) {
            await context.onSessionStarted(session);
            hasConnected = true;
          }

          if (spans.length > 0) {
            const ndjson = spans.map((s) => JSON.stringify(s)).join('\n') + '\n';
            await context.onChunk({ session, chunk: ndjson });
            const newest = spans[spans.length - 1];
            const newestMs = new Date(newest.start_time).getTime();
            lastStartTime = new Date(newestMs + 1).toISOString();
          }
        } catch (error) {
          if (!stopped) {
            logger.warn('capture', 'transport.phoenix.poll_error', { url: baseUrl, error });
          }
        } finally {
          if (!stopped) schedulePoll();
        }
      };

      void poll();

      return {
        stop() {
          stopped = true;
          clearTimer();
          logger.info('capture', 'transport.phoenix.stopped', { url: baseUrl });
        }
      };
    }
  };
}
