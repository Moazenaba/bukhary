import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../server/config.ts';
import { createPool, type Pool } from '../server/db.ts';
import { listMigrations, migrate, pendingMigrations } from '../server/migrate.ts';
import { TEST_DB_URL, recreateDatabase, testEnv } from './helpers.ts';

// Upgrading a database that looks like production today: the old all-in-one schema
// with its seed rows, plus the column/`data` drift the old API produced.

const LEGACY_URL = (() => {
  const u = new URL(TEST_DB_URL);
  u.pathname = '/bukhari_legacy_test';
  return u.toString();
})();

let pool: Pool;
const pdfBytes = Buffer.from('%PDF-1.4 legacy exam file');

beforeAll(async () => {
  await recreateDatabase(LEGACY_URL);
  pool = createPool(loadConfig(testEnv(LEGACY_URL)));
  await pool.query(fs.readFileSync(path.resolve('tests/fixtures/legacy_schema.sql'), 'utf8'));

  // Bulk save used to update `data` but not these columns.
  await pool.query(`UPDATE committees SET sheikh_phone = 'OLD', data = data || '{"sheikhPhone":"NEW","generalNotes":"","isWomenCommittee":true}'::jsonb WHERE id = '1';`);
  // Exam PDF stored as base64 data URL.
  await pool.query(`UPDATE exams SET pdf_data_url = $1 WHERE id = 'exam-1';`, [`data:application/pdf;base64,${pdfBytes.toString('base64')}`]);
  // Sheet row whose flags were only saved in `data`; empty-string course id.
  await pool.query(`INSERT INTO summer_course_rows (id, number, sheikh_name, delivered, course_id, data)
    VALUES ('row-1', 1, 'شيخ', false, '', '{"delivered":true,"corrected":true}'::jsonb);`);
  await pool.query(`UPDATE app_users SET email = '' WHERE id = 'user-ast-moaz';`);
});

afterAll(async () => {
  await pool.end();
});

describe('migrations on a legacy database', () => {
  it('reports pending migrations before running (the server refuses to start)', async () => {
    expect((await pendingMigrations(pool)).length).toBe(listMigrations().length);
  });

  it('applies all migrations', async () => {
    const applied = await migrate(pool);
    expect(applied).toHaveLength(listMigrations().length);
    expect(await pendingMigrations(pool)).toHaveLength(0);
    expect(await migrate(pool)).toEqual([]);
  });

  it('copies the newer values from `data` into the columns', async () => {
    const { rows } = await pool.query("SELECT sheikh_phone, general_notes, is_women_committee, data FROM committees WHERE id = '1';");
    expect(rows[0]).toMatchObject({ sheikh_phone: 'NEW', general_notes: '', is_women_committee: true, data: {} });
    const { rows: sheet } = await pool.query("SELECT delivered, corrected, course_id FROM summer_course_rows WHERE id = 'row-1';");
    expect(sheet[0]).toEqual({ delivered: true, corrected: true, course_id: null });
  });

  it('moves exam PDFs out of the exams table intact', async () => {
    const { rows } = await pool.query("SELECT e.pdf_data_url, f.content FROM exams e JOIN exam_files f ON f.exam_id = e.id WHERE e.id = 'exam-1';");
    expect(rows[0].pdf_data_url).toBeNull();
    expect(Buffer.compare(rows[0].content, pdfBytes)).toBe(0);
  });

  it('strips access fields from user profile data and normalizes empty emails', async () => {
    const { rows } = await pool.query("SELECT email, data FROM app_users WHERE id = 'user-ast-moaz';");
    expect(rows[0].email).toBeNull();
    expect(rows[0].data.role).toBeUndefined();
  });

  it('disables the seeded demo accounts, whose passwords were published', async () => {
    const { rows } = await pool.query(
      "SELECT id, status, password FROM app_users WHERE id IN ('user-admin','user-head-dosari','user-ast-moaz') ORDER BY id;"
    );
    expect(rows).toHaveLength(3);
    for (const r of rows) expect({ id: r.id, status: r.status, password: r.password }).toEqual({ id: r.id, status: 'rejected', password: null });
  });

  it('deleted rows stay deleted: nothing re-seeds them', async () => {
    await pool.query("DELETE FROM app_users WHERE id = 'user-admin';");
    await migrate(pool);
    const { rows } = await pool.query("SELECT 1 FROM app_users WHERE id = 'user-admin';");
    expect(rows).toHaveLength(0);
  });

  it('a fresh database gets the schema and no seed data at all', async () => {
    const freshUrl = new URL(TEST_DB_URL);
    freshUrl.pathname = '/bukhari_fresh_test';
    await recreateDatabase(freshUrl.toString());
    const fresh = createPool(loadConfig(testEnv(freshUrl.toString())));
    try {
      await migrate(fresh);
      for (const table of ['app_users', 'courses', 'committees', 'exams', 'schedule_tasks', 'system_settings']) {
        const { rows } = await fresh.query(`SELECT count(*)::int AS n FROM ${table};`);
        expect({ table, n: rows[0].n }).toEqual({ table, n: 0 });
      }
    } finally {
      await fresh.end();
    }
  });
});
