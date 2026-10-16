import type { Pool } from './db.ts';
import { logger } from './logger.ts';

/**
 * Housekeeping that keeps auth tables small (API-21): expired or long-revoked refresh tokens,
 * ended sessions and old idempotency keys are removed. Safe to run on several instances.
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
  return { refreshTokens: tokens.rowCount ?? 0, sessions: sessions.rowCount ?? 0, idempotencyKeys: keys.rowCount ?? 0 };
}

export function startMaintenance(pool: Pool, everyMs = 6 * 60 * 60 * 1000) {
  const run = () =>
    purgeExpired(pool)
      .then((n) => logger.info('maintenance.purged', n))
      .catch((err) => logger.warn('maintenance.failed', { message: err.message }));
  setTimeout(run, 60_000).unref();
  setInterval(run, everyMs).unref();
}
