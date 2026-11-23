import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../server/db.ts';
import { loadConfig } from '../server/config.ts';
import { defaultMigrationsDir, migrate } from '../server/migrate.ts';
import { recreateDatabase, testEnv } from './helpers.ts';

// Migration 025 moves the people already on committees into committee_staff without anyone losing access.
const DB = (process.env.TEST_DATABASE_URL || 'postgresql://postgres@localhost:55432/bukhari_test').replace(/\/([^/]+)$/, '/$1_m025');
let pool: ReturnType<typeof createPool>;

beforeAll(async () => {
  await recreateDatabase(DB);
  pool = createPool(loadConfig(testEnv(DB)));
  // The schema as released before 025.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  for (const f of fs.readdirSync(defaultMigrationsDir())) {
    if (/^\d{3}_/.test(f) && f < '025_') fs.copyFileSync(path.join(defaultMigrationsDir(), f), path.join(dir, f));
  }
  await migrate(pool, dir);
  await pool.query(`INSERT INTO courses (id, name, status) VALUES ('co', 'دورة', 'active');`);
  const committee = (id: string, n: number, stages: object, attendees: object[] = []) =>
    pool.query(
      `INSERT INTO committees (id, committee_number, committee_name, course_id, stages, ceremony_details)
       VALUES ($1, $2, 'لجنة', 'co', $3::jsonb, $4::jsonb);`,
      [id, n, JSON.stringify(stages), JSON.stringify({ attendees })]
    );
  const user = (id: string, role: string, committees: string[], created: string) =>
    pool.query(
      `INSERT INTO app_users (id, name, phone, role, status, assigned_committee_ids, created_at, data)
       VALUES ($1::text, $1::text, $1::text, $2, 'approved', $3::jsonb, $4, '{}'::jsonb);`,
      [id, role, JSON.stringify(committees), created]
    );
  await committee('c1', 1, {});
  await committee('c2', 2, { registration: { completed: true }, exam: { completed: true } });
  await committee('c3', 3, { exam: { completed: true }, accreditation: { completed: true } }, [{ id: 'guest', name: 'guest' }]);
  await user('head-old', 'committee_head', ['c1', 'c2'], '2025-01-01');
  await user('head-new', 'committee_head', ['c1'], '2025-06-01');
  await user('sheikh', 'sheikh', ['c1'], '2025-02-01');
  await user('guest', 'sheikh', [], '2025-02-01');
  await user('observer', 'sheikh', [], '2025-02-01');
  await pool.query(
    `INSERT INTO committee_assignments (id, user_id, committee_id, task, status) VALUES
       ('asg-1', 'observer', 'c2', 'exam', 'active'), ('asg-2', 'observer', 'c3', 'exam', 'ended');`
  );
  await pool.query(`INSERT INTO committee_observations (id, assignment_id, committee_id, user_id, note) VALUES ('o1', 'asg-1', 'c2', 'observer', 'ملاحظة');`);
  await migrate(pool);
});
afterAll(async () => {
  await pool.end();
});

const staff = async () =>
  (await pool.query(`SELECT committee_id, user_id, role, status, notified_at IS NOT NULL AS told FROM committee_staff ORDER BY committee_id, user_id, role;`)).rows;

describe('migration 025', () => {
  it('places existing committees by their stages, never before «active»', async () => {
    const { rows } = await pool.query('SELECT id, lifecycle FROM committees ORDER BY id;');
    expect(rows).toEqual([
      { id: 'c1', lifecycle: 'active' },
      { id: 'c2', lifecycle: 'observed' },
      { id: 'c3', lifecycle: 'accredited' },
    ]);
  });

  it('the longest-standing head owns each committee; everyone else on it observes; all were already told', async () => {
    const rows = await staff();
    expect(rows).toEqual(
      expect.arrayContaining([
        { committee_id: 'c1', user_id: 'head-old', role: 'owner', status: 'active', told: true },
        { committee_id: 'c1', user_id: 'head-new', role: 'observer', status: 'active', told: true },
        { committee_id: 'c1', user_id: 'sheikh', role: 'observer', status: 'active', told: true },
        { committee_id: 'c2', user_id: 'head-old', role: 'owner', status: 'active', told: true },
        { committee_id: 'c2', user_id: 'observer', role: 'observer', status: 'active', told: true },
        { committee_id: 'c3', user_id: 'guest', role: 'ceremony_sheikh', status: 'active', told: true },
      ])
    );
    // Ended assignments are not moved.
    expect(rows.some((r) => r.committee_id === 'c3' && r.user_id === 'observer')).toBe(false);
    expect(rows.length).toBe(6);
  });

  it('keeps the assignment id, so observer notes stay linked, and touches no account', async () => {
    expect((await pool.query(`SELECT id FROM committee_staff WHERE id = 'asg-1';`)).rows.length).toBe(1);
    expect((await pool.query(`SELECT assignment_id FROM committee_observations;`)).rows).toEqual([{ assignment_id: 'asg-1' }]);
    const { rows } = await pool.query(`SELECT assigned_committee_ids FROM app_users WHERE id = 'head-old';`);
    expect(rows[0].assigned_committee_ids).toEqual(['c1', 'c2']);
  });

  it('accepts the new role', async () => {
    await pool.query(`UPDATE app_users SET role = 'exams_manager' WHERE id = 'guest';`);
  });
});
