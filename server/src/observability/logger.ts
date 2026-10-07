import { AsyncLocalStorage } from 'node:async_hooks';

/** Per-request context propagated through async calls (request id, user id). */
export type RequestContext = { requestId: string; userId?: string };
export const requestContext = new AsyncLocalStorage<RequestContext>();

type Level = 'debug' | 'info' | 'warn' | 'error';
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const configuredLevel = (): number => {
  const fromEnv = process.env.LOG_LEVEL as Level | undefined;
  if (fromEnv && fromEnv in LEVELS) return LEVELS[fromEnv];
  return process.env.NODE_ENV === 'test' ? LEVELS.error + 1 : LEVELS.info;
};

/** Keys that must never reach the logs, wherever they appear. */
const SECRET_KEYS = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|mongo_?uri/i;

const scrub = (value: unknown, depth = 0): unknown => {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => scrub(item, depth + 1));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, SECRET_KEYS.test(key) ? '[redacted]' : scrub(item, depth + 1)]));
};

const write = (level: Level, event: string, fields: Record<string, unknown> = {}) => {
  if (LEVELS[level] < configuredLevel()) return;
  const context = requestContext.getStore();
  const entry = { time: new Date().toISOString(), level, event, ...(context ?? {}), ...(scrub(fields) as Record<string, unknown>) };
  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
};

/** Structured JSON-lines logger. One event name per line, e.g. "request.completed", "resume.parsed". */
export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => write('debug', event, fields),
  info: (event: string, fields?: Record<string, unknown>) => write('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write('error', event, fields),
};

/** Runs `fn` and logs its duration under `event` (used for parser, AI and database timings). */
export const timed = async <T>(event: string, fn: () => Promise<T>, fields: Record<string, unknown> = {}): Promise<T> => {
  const started = performance.now();
  try {
    const result = await fn();
    logger.info(event, { ...fields, durationMs: Math.round(performance.now() - started), ok: true });
    return result;
  } catch (error) {
    logger.warn(event, { ...fields, durationMs: Math.round(performance.now() - started), ok: false, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
};
