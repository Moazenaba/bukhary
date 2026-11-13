import fs from 'fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committeeBody, createUser, seedCourse, setupApp, userWithToken, type TestApp } from '../helpers.ts';

// The security review's findings, each proven fixed against the real API.
let t: TestApp;
let superAdmin: Awaited<ReturnType<typeof userWithToken>>;
let admin: Awaited<ReturnType<typeof userWithToken>>;

beforeAll(async () => {
  t = await setupApp();
  await seedCourse(t.pool);
  superAdmin = await userWithToken(t, { role: 'super_admin' });
  admin = await userWithToken(t, { role: 'admin' });
  await t.api().post('/api/auth/login').send({ identifier: 'nobody', password: 'wrong' }); // an audit row
});
afterAll(async () => {
  await t.pool.end();
});

const tables = async (auth: Record<string, string>) =>
  ((await t.api().get('/api/database/backup/tables').set(auth)).body.tables as any[]).map((x) => x.name as string);
const rowsOf = async (auth: Record<string, string>, table: string) => t.api().get(`/api/database/backup/rows?table=${table}`).set(auth);

describe('backup from the website', () => {
  it('an admin gets no sign-in secrets, sessions or audit log', async () => {
    const names = await tables(admin.auth);
    for (const secret of ['sessions', 'refresh_tokens', 'idempotency_keys', 'login_failures', 'device_tokens', 'audit_logs', 'rate_limits']) {
      expect(names).not.toContain(secret);
      expect((await rowsOf(admin.auth, secret)).status).toBe(400);
    }
    expect(names).toEqual(expect.arrayContaining(['committees', 'courses', 'exams', 'exam_files', 'app_users']));
  });

  it("an admin's copy of the users has no password hash and no admin accounts", async () => {
    await createUser(t.pool, { role: 'sheikh', name: 'شيخ في النسخة' });
    const meta = (await t.api().get('/api/database/backup/tables').set(admin.auth)).body.tables.find((x: any) => x.name === 'app_users');
    const col = (n: string) => meta.columns.findIndex((c: any) => c.name === n);
    const rows = (await rowsOf(admin.auth, 'app_users')).body.rows as any[][];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r[col('password')] === null)).toBe(true);
    expect(rows.some((r) => ['admin', 'super_admin'].includes(r[col('role')]))).toBe(false);
  });

  it('a super admin still gets everything, hashes and audit log included', async () => {
    const names = await tables(superAdmin.auth);
    expect(names).toEqual(expect.arrayContaining(['sessions', 'audit_logs', 'refresh_tokens']));
    expect((await rowsOf(superAdmin.auth, 'audit_logs')).body.rows.length).toBeGreaterThan(0);
    const meta = (await t.api().get('/api/database/backup/tables').set(superAdmin.auth)).body.tables.find((x: any) => x.name === 'app_users');
    const pw = meta.columns.findIndex((c: any) => c.name === 'password');
    const rows = (await rowsOf(superAdmin.auth, 'app_users')).body.rows as any[][];
    expect(rows.some((r) => String(r[pw]).startsWith('$2'))).toBe(true);
  });
});

describe('exam paper downloads are recorded', () => {
  it('who downloaded which exam, and when', async () => {
    await t.api().post('/api/exams').set(superAdmin.auth).send({ id: 'exam-dl', title: 'امتحان', book: 'كتاب' });
    await t.api().put('/api/exams/exam-dl/file').set(superAdmin.auth).set('Content-Type', 'application/pdf').send(Buffer.from('%PDF-1.4\n%%EOF'));
    const head = await userWithToken(t, { role: 'committee_head', allowedExamIds: ['exam-dl'], allExams: false });
    expect((await t.api().get('/api/exams/exam-dl/file').set(head.auth)).status).toBe(200);
    const { rows } = await t.pool.query("SELECT actor_id, entity_id FROM audit_logs WHERE action = 'exam.file_download';");
    expect(rows).toEqual([{ actor_id: head.id, entity_id: 'exam-dl' }]);
  });
});

describe('clear messages', () => {
  it('a taken committee number says so', async () => {
    await t.api().post('/api/committees').set(superAdmin.auth).send(committeeBody({ committeeNumber: 77 }));
    const res = await t.api().post('/api/committees').set(superAdmin.auth).send(committeeBody({ committeeNumber: 77 }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('committee_number_taken');
    expect(res.body.message).toContain('رقم اللجنة 77 موجود بالفعل');
  });
});

describe('migration 019', () => {
  it('existing committee heads keep adding committees and managing tasks; nobody else gains anything', async () => {
    const head = await createUser(t.pool, { role: 'committee_head', permissions: ['exams_pdf'] });
    const sheikh = await createUser(t.pool, { role: 'sheikh' });
    await t.pool.query(fs.readFileSync('migrations/019_rate_limits_and_head_permissions.sql', 'utf8').replace(/CREATE TABLE[\s\S]*?;\nALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;/, ''));
    const { rows } = await t.pool.query('SELECT id, permissions FROM app_users WHERE id = ANY($1);', [[head.id, sheikh.id]]);
    const perms = Object.fromEntries(rows.map((r) => [r.id, [...r.permissions].sort()]));
    expect(perms[head.id]).toEqual(['add_new_committee', 'calendar_schedule', 'exams_pdf']);
    expect(perms[sheikh.id]).toEqual([]);
  });
});
