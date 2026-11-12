import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committeeBody, createUser, seedCourse, setupApp, userWithToken, type TestApp } from './helpers.ts';

// Rules that keep the data consistent as a whole: stage order on every kind of save, the ceremony
// and its calendar task, and links left behind when something is deleted.

let t: TestApp;
let admin: Awaited<ReturnType<typeof userWithToken>>;
let n = 100;
const save = (overrides: Record<string, unknown> = {}) =>
  t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: n++, ...overrides }));
const act = (id: string, action: object) => t.api().post(`/api/committees/${id}/actions`).set(admin.auth).send({ action });
const ALL_DONE = Object.fromEntries(
  ['registration', 'exam', 'scoring', 'aggregation', 'review', 'sheet', 'accreditation', 'announcement'].map((k) => [k, { completed: true }])
);
const cairoDay = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
};

beforeAll(async () => {
  t = await setupApp();
  await seedCourse(t.pool);
  admin = await userWithToken(t, { role: 'super_admin' });
});
afterAll(async () => {
  await t.pool.end();
});

describe('stage order on whole saves', () => {
  it('completing a later stage in a save completes every earlier stage (no gaps)', async () => {
    const res = await save({ stages: { registration: { completed: true }, review: { completed: true } } });
    expect(res.status).toBe(200);
    const s = res.body.committee.stages;
    for (const k of ['registration', 'exam', 'scoring', 'aggregation', 'review']) expect(s[k].completed).toBe(true);
    expect(s.sheet.completed).toBe(false);
    expect(s.exam.completedBy).toBeTruthy();
  });

  it('an earlier stage cannot be reopened by a save while a later one stays completed', async () => {
    const c = (await save({ stages: { registration: { completed: true }, scoring: { completed: true } } })).body.committee;
    const res = await t.api().post('/api/committees').set(admin.auth)
      .send({ ...committeeBody({ id: c.id, committeeNumber: c.committeeNumber }), stages: { ...c.stages, exam: { completed: false } }, expectedUpdatedAt: c.updatedAt });
    expect(res.status).toBe(400);
  });
});

