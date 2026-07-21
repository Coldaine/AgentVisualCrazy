/**
 * Env → CaptureTransportOptions resolution (auto / hook-receiver / source).
 */
import { describe, expect, it } from 'vitest';
import { resolveCaptureTransportOptionsFromEnv } from '../../src/capture/capture-transports';
import {
  DEFAULT_HOOK_RECEIVER_HOST,
  DEFAULT_HOOK_RECEIVER_PORT
} from '../../src/capture/hook-receiver-transport';

describe('resolveCaptureTransportOptionsFromEnv', () => {
  it('defaults to auto (file-tail + hook-receiver)', () => {
    const options = resolveCaptureTransportOptionsFromEnv({});
    expect(options).toEqual({
      kind: 'auto',
      overridePath: undefined,
      overrideSource: undefined,
      hookHost: DEFAULT_HOOK_RECEIVER_HOST,
      hookPort: DEFAULT_HOOK_RECEIVER_PORT,
      unixSocketPath: undefined,
      sharedToken: undefined,
      defaultSource: 'cursor-hook',
      sessionId: undefined,
      sessionLabel: undefined
    });
  });

  it('accepts file-tail with optional override path and source', () => {
    expect(
      resolveCaptureTransportOptionsFromEnv({
        SHADOW_CAPTURE_TRANSPORT: 'file-tail',
        SHADOW_CAPTURE_FILE: '/tmp/session.jsonl',
        SHADOW_CAPTURE_SOURCE: 'cursor-agent-trace'
      })
    ).toEqual({
      kind: 'file-tail',
      overridePath: '/tmp/session.jsonl',
      overrideSource: 'cursor-agent-trace'
    });
  });

  it('resolves hook-receiver aliases (hooks, cursor)', () => {
    for (const kind of ['hook-receiver', 'hooks', 'cursor']) {
      const options = resolveCaptureTransportOptionsFromEnv({
        SHADOW_CAPTURE_TRANSPORT: kind,
        SHADOW_HOOK_RECEIVER_PORT: '9501',
        SHADOW_HOOK_TOKEN: 'tok',
        SHADOW_HOOK_SOURCE: 'cursor-hook'
      });
      expect(options).toMatchObject({
        kind: 'hook-receiver',
        port: 9501,
        sharedToken: 'tok',
        defaultSource: 'cursor-hook'
      });
    }
  });

  it('resolves auto aliases (both) and forwards hook env', () => {
    const options = resolveCaptureTransportOptionsFromEnv({
      SHADOW_CAPTURE_TRANSPORT: 'both',
      SHADOW_CAPTURE_FILE: '/tmp/claude.jsonl',
      SHADOW_HOOK_RECEIVER_HOST: '127.0.0.1',
      SHADOW_HOOK_RECEIVER_PORT: '9600',
      SHADOW_HOOK_RECEIVER_SOCKET: '/tmp/shadow.sock'
    });
    expect(options).toMatchObject({
      kind: 'auto',
      overridePath: '/tmp/claude.jsonl',
      hookHost: '127.0.0.1',
      hookPort: 9600,
      unixSocketPath: '/tmp/shadow.sock'
    });
  });

  it('forwards SHADOW_CAPTURE_SOURCE onto stream transports', () => {
    expect(
      resolveCaptureTransportOptionsFromEnv({
        SHADOW_CAPTURE_TRANSPORT: 'http-stream',
        SHADOW_CAPTURE_HTTP_URL: 'http://127.0.0.1:9/events',
        SHADOW_CAPTURE_SOURCE: 'cursor-hook'
      })
    ).toMatchObject({
      kind: 'http-stream',
      source: 'cursor-hook'
    });

    expect(
      resolveCaptureTransportOptionsFromEnv({
        SHADOW_CAPTURE_TRANSPORT: 'websocket',
        SHADOW_CAPTURE_WS_URL: 'ws://127.0.0.1:9/events',
        SHADOW_CAPTURE_SOURCE: 'codex-hook'
      })
    ).toMatchObject({
      kind: 'websocket',
      source: 'codex-hook'
    });

    expect(
      resolveCaptureTransportOptionsFromEnv({
        SHADOW_CAPTURE_TRANSPORT: 'socket',
        SHADOW_CAPTURE_SOCKET_HOST: '127.0.0.1',
        SHADOW_CAPTURE_SOCKET_PORT: '5000',
        SHADOW_CAPTURE_SOURCE: 'gemini-hook'
      })
    ).toMatchObject({
      kind: 'socket',
      source: 'gemini-hook'
    });
  });

  it('rejects unknown transport kinds and invalid hook ports', () => {
    expect(() =>
      resolveCaptureTransportOptionsFromEnv({ SHADOW_CAPTURE_TRANSPORT: 'otlp' })
    ).toThrow(/Unsupported SHADOW_CAPTURE_TRANSPORT/);

    expect(() =>
      resolveCaptureTransportOptionsFromEnv({
        SHADOW_CAPTURE_TRANSPORT: 'hook-receiver',
        SHADOW_HOOK_RECEIVER_PORT: 'not-a-port'
      })
    ).toThrow(/Invalid SHADOW_HOOK_RECEIVER_PORT/);
  });
});
