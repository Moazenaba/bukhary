import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import pg from 'pg';
import request from 'supertest';
import { createApp } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';
import { createPool } from '../server/db.ts';
import { migrate } from '../server/migrate.ts';

// Tests run against a disposable local Postgres, never against Supabase.
// Override with TEST_DATABASE_URL; the database is dropped and recreated.
export const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres@localhost:55432/bukhari_test';

export function adminUrl(dbUrl = TEST_DB_URL) {
  const u = new URL(dbUrl);
  u.pathname = '/postgres';
  return u.toString();
}

export async function recreateDatabase(dbUrl = TEST_DB_URL) {
  const name = new URL(dbUrl).pathname.slice(1);
  if (!/^[\w]+_test\w*$/.test(name)) throw new Error(`Refusing to recreate "${name}": test databases must end with _test.`);
  const admin = new pg.Client({ connectionString: adminUrl(dbUrl) });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE);`);
  await admin.query(`CREATE DATABASE "${name}";`);
  await admin.end();
}

export const testEnv = (dbUrl = TEST_DB_URL): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  DATABASE_URL: dbUrl,
  DATABASE_SSL: 'disable',
  JWT_SECRET: 'test_secret_that_is_long_enough_for_hs256_signing',
});

export async function setupApp(dbUrl = TEST_DB_URL) {
  await recreateDatabase(dbUrl);
  const config = loadConfig(testEnv(dbUrl));
  const pool = createPool(config);
  await migrate(pool);
  const app = createApp(config, pool);
  return { app, pool, config, api: () => request(app) };
}

export type TestApp = Awaited<ReturnType<typeof setupApp>>;

export const PASSWORD = 'Passw0rd-test';

export async function createUser(
  pool: pg.Pool,
  opts: {
    role: string;
    status?: string;
    permissions?: string[];
    /** Committee numbers; resolved to the ids of committees that exist when the user is created. */
    assigned?: number[];
    committeeIds?: string[];
    allCommittees?: boolean;
    /** Defaults to true, matching accounts that existed before exam allow-lists were enforced. */
    allExams?: boolean;
    allowedExamIds?: string[];
    mustChangePassword?: boolean;
    name?: string;
    phone?: string;
  }
) {
  const id = `usr_${crypto.randomUUID()}`;
  const phone = opts.phone ?? `05${crypto.randomInt(10_000_000, 99_999_999)}`;
  let ids = opts.committeeIds ?? [];
  if (opts.assigned?.length) {
    const { rows } = await pool.query('SELECT id FROM committees WHERE committee_number = ANY($1::int[]);', [opts.assigned]);
    ids = [...new Set([...ids, ...rows.map((r) => r.id as string)])];
  }
  await pool.query(
    `INSERT INTO app_users (id, name, phone, password, role, status, permissions, assigned_committees, assigned_committee_ids,
       all_committees, all_exams, allowed_exam_ids, must_change_password, created_at, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),'{}'::jsonb);`,
    [id, opts.name ?? `${opts.role} user`, phone, await bcrypt.hash(PASSWORD, 4), opts.role, opts.status ?? 'approved',
      JSON.stringify(opts.permissions ?? []), JSON.stringify(opts.assigned ?? []), JSON.stringify(ids),
      opts.allCommittees ?? false, opts.allExams ?? true, JSON.stringify(opts.allowedExamIds ?? []), opts.mustChangePassword ?? false]
  );
  return { id, phone };
}

/** Tests share one address (127.0.0.1): each test starts without earlier tests' wrong attempts. */
export async function resetRateLimits(pool: pg.Pool) {
  await pool.query('DELETE FROM rate_limits;').catch(() => {});
}

export async function login(t: TestApp, phone: string, password = PASSWORD) {
  await resetRateLimits(t.pool);
  const res = await t.api().post('/api/auth/login').send({ identifier: phone, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { token: string; refreshToken: string; user: any };
}

export async function userWithToken(t: TestApp, opts: Parameters<typeof createUser>[1]) {
  const u = await createUser(t.pool, opts);
  const { token } = await login(t, u.phone);
  return { ...u, token, auth: { Authorization: `Bearer ${token}` } };
}

export async function seedCourse(pool: pg.Pool, id = 'course-1', name = 'دورة الاختبار') {
  await pool.query(`INSERT INTO courses (id, name, status) VALUES ($1,$2,'active') ON CONFLICT DO NOTHING;`, [id, name]);
  return id;
}

export const committeeBody = (overrides: Record<string, unknown> = {}) => ({
  id: `c-${crypto.randomUUID()}`,
  committeeNumber: 1,
  committeeName: 'لجنة اختبار',
  courseId: 'course-1',
  members: ['عضو 1'],
  studentsCount: 10,
  ...overrides,
});
