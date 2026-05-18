/**
 * Structured logger for agent-runtime.
 * 
 * Produces consistent JSON log lines with runId, sessionId, and duration
 * for observability.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  msg: string;
  level?: LogLevel;
  runId?: string;
  sessionId?: string;
  durationMs?: number;
  error?: string;
  [key: string]: unknown;
}

function log(level: LogLevel, entry: LogEntry): void {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    source: 'agent-runtime',
    ...entry,
    level,
  });

  switch (level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'debug':
      console.debug(line);
      break;
    default:
      console.log(line);
  }
}

export const logger = {
  info: (msg: string, ctx?: Partial<LogEntry>) => log('info', { msg, ...ctx }),
  warn: (msg: string, ctx?: Partial<LogEntry>) => log('warn', { msg, ...ctx }),
  error: (msg: string, ctx?: Partial<LogEntry>) => log('error', { msg, ...ctx }),
  debug: (msg: string, ctx?: Partial<LogEntry>) => log('debug', { msg, ...ctx }),
};