describe('the ceremony and its calendar task', () => {
  it('«تم الحفل» cannot be recorded before the ceremony day', async () => {
    const c = (await save({ stages: ALL_DONE })).body.committee;
    expect((await act(c.id, { type: 'scheduleCeremony', ceremonyDate: cairoDay(5) })).status).toBe(200);
    const res = await act(c.id, { type: 'completeStage', stage: 'ceremony' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/لم يأتِ بعد/);
    expect((await act(c.id, { type: 'scheduleCeremony', ceremonyDate: cairoDay(0) })).status).toBe(200);
    expect((await act(c.id, { type: 'completeStage', stage: 'ceremony' })).status).toBe(200);
  });

  it('ticking the ceremony task in the calendar records «تم الحفل» on the committee, and back', async () => {
    const c = (await save({ stages: ALL_DONE })).body.committee;
    await act(c.id, { type: 'scheduleCeremony', ceremonyDate: cairoDay(-1) });
    const on = await t.api().patch(`/api/tasks/task-ceremony-${c.id}/toggle`).set(admin.auth).send({ completed: true });
    expect(on.status).toBe(200);
    expect(on.body.task.completed).toBe(true);
    let row = (await t.pool.query('SELECT stages FROM committees WHERE id = $1;', [c.id])).rows[0];
    expect(row.stages.ceremony.completed).toBe(true);
    const off = await t.api().patch(`/api/tasks/task-ceremony-${c.id}/toggle`).set(admin.auth).send({ completed: false });
    expect(off.body.task.completed).toBe(false);
    row = (await t.pool.query('SELECT stages FROM committees WHERE id = $1;', [c.id])).rows[0];
    expect(row.stages.ceremony.completed).toBe(false);
  });

  it('a ceremony task cannot be edited or deleted on its own', async () => {
    const c = (await save({ stages: ALL_DONE })).body.committee;
    await act(c.id, { type: 'scheduleCeremony', ceremonyDate: cairoDay(3) });
    expect((await t.api().delete(`/api/tasks/task-ceremony-${c.id}`).set(admin.auth)).status).toBe(400);
    const edit = await t.api().post('/api/tasks').set(admin.auth).send({ id: `task-ceremony-${c.id}`, title: 'x', date: cairoDay(9), committeeId: c.id });
    expect(edit.status).toBe(400);
    const { rows } = await t.pool.query('SELECT date FROM schedule_tasks WHERE id = $1;', [`task-ceremony-${c.id}`]);
    expect(rows[0].date).toBe(cairoDay(3));
  });

  it('a stage-only change never deletes an older ceremony task that holds the date', async () => {
    const c = (await save({ stages: ALL_DONE })).body.committee;
    await t.pool.query(
      `INSERT INTO schedule_tasks (id, title, date, committee_id, committee_number, type, priority, completed, data, updated_at)
       VALUES ($1,'حفل قديم',$2,$3,$4,'ceremony','high',false,'{}'::jsonb,NOW());`,
      [`task-ceremony-${c.id}`, cairoDay(-2), c.id, c.committeeNumber]
    );
    expect((await act(c.id, { type: 'completeStage', stage: 'ceremony' })).status).toBe(200);
    const { rows } = await t.pool.query('SELECT date, completed FROM schedule_tasks WHERE id = $1;', [`task-ceremony-${c.id}`]);
    expect(rows[0]).toEqual({ date: cairoDay(-2), completed: true });
  });
});

describe('links left behind by deletes', () => {
  it('deleting a committee unassigns it, and the person can still be saved afterwards', async () => {
    const keep = (await save()).body.committee;
    const gone = (await save()).body.committee;
    const u = await createUser(t.pool, { role: 'sheikh', committeeIds: [keep.id, gone.id], name: 'شيخ مرتبط' });
    expect((await t.api().delete(`/api/committees/${gone.id}`).set(admin.auth)).status).toBe(200);
    const { rows } = await t.pool.query('SELECT assigned_committee_ids, assigned_committees FROM app_users WHERE id = $1;', [u.id]);
    expect(rows[0].assigned_committee_ids).toEqual([keep.id]);
    expect(rows[0].assigned_committees).toEqual([keep.committeeNumber]);
    const res = await t.api().post('/api/users').set(admin.auth).send({ id: u.id, name: 'شيخ مرتبط', phone: u.phone });
    expect(res.status).toBe(200);
  });

  it('a person whose stored committee was deleted outside the app can still be saved', async () => {
    const u = await createUser(t.pool, { role: 'sheikh', committeeIds: ['comm-that-is-gone'] });
    const res = await t.api().post('/api/users').set(admin.auth).send({ id: u.id, name: 'شيخ', phone: u.phone });
    expect(res.status).toBe(200);
    expect(res.body.user.assignedCommitteeIds).toEqual([]);
    const bad = await t.api().post('/api/users').set(admin.auth).send({ id: u.id, name: 'شيخ', phone: u.phone, assignedCommitteeIds: ['no-such'] });
    expect(bad.status).toBe(400);
  });

  it('deleting an exam removes it from everyone\'s exam access', async () => {
    await t.api().post('/api/exams').set(admin.auth).send({ id: 'exam-del', title: 'امتحان', book: 'كتاب' });
    const u = await createUser(t.pool, { role: 'committee_head', allExams: false, allowedExamIds: ['exam-del', 'exam-other'] });
    expect((await t.api().delete('/api/exams/exam-del').set(admin.auth)).status).toBe(200);
    const { rows } = await t.pool.query('SELECT allowed_exam_ids FROM app_users WHERE id = $1;', [u.id]);
    expect(rows[0].allowed_exam_ids).toEqual(['exam-other']);
  });

  it('deleting a person removes them from ceremony guest lists', async () => {
    const c = (await save({ stages: ALL_DONE })).body.committee;
    const guest = await createUser(t.pool, { role: 'sheikh', name: 'ضيف' });
    expect((await t.api().post(`/api/committees/${c.id}/ceremony-attendees`).set(admin.auth).send({ add: [guest.id] })).status).toBe(200);
    expect((await t.api().delete(`/api/users/${guest.id}`).set(admin.auth)).status).toBe(200);
    const { rows } = await t.pool.query('SELECT ceremony_details FROM committees WHERE id = $1;', [c.id]);
    expect(rows[0].ceremony_details.attendees).toEqual([]);
  });
});

describe('other rules', () => {
  it('a task cannot be assigned to an account that is not approved', async () => {
    const pending = await createUser(t.pool, { role: 'sheikh', status: 'pending' });
    const res = await t.api().post('/api/tasks').set(admin.auth).send({ id: 'task-pending', title: 'مهمة', date: cairoDay(1), assignedAssistantId: pending.id });
    expect(res.status).toBe(400);
  });

  it('a course cannot end before it starts', async () => {
    const res = await t.api().post('/api/courses').set(admin.auth).send({ id: 'crs-bad', name: 'دورة', startDate: '2026-08-10', endDate: '2026-08-01' });
    expect(res.status).toBe(400);
  });
});
