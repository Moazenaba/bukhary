import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committeeBody, seedCourse, setupApp, userWithToken, type TestApp } from './helpers.ts';

let t: TestApp;
let admin: Awaited<ReturnType<typeof userWithToken>>;
beforeAll(async () => {
  t = await setupApp();
  await seedCourse(t.pool);
  admin = await userWithToken(t, { role: 'super_admin' });
});
afterAll(async () => {
  await t.pool.end();
});

describe('date columns', () => {
  it('are real date and timestamp types after migration 006', async () => {
    const { rows } = await t.pool.query(`
      SELECT table_name || '.' || column_name AS col, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND (table_name, column_name) IN (
        ('courses', 'start_date'), ('courses', 'end_date'), ('courses', 'created_at'),
        ('committees', 'created_date'), ('app_users', 'created_at'), ('app_users', 'approved_at'),
        ('exams', 'uploaded_at'), ('schedule_tasks', 'date'), ('schedule_tasks', 'completed_at'));`);
    const types = Object.fromEntries(rows.map((r) => [r.col, r.data_type]));
    expect(types['courses.start_date']).toBe('date');
    expect(types['committees.created_date']).toBe('date');
    expect(types['schedule_tasks.date']).toBe('date');
    expect(types['courses.created_at']).toBe('timestamp with time zone');
    expect(types['exams.uploaded_at']).toBe('timestamp with time zone');
  });

  it('parse the legacy formats and keep nothing wrong', async () => {
    const q = async (sql: string, v: string) => (await t.pool.query(sql, [v])).rows[0].r;
    expect(await q('SELECT parse_legacy_date($1)::text AS r', '2026-09-20')).toBe('2026-09-20');
    expect(await q('SELECT parse_legacy_date($1)::text AS r', '2026/09/20 - 08:00 ص')).toBe('2026-09-20');
    expect(await q('SELECT parse_legacy_date($1)::text AS r', '2026-02-31')).toBeNull();
    expect(await q('SELECT parse_legacy_date($1)::text AS r', '20 سبتمبر')).toBeNull();
    // Compare instants, not text: the session time zone changes how timestamptz prints.
    expect(await q("SELECT (parse_legacy_timestamp($1) = '2026-09-20T00:00:00Z'::timestamptz)::text AS r", '2026-09-20')).toBe('true');
    expect(await q("SELECT (parse_legacy_timestamp($1) = '2026-09-20T10:30:00Z'::timestamptz)::text AS r", '2026-09-20T10:30:00.000Z')).toBe('true');
  });
});

describe('date inputs', () => {
  it('normalises YYYY/MM/DD committee dates and returns them as plain dates', async () => {
    const body = committeeBody({ committeeNumber: 701, createdDate: '2026/09/20', createdAtTime: '08:00 ص' });
    const res = await t.api().post('/api/committees').set(admin.auth).send(body);
    expect(res.status).toBe(200);
    expect(res.body.committee.createdDate).toBe('2026-09-20');
    expect(res.body.committee.createdAtTime).toBe('08:00 ص');
  });

  it('rejects a committee date that is not a real date', async () => {
    const res = await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: 702, createdDate: '20 سبتمبر' }));
    expect(res.status).toBe(400);
  });

  it('returns course dates as YYYY-MM-DD without a timezone shift', async () => {
    const res = await t.api().post('/api/courses').set(admin.auth).send({ id: 'course-dates', name: 'دورة التواريخ', startDate: '2026-09-20', endDate: '' });
    expect(res.status).toBe(200);
    const list = await t.api().get('/api/courses').set(admin.auth);
    const c = list.body.courses.find((x: any) => x.id === 'course-dates');
    expect(c.startDate).toBe('2026-09-20');
    expect(c.endDate).toBe('');
  });

  it('rejects a course start date that is not a real date', async () => {
    const res = await t.api().post('/api/courses').set(admin.auth).send({ id: 'course-bad', name: 'x', startDate: '2026-02-31' });
    expect(res.status).toBe(400);
  });

  it('rejects an unreadable exam upload time', async () => {
    const res = await t.api().post('/api/exams').set(admin.auth).send({ id: 'exam-bad-date', title: 'x', book: 'y', uploadedAt: 'not a date' });
    expect(res.status).toBe(400);
  });
});
