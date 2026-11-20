import type { IncomingMessage, ServerResponse } from 'http';
import type { Express } from 'express';
import { fileURLToPath } from 'url';
import { createApp } from '../../server/app.ts';
import { loadConfig } from '../../server/config.ts';
import { createPool, type Pool } from '../../server/db.ts';
import { logger, reportError } from '../../server/logger.ts';
import { purgeExpired } from '../../server/maintenance.ts';
import { sweepHeadGrants } from '../../server/routes/grants.ts';
import { sweepExpired } from '../../server/routes/assignments.ts';
import { pendingMigrations } from '../../server/migrate.ts';
import { flushPushes } from '../../server/push.ts';

// The API as one Vercel function (scripts/vercel-build.mjs bundles this file). The same Express
// app as server.ts, without listen() or timers: an instance only runs while it handles requests,
// so push notifications and housekeeping are handed to Vercel's waitUntil to finish after the
// response instead.

process.env.NODE_ENV ??= 'production';
process.env.DATABASE_POOL_MAX ??= '3';
// Vercel's edge replaces X-Forwarded-For with the caller's address, so logs and the audit trail
// see real client IPs instead of the proxy's.
process.env.TRUST_PROXY ??= '1';
// vercel-build copies migrations/ next to the bundle.
process.env.MIGRATIONS_DIR ??= fileURLToPath(new URL('./migrations', import.meta.url));

const MAINTENANCE_EVERY_MS = 6 * 60 * 60 * 1000;

let app: Express | null = null;
let pool: Pool | null = null;
let ready: Promise<void> | null = null;
let lastMaintenance = 0;

function start(): Promise<void> {
  const config = loadConfig();
  pool = createPool(config);
  app = createApp(config, pool);
  const db = pool;
  return pendingMigrations(db).then((pending) => {
    if (pending.length) throw new Error(`Database migrations are pending (${pending.map((m) => m.name).join(', ')}).`);
  });
}

/** Keeps the instance alive after the response until `work` settles (no-op outside Vercel). */
function waitUntil(work: Promise<unknown>) {
  const ctx = (globalThis as any)[Symbol.for('@vercel/request-context')]?.get?.();
  ctx?.waitUntil?.(work.catch(() => {}));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    ready ??= start();
    await ready;
  } catch (err: any) {
    ready = null; // try again on the next request (a fixed env variable or an applied migration)
    reportError('server.start_failed', { message: err?.message ?? String(err) });
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ success: false, code: 'unavailable', message: 'الخادم غير جاهز حاليًا، حاول بعد قليل.' }));
    return;
  }

  waitUntil(new Promise((resolve) => res.once('close', resolve)).then(() => flushPushes()));
  if (Date.now() - lastMaintenance > MAINTENANCE_EVERY_MS) {
    lastMaintenance = Date.now();
    waitUntil(
      Promise.all([purgeExpired(pool!), sweepHeadGrants(pool!), sweepExpired(pool!)])
        .then(([n, endedGrants, endedAssigns]) => logger.info('maintenance.purged', { ...n, headGrantsEnded: endedGrants, assignmentsEnded: endedAssigns }))
        .catch((err) => logger.warn('maintenance.failed', { message: err.message }))
    );
  }
  app!(req as any, res as any);
}
