/**
 * OpenCode inference harness — primary provider path when the SDK is available.
 *
 * Lazy-loads `@opencode-ai/sdk`, starts a local server on port 4097 (avoiding
 * sidecar's 4096), creates a session, sends prompts, and polls for completion.
 */
import type { InferenceClient, InferenceRequest, InferenceResult } from './inference-client';
import { createLogger } from '../shared/logger';

const logger = createLogger({ minLevel: 'info' });

const DEFAULT_PORT = 4097;
const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 120_000;
const MODEL = { provider: 'anthropic', model: 'claude-sonnet-4-5' };

export interface OpencodeClientDependencies {
  port?: number;
  cwd?: string;
  loadSdk?: () => Promise<OpencodeSdkModule>;
  now?: () => number;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

interface OpencodeSdkModule {
  createOpencodeServer(options: { port: number; cwd: string }): Promise<{
    url: string;
    close?: () => void | Promise<void>;
  }>;
  createOpencodeClient(options: { baseUrl: string }): OpencodeSdkClient;
}

interface OpencodeSdkClient {
  session: {
    create(): Promise<{ id: string }>;
    promptAsync(input: {
      path: { id: string };
      body: {
        model: { provider: string; model: string };
        parts: Array<{ type: string; text: string }>;
        system: string;
        tools?: string[];
      };
    }): Promise<void>;
    messages(input: { path: { id: string } }): Promise<OpencodeMessagesResponse>;
  };
}

interface OpencodeMessagesResponse {
  messages?: Array<{
    role?: string;
    parts?: Array<{ type?: string; text?: string }>;
  }>;
}

async function defaultLoadSdk(): Promise<OpencodeSdkModule> {
  return import('@opencode-ai/sdk') as unknown as Promise<OpencodeSdkModule>;
}

function extractAssistantText(response: OpencodeMessagesResponse): string {
  const messages = response.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant') {
      continue;
    }
    const text = (message.parts ?? [])
      .filter((part) => part.type === 'text' && part.text)
      .map((part) => part.text!)
      .join('');
    if (text.trim()) {
      return text;
    }
  }
  return '';
}

async function pollForAssistantText(
  client: OpencodeSdkClient,
  sessionId: string,
  intervalMs: number,
  timeoutMs: number,
  now: () => number
): Promise<string> {
  const deadline = now() + timeoutMs;
  let stableText = '';

  while (now() < deadline) {
    const response = await client.session.messages({ path: { id: sessionId } });
    const text = extractAssistantText(response);
    if (text && text === stableText) {
      return text;
    }
    stableText = text;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  if (stableText.trim()) {
    return stableText;
  }

  throw new Error('OpenCode inference timed out before a response arrived.');
}

export async function createOpencodeClient(
  deps: OpencodeClientDependencies = {}
): Promise<InferenceClient | null> {
  const now = deps.now ?? Date.now;
  const pollIntervalMs = deps.pollIntervalMs ?? POLL_INTERVAL_MS;
  const pollTimeoutMs = deps.pollTimeoutMs ?? POLL_TIMEOUT_MS;

  let sdk: OpencodeSdkModule;
  try {
    sdk = await (deps.loadSdk ?? defaultLoadSdk)();
  } catch (error) {
    logger.warn('inference', 'opencode.sdk_not_available', { error });
    return null;
  }

  let server: { url: string; close?: () => void | Promise<void> } | null = null;
  let sdkClient: OpencodeSdkClient | null = null;
  let sessionId: string | null = null;

  try {
    server = await sdk.createOpencodeServer({
      port: deps.port ?? DEFAULT_PORT,
      cwd: deps.cwd ?? process.cwd()
    });
    sdkClient = sdk.createOpencodeClient({ baseUrl: server.url });
    const session = await sdkClient.session.create();
    sessionId = session.id;
  } catch (error) {
    logger.warn('inference', 'opencode.start_failed', { error });
    await Promise.resolve(server?.close?.());
    return null;
  }

  if (!sdkClient || !sessionId) {
    return null;
  }

  const activeSessionId = sessionId;

  return {
    id: 'opencode-harness',
    provider: 'opencode' as const,
    unitTests: {
      testFile: 'tests/inference/opencode-client.test.ts',
      covers: ['provider identity', 'request forwarding', 'response normalization']
    },

    async infer(request: InferenceRequest): Promise<InferenceResult> {
      const start = now();
      logger.info('inference', 'opencode.request_start');

      await sdkClient.session.promptAsync({
        path: { id: activeSessionId },
        body: {
          model: MODEL,
          parts: [{ type: 'text', text: request.userMessage }],
          system: request.systemPrompt,
          tools: []
        }
      });

      const text = await pollForAssistantText(
        sdkClient,
        activeSessionId,
        pollIntervalMs,
        pollTimeoutMs,
        now
      );
      const latencyMs = now() - start;

      logger.info('inference', 'opencode.request_done', { latencyMs });

      return {
        text,
        model: `${MODEL.provider}/${MODEL.model}`,
        latencyMs
      };
    }
  };
}
