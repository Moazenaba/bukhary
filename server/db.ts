import pg from 'pg';
import type { AppConfig } from './config.ts';
import { logger } from './logger.ts';

// Calendar dates come back as 'YYYY-MM-DD' strings. The default parser would turn them into
// local-midnight Date objects, which serialise to the previous day in UTC+2 and similar zones.
pg.types.setTypeParser(1082, (value) => value);

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;
export type Queryable = pg.Pool | pg.PoolClient;

export function createPool(config: AppConfig): pg.Pool {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL (or SUPABASE_DB_HOST/SUPABASE_DB_* variables) is not set.');
  }

  const ssl = config.databaseSslDisabled
    ? false
    : config.databaseCaCert
      ? { rejectUnauthorized: true, ca: config.databaseCaCert }
      : { rejectUnauthorized: false };

  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    statement_timeout: 20_000,
    application_name: 'bukhari-api',
  });

  // Without this listener a dropped idle connection crashes the process.
  pool.on('error', (err) => {
    logger.error('db.pool_error', { message: err.message });
  });

  return pool;
}

/** Runs `fn` inside a transaction; rolls back on any error. */
export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
