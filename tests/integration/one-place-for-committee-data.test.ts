import fs from 'fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committeeBody, seedCourse, setupApp, userWithToken, type TestApp } from '../helpers.ts';

// A committee's sheikh, place, book and students live on the committee; the course sheet shows them.
let t: TestApp;
let sa: Awaited<ReturnType<typeof userWithToken>>;
let n = 300;
const committee = async (over: Record<string, unknown> = {}) =>
  (await t.api().post('/api/committees').set(sa.auth).send(committeeBody({ committeeNumber: n++, ...over }))).body.committee;
const saveRow = (row: Record<string, unknown>) => t.api().post('/api/summer-course-rows').set(sa.auth).send({ number: 1, courseId: 'course-1', ...row });
const rows = async () => (await t.api().get('/api/summer-course-rows').set(sa.auth)).body.rows as any[];

beforeAll(async () => {
  t = await setupApp();
  await seedCourse(t.pool);
  sa = await userWithToken(t, { role: 'super_admin' });
});
afterAll(async () => {
  await t.pool.end();
});

describe('course sheet rows linked to a committee', () => {
  it("show the committee's data, and a row save cannot change it", async () => {
    const c = await committee({ sheikhName: 'الشيخ هشام', sheikhCountry: 'مسجد النور', competitionBook: 'ما لا يسع', studentsCount: 30 });
    const res = await saveRow({ id: 'row-linked', committeeId: c.id, sheikh_name: 'اسم قديم', place: 'مكان قديم', book: 'كتاب قديم', students_count: 3, notes: 'ملاحظة' });
    expect(res.status).toBe(200);
    expect(res.body.row).toMatchObject({ sheikh_name: 'الشيخ هشام', place: 'مسجد النور', book: 'ما لا يسع', students_count: 30, notes: 'ملاحظة' });
    // Editing the committee shows in the sheet at once.
    await t.api().post('/api/committees').set(sa.auth).send({ ...committeeBody({ id: c.id, committeeNumber: c.committeeNumber }), sheikhName: 'الشيخ هشام نعام', sheikhCountry: 'مسجد النور', competitionBook: 'ما لا يسع', studentsCount: 31, expectedUpdatedAt: c.updatedAt });
    expect((await rows()).find((r) => r.id === 'row-linked')).toMatchObject({ sheikh_name: 'الشيخ هشام نعام', students_count: 31 });
  });

  it('the place falls back to the branch, then to what the row had', async () => {
    const withBranch = await committee({ branch: 'فرع طنطا' });
    await saveRow({ id: 'row-branch', committeeId: withBranch.id, place: 'x' });
    const bare = await committee({ competitionBook: '' });
    await t.pool.query("INSERT INTO summer_course_rows (id, number, sheikh_name, place, committee_id, course_id, data) VALUES ('row-own', 2, '', 'مكان الصف', $1, 'course-1', '{}'::jsonb);", [bare.id]);
    const list = await rows();
    expect(list.find((r) => r.id === 'row-branch').place).toBe('فرع طنطا');
    expect(list.find((r) => r.id === 'row-own').place).toBe('مكان الصف');
  });

  it('a row without a committee keeps and edits its own data', async () => {
    const res = await saveRow({ id: 'row-free', sheikh_name: 'شيخ الصف', place: 'مكان', book: 'كتاب', students_count: 7 });
    expect(res.body.row).toMatchObject({ sheikh_name: 'شيخ الصف', place: 'مكان', book: 'كتاب', students_count: 7 });
  });
});

describe('migration 021', () => {
  it('copies what was typed only in the sheet to the committee, and never overwrites the committee', async () => {
    const empty = await committee({ branch: 'فرع' });
    const full = await committee({ sheikhName: 'شيخ اللجنة', sheikhCountry: 'مكان اللجنة', competitionBook: 'كتاب اللجنة', studentsCount: 12 });
    for (const [id, c] of [['m-empty', empty], ['m-full', full]] as const) {
      await t.pool.query(
        `INSERT INTO summer_course_rows (id, number, sheikh_name, place, book, students_count, committee_id, course_id, data)
         VALUES ($1, 9, 'شيخ الكشف', 'مكان الكشف', 'كتاب الكشف', 40, $2, 'course-1', '{}'::jsonb);`,
        [id, c.id]
      );
    }
    await t.pool.query("UPDATE committees SET sheikh_name = NULL, sheikh_country = NULL, competition_book = '', students_count = 0 WHERE id = $1;", [empty.id]);
    await t.pool.query(fs.readFileSync('migrations/021_sheet_values_to_committees.sql', 'utf8'));
    const { rows: got } = await t.pool.query(
      'SELECT id, sheikh_name, sheikh_country, competition_book, students_count, branch FROM committees WHERE id = ANY($1) ORDER BY committee_number;',
      [[empty.id, full.id]]
    );
    expect(got[0]).toMatchObject({ sheikh_name: 'شيخ الكشف', sheikh_country: 'مكان الكشف', competition_book: 'كتاب الكشف', students_count: 40, branch: 'فرع' });
    expect(got[1]).toMatchObject({ sheikh_name: 'شيخ اللجنة', sheikh_country: 'مكان اللجنة', competition_book: 'كتاب اللجنة', students_count: 12 });
    // The sheet's own copy is still there.
    const { rows: sheet } = await t.pool.query("SELECT sheikh_name FROM summer_course_rows WHERE id = 'm-full';");
    expect(sheet[0].sheikh_name).toBe('شيخ الكشف');
  });
});

describe('migration 022: suggested names leave the code', () => {
  it('an existing installation keeps the same names, now editable; an existing list is not replaced', async () => {
    await t.pool.query("DELETE FROM system_settings WHERE key IN ('observers', 'ceremony_sheikhs');");
    await t.pool.query(fs.readFileSync('migrations/022_name_lists_to_settings.sql', 'utf8'));
    const got = (await t.api().get('/api/settings').set(sa.auth)).body.settings;
    expect(got.observers).toHaveLength(34);
    expect(got.observers).toContain('أحمد المخزنجي');
    expect(got.ceremony_sheikhs).toHaveLength(18);
    expect(got.ceremony_sheikhs).toContain('الشيخ أشرف مازن');
    await t.api().put('/api/settings/observers').set(sa.auth).send({ value: ['اسم واحد'] });
    await t.pool.query(fs.readFileSync('migrations/022_name_lists_to_settings.sql', 'utf8'));
    expect((await t.api().get('/api/settings').set(sa.auth)).body.settings.observers).toEqual(['اسم واحد']);
  });
});
