import fs from 'fs';
import path from 'path';
import type { Pool } from './db.ts';

// Versioned SQL migrations. Each file in migrations/ (NNN_name.sql) runs once, in order,
// inside its own transaction, and is recorded in schema_migrations. The server never
// changes the schema on boot; it only refuses to start while migrations are pending.

const LOCK_KEY = 74_514_001; // arbitrary constant for pg_advisory_lock

export interface MigrationFile {
  version: string;
  name: string;
  file: string;
}

export function defaultMigrationsDir(): string {
  return path.resolve(process.cwd(), 'migrations');
}

export function listMigrations(dir = defaultMigrationsDir()): MigrationFile[] {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f))
    .sort()
    .map((f) => ({ version: f.slice(0, 3), name: f.replace(/\.sql$/, ''), file: path.join(dir, f) }));
}

async function ensureTable(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(16) PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`);
}

export async function appliedVersions(pool: Pool): Promise<Set<string>> {
  const exists = await pool.query(`SELECT to_regclass('public.schema_migrations') AS t;`);
  if (!exists.rows[0].t) return new Set();
  const { rows } = await pool.query('SELECT version FROM schema_migrations;');
  return new Set(rows.map((r) => r.version as string));
}

export async function pendingMigrations(pool: Pool, dir?: string): Promise<MigrationFile[]> {
  const applied = await appliedVersions(pool);
  return listMigrations(dir).filter((m) => !applied.has(m.version));
}

/** Applies pending migrations; returns the names applied. Safe to run concurrently. */
export async function migrate(pool: Pool, dir?: string, log: (msg: string) => void = () => {}): Promise<string[]> {
  const client = await pool.connect();
  const done: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1);', [LOCK_KEY]);
    await ensureTable(pool);
    for (const m of await pendingMigrations(pool, dir)) {
      const sql = fs.readFileSync(m.file, 'utf8');
      log(`applying ${m.name}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2);', [m.version, m.name]);
        await client.query('COMMIT');
      } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migration ${m.name} failed: ${err.message}`);
      }
      done.push(m.name);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1);', [LOCK_KEY]).catch(() => {});
    client.release();
  }
  return done;
}
