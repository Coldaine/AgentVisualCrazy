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

function redactContext(context: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!context) {
    return undefined;
  }

  const seen = new WeakSet<object>();

  const sanitize = (value: unknown, keyHint?: string): unknown => {
    if (typeof keyHint === 'string') {
      const lowered = keyHint.toLowerCase();
      if (lowered.includes('text') || lowered.includes('prompt') || lowered.includes('content')) {
        return '[redacted]';
      }
    }

    if (Array.isArray(value)) {
      return value.map((item) => sanitize(item));
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    if (seen.has(value as object)) {
      return '[circular]';
    }
    seen.add(value as object);

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
