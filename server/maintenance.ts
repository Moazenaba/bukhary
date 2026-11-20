import type { Pool } from './db.ts';
import { logger } from './logger.ts';
import { sweepHeadGrants } from './routes/grants.ts';
import { sweepExpired } from './routes/assignments.ts';

/**
 * Housekeeping that keeps auth tables small (API-21): expired or long-revoked refresh tokens,
 * ended sessions, old idempotency keys and old audit logs are removed. Safe to run on several instances.
 */
export async function purgeExpired(pool: Pool) {
  const tokens = await pool.query(
    "DELETE FROM refresh_tokens WHERE expires_at < NOW() - interval '1 day' OR revoked_at < NOW() - interval '7 days';"
  );
  const sessions = await pool.query(
    `DELETE FROM sessions s WHERE (s.revoked_at < NOW() - interval '7 days'
       OR NOT EXISTS (SELECT 1 FROM refresh_tokens t WHERE t.session_id = s.id))
       AND s.created_at < NOW() - interval '1 day';`
  );
  const keys = await pool.query("DELETE FROM idempotency_keys WHERE created_at < NOW() - interval '7 days';");
  const failures = await pool.query("DELETE FROM login_failures WHERE updated_at < NOW() - interval '1 day';");
  const limits = await pool.query("DELETE FROM rate_limits WHERE updated_at < NOW() - interval '1 day';");
  const auditLogs = await pool.query("DELETE FROM audit_logs WHERE created_at < NOW() - interval '90 days';");
  return {
    refreshTokens: tokens.rowCount ?? 0,
    sessions: sessions.rowCount ?? 0,
    idempotencyKeys: keys.rowCount ?? 0,
    loginFailures: failures.rowCount ?? 0,
    rateLimits: limits.rowCount ?? 0,
    auditLogs: auditLogs.rowCount ?? 0,
  };
}

export function startMaintenance(pool: Pool, everyMs = 6 * 60 * 60 * 1000) {
  const run = () =>
    Promise.all([purgeExpired(pool), sweepHeadGrants(pool), sweepExpired(pool)])
      .then(([n, endedGrants]) => logger.info('maintenance.purged', { ...n, headGrantsEnded: endedGrants }))
      .catch((err) => logger.warn('maintenance.failed', { message: err.message }));
  setTimeout(run, 60_000).unref();
  setInterval(run, everyMs).unref();
}
