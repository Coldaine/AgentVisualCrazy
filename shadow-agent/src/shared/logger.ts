import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogDomain = 'app' | 'capture' | 'ipc' | 'renderer' | 'inference' | 'mcp' | 'persistence';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  domain: LogDomain;
  event: string;
  context?: Record<string, unknown>;
}

export interface LoggerOptions {
  minLevel?: LogLevel;
  includeConsole?: boolean;
  includeMemory?: boolean;
  memoryCapacity?: number;
  filePath?: string;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const SENSITIVE_KEY_PATTERN = /(?:^|[_-])(text|prompt|content)(?:$|[_-])/i;

function isErrorLike(value: unknown): value is { name?: unknown; message?: unknown; stack?: unknown } {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return 'message' in (value as Record<string, unknown>) || 'stack' in (value as Record<string, unknown>);
}

function serializeError(
  value: { name?: unknown; message?: unknown; stack?: unknown },
  redacted: boolean
): Record<string, unknown> {
  const name = typeof value.name === 'string' ? value.name : 'Error';
  const message =
    typeof value.message === 'string'
      ? value.message
      : value.message !== undefined
        ? String(value.message)
        : 'Unknown error';
  const stack = typeof value.stack === 'string' ? value.stack : undefined;

  if (redacted) {
    return {
      name,
      message: '[redacted]',
      stack: '[redacted]',
      redacted: true
    };
  }

  return {
    name,
    message,
    ...(stack ? { stack } : {}),
    redacted: false
  };
}

function redactContext(context: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!context) {
    return undefined;
  }

  const seen = new WeakSet<object>();

  const sanitize = (value: unknown, keyHint?: string): unknown => {
    const sensitiveKey = typeof keyHint === 'string' && SENSITIVE_KEY_PATTERN.test(keyHint);

    if (value instanceof Error) {
      return serializeError(value, sensitiveKey);
    }
    if (isErrorLike(value)) {
      return serializeError(value, sensitiveKey);
    }
    if (sensitiveKey) {
      return '[redacted]';
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    if (seen.has(value as object)) {
      return '[circular]';
    }
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value.map((item) => sanitize(item));
    }

    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      output[childKey] = sanitize(childValue, childKey);
    }
    return output;
  };

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    redacted[key] = sanitize(value, key);
  }
  return redacted;
}

async function writeJsonLine(filePath: string, entry: LogEntry): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
}

export class StructuredLogger {
  private readonly minLevel: LogLevel;
  private readonly includeConsole: boolean;
  private readonly includeMemory: boolean;
  private readonly memoryCapacity: number;
  private readonly filePath?: string;
  private readonly memory: LogEntry[] = [];

  public constructor(options: LoggerOptions = {}) {
    this.minLevel = options.minLevel ?? 'info';
    this.includeConsole = options.includeConsole ?? true;
    this.includeMemory = options.includeMemory ?? true;
    this.memoryCapacity = options.memoryCapacity ?? 500;
    this.filePath = options.filePath;
  }

  public debug(domain: LogDomain, event: string, context?: Record<string, unknown>): void {
    this.log('debug', domain, event, context);
  }

  public info(domain: LogDomain, event: string, context?: Record<string, unknown>): void {
    this.log('info', domain, event, context);
  }

  public warn(domain: LogDomain, event: string, context?: Record<string, unknown>): void {
    this.log('warn', domain, event, context);
  }

  public error(domain: LogDomain, event: string, context?: Record<string, unknown>): void {
    this.log('error', domain, event, context);
  }

  public getRecent(limit = 100): LogEntry[] {
    if (limit <= 0) {
      return [];
    }
    return this.memory.slice(-limit);
  }

  private log(level: LogLevel, domain: LogDomain, event: string, context?: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      domain,
      event,
      context: redactContext(context)
    };

    if (this.includeMemory) {
      this.memory.push(entry);
      if (this.memory.length > this.memoryCapacity) {
        this.memory.shift();
      }
    }

    if (this.includeConsole) {
      const line = `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.domain}:${entry.event}`;
      if (entry.context) {
        console.log(line, entry.context);
      } else {
        console.log(line);
      }
    }

    if (this.filePath) {
      void writeJsonLine(this.filePath, entry).catch((error) => {
        if (this.includeConsole) {
          console.error('logger_write_failed', error);
        }
      });
    }
  }
}

export function createLogger(options: LoggerOptions = {}): StructuredLogger {
  return new StructuredLogger(options);
}
