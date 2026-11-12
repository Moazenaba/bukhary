import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listMigrations, migrate } from '../server/migrate.ts';
import { committeeBody, createUser, seedCourse, setupApp, userWithToken, type TestApp } from './helpers.ts';

// Migrations change real people's data in production. These tests stop the mistakes that lose data.
const DIR = path.resolve('migrations');
const LOCK = JSON.parse(fs.readFileSync(path.join(DIR, 'checksums.json'), 'utf8')) as Record<string, string>;
const sha = (f: string) => crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR, f))).digest('hex');

describe('migration files', () => {
  it('a migration that was released is never edited (change the schema with a new file)', () => {
    for (const [file, hash] of Object.entries(LOCK)) {
      expect(fs.existsSync(path.join(DIR, file)), `${file} was deleted or renamed`).toBe(true);
      expect(sha(file), `${file} was edited after release; add a new migration instead`).toBe(hash);
    }
  });

  it('every migration is in the lock file (run: npm run migrations:lock after adding one)', () => {
    for (const m of listMigrations(DIR)) expect(LOCK, `${path.basename(m.file)} is missing from migrations/checksums.json`).toHaveProperty(path.basename(m.file));
  });

  it('versions are numbered 001, 002, … without gaps or duplicates', () => {
    const versions = listMigrations(DIR).map((m) => Number(m.version));
    expect(versions).toEqual(versions.map((_, i) => i + 1));
  });

  it('no migration drops a table or a column, or deletes rows without a WHERE', () => {
    // Removing data must be a reviewed decision: allow it only with a «-- data-loss-reviewed» note.
    // Released before this check existed, reviewed: 004 moves «read» to per-user reads, 016 clears
    // old notifications on purpose, 017 clears failed-login counters.
    const REVIEWED = new Set(['004_shared_settings.sql', '016_clear_old_notifications.sql', '017_unlock_all_accounts.sql']);
    for (const m of listMigrations(DIR)) {
      const sql = fs.readFileSync(m.file, 'utf8');
      if (sql.includes('-- data-loss-reviewed') || REVIEWED.has(path.basename(m.file))) continue;
      const risky = sql
        .split(';')
        .map((s) => s.replace(/--.*$/gm, '').trim())
        .filter((s) => /\bDROP\s+TABLE\b|\bDROP\s+COLUMN\b|\bTRUNCATE\b/i.test(s) || (/^DELETE\s+FROM\b/i.test(s) && !/\bWHERE\b/i.test(s)));
      expect(risky, `${path.basename(m.file)} removes data; review it and add «-- data-loss-reviewed»`).toEqual([]);
    }
  });
});

describe('running migrations', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await setupApp();
    await seedCourse(t.pool);
  });
  afterAll(async () => {
    await t.pool.end();
  });

  it('running them again applies nothing and keeps every row as it was', async () => {
    const admin = await userWithToken(t, { role: 'super_admin' });
    await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: 1, sheikhCountry: 'مسجد النور' }));
    await createUser(t.pool, { role: 'sheikh', name: 'شيخ' });
    const snapshot = async () => {
      const out: Record<string, unknown> = {};
      for (const table of ['committees', 'app_users', 'courses', 'schedule_tasks', 'summer_course_rows', 'exams']) {
        out[table] = (await t.pool.query(`SELECT * FROM ${table} ORDER BY id;`)).rows;
      }
      return JSON.stringify(out);
    };
    const before = await snapshot();
    expect(await migrate(t.pool)).toEqual([]);
    expect(await snapshot()).toBe(before);
  });

  it('two servers migrating at the same time do not apply anything twice', async () => {
    const [a, b] = await Promise.all([migrate(t.pool), migrate(t.pool)]);
    expect([...a, ...b]).toEqual([]);
    const { rows } = await t.pool.query('SELECT version, count(*)::int AS n FROM schema_migrations GROUP BY version HAVING count(*) > 1;');
    expect(rows).toEqual([]);
  });

  it('the database itself enforces the important rules (not only the code)', async () => {
    // Same committee number twice in one course.
    await t.pool.query(`INSERT INTO committees (id, committee_number, committee_name, course_id, stages) VALUES ('dup-a', 77, 'أ', 'course-1', '{}'::jsonb);`);
    await expect(
      t.pool.query(`INSERT INTO committees (id, committee_number, committee_name, course_id, stages) VALUES ('dup-b', 77, 'ب', 'course-1', '{}'::jsonb);`)
    ).rejects.toThrow();
    // A course that still has committees cannot be deleted.
    await expect(t.pool.query(`DELETE FROM courses WHERE id = 'course-1';`)).rejects.toThrow();
    // Deleting a committee keeps its general tasks (unlinked) instead of losing them.
    await t.pool.query(`INSERT INTO schedule_tasks (id, title, date, committee_id, type, priority, completed, data) VALUES ('t-keep', 'مهمة', '2026-12-01', 'dup-a', 'general', 'normal', false, '{}'::jsonb);`);
    await t.pool.query(`DELETE FROM committees WHERE id = 'dup-a';`);
    const { rows } = await t.pool.query(`SELECT committee_id FROM schedule_tasks WHERE id = 't-keep';`);
    expect(rows).toEqual([{ committee_id: null }]);
  });
});
