// Minimal structured logger: one JSON object per line on stdout/stderr, which any log
// collector can ingest. Secrets must never be passed in `fields`.

type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel: Level = (process.env.LOG_LEVEL as Level) || (process.env.NODE_ENV === 'test' ? 'warn' : 'info');

function write(level: Level, event: string, fields?: Record<string, unknown>) {
  if (order[level] < order[minLevel]) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => write('debug', event, fields),
  info: (event: string, fields?: Record<string, unknown>) => write('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write('error', event, fields),
};

/**
 * Logs an error and, when ERROR_REPORT_URL is set, also POSTs it there as JSON (for an error
 * tracker or log relay). Fire-and-forget: a failing or slow reporter never affects the request.
 * Only the message, stack and request context are sent, never request bodies or headers.
 */
export function reportError(event: string, fields: Record<string, unknown>) {
  logger.error(event, fields);
  const url = process.env.ERROR_REPORT_URL;
  if (!url) return;
  const payload = {
    event,
    time: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.APP_VERSION ?? 'unknown',
    ...fields,
  };
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {
    logger.warn('error_report.failed', { event });
  });
}
