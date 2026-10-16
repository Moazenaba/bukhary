import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertLocalDatabaseOrConfirmed } from '../server/scriptGuard.ts';
import { applyCommitteeAction } from '../server/workflow.ts';
import { committeeBody, seedCourse, setupApp, userWithToken, type TestApp } from './helpers.ts';

// Committee workflow (API-10, MOB-07, WEB-08, API-11), tasks (API-12, WEB-07, MOB-06),
// idempotent writes (MOB-04), sheet rows (API-12), database lock (API-15), script guard (API-24).

let t: TestApp;
let admin: Awaited<ReturnType<typeof userWithToken>>;
const committee = async (overrides: Record<string, unknown> = {}) => {
  const res = await t.api().post('/api/committees').set(admin.auth).send(committeeBody(overrides));
  expect(res.status).toBe(200);
  return res.body.committee as any;
};
const act = (id: string, auth: Record<string, string>, action: object, extra: object = {}) =>
  t.api().post(`/api/committees/${id}/actions`).set(auth).send({ action, ...extra });

beforeAll(async () => {
  t = await setupApp();
  await seedCourse(t.pool);
  admin = await userWithToken(t, { role: 'super_admin' });
});
afterAll(async () => {
  await t.pool.end();
});

describe('workflow rules (pure)', () => {
  const empty = { stages: {}, receivedByAssistant: null, examApprovedBy: null, scoringDetails: {}, aggregationDetails: {}, ceremonyDetails: {} };
  const actor = { id: 'u1', name: 'أحمد' };

  it('stages complete in order with server time and actor', () => {
    expect(() => applyCommitteeAction(empty, { type: 'completeStage', stage: 'exam' }, actor, 'T')).toThrow(/السابقة/);
    const s = applyCommitteeAction(empty, { type: 'completeStage', stage: 'registration' }, actor, '2026-10-16T10:00:00.000Z');
    expect(s.stages.registration).toMatchObject({ completed: true, completedAt: '2026-10-16T10:00:00.000Z', completedBy: 'أحمد' });
  });

  it('a stage cannot be reopened while a later one is complete', () => {
    let s = applyCommitteeAction(empty, { type: 'completeStage', stage: 'registration' }, actor, 'T');
    s = applyCommitteeAction(s, { type: 'completeStage', stage: 'exam' }, actor, 'T');
    expect(() => applyCommitteeAction(s, { type: 'reopenStage', stage: 'registration' }, actor, 'T')).toThrow();
    expect(applyCommitteeAction(s, { type: 'reopenStage', stage: 'exam' }, actor, 'T').stages.exam.completed).toBe(false);
  });

  it('reception records who received, and does not complete any stage (D-03)', () => {
    const s = applyCommitteeAction(empty, { type: 'receive', status: 'received' }, actor, 'T');
    expect(s.receivedByAssistant).toMatchObject({ assistantId: 'u1', assistantName: 'أحمد', receivedAt: 'T' });
    expect(Object.values(s.stages).every((x: any) => !x.completed)).toBe(true);
  });
});

describe('committee actions endpoint', () => {
  it('web and Android reception give the same state', async () => {
    const a = await committee({ committeeNumber: 1 });
    const b = await committee({ committeeNumber: 2 });
    const asst = await userWithToken(t, { role: 'assistant', committeeIds: [a.id, b.id] });
    const ra = await act(a.id, asst.auth, { type: 'receive', notes: 'web' });
    const rb = await act(b.id, asst.auth, { type: 'receive', notes: 'android' });
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);
    expect(ra.body.committee.stages).toEqual(rb.body.committee.stages);
    expect(ra.body.committee.receivedByAssistant.assistantId).toBe(asst.id);
  });

  it('out-of-order stage completion is a 400; permissions and scope still apply', async () => {
    const c = await committee({ committeeNumber: 3 });
    expect((await act(c.id, admin.auth, { type: 'completeStage', stage: 'scoring' })).status).toBe(400);
    const outsider = await userWithToken(t, { role: 'assistant' });
    expect((await act(c.id, outsider.auth, { type: 'completeStage', stage: 'registration' })).status).toBe(403);
    const asst = await userWithToken(t, { role: 'assistant', committeeIds: [c.id] });
    expect((await act(c.id, asst.auth, { type: 'completeStage', stage: 'registration' })).status).toBe(200);
    expect((await act(c.id, asst.auth, { type: 'completeStage', stage: 'exam' })).status).toBe(200);
    expect((await act(c.id, asst.auth, { type: 'completeStage', stage: 'scoring' })).status).toBe(403);
  });

  it('scheduling a ceremony keeps exactly one calendar task, and moving it updates that task (WEB-08)', async () => {
    const c = await committee({ committeeNumber: 4 });
    expect((await act(c.id, admin.auth, { type: 'scheduleCeremony', ceremonyDate: '2026-11-01', ceremonyTime: '19:00' })).status).toBe(200);
    expect((await act(c.id, admin.auth, { type: 'scheduleCeremony', ceremonyDate: '2026-11-03' })).status).toBe(200);
    const { rows } = await t.pool.query("SELECT id, date FROM schedule_tasks WHERE committee_id = $1 AND type = 'ceremony';", [c.id]);
    expect(rows).toEqual([{ id: `task-ceremony-${c.id}`, date: '2026-11-03' }]);
    expect((await act(c.id, admin.auth, { type: 'scheduleCeremony', ceremonyDate: null })).status).toBe(200);
    const after = await t.pool.query("SELECT 1 FROM schedule_tasks WHERE committee_id = $1 AND type = 'ceremony';", [c.id]);
    expect(after.rows).toHaveLength(0);
  });

  it('an impossible ceremony date is a 400 (API-18)', async () => {
    const c = await committee({ committeeNumber: 5 });
    expect((await act(c.id, admin.auth, { type: 'scheduleCeremony', ceremonyDate: '2026-02-30' })).status).toBe(400);
  });

  it('two scorers editing different questions keep each other\'s edits (API-11)', async () => {
    const c = await committee({
      committeeNumber: 6,
      scoringDetails: { questions: [1, 2].map((n) => ({ id: `q-${n}`, questionNumber: n, label: `س${n}`, completed: false })) },
    });
    const [x, y] = await Promise.all([
      act(c.id, admin.auth, { type: 'updateQuestion', questionId: 'q-1', completed: true }),
      act(c.id, admin.auth, { type: 'updateQuestion', questionId: 'q-2', completed: true }),
    ]);
    expect([x.status, y.status]).toEqual([200, 200]);
    const { rows } = await t.pool.query('SELECT scoring_details FROM committees WHERE id = $1;', [c.id]);
    expect(rows[0].scoring_details.questions.map((q: any) => q.completed)).toEqual([true, true]);
  });

  it('replacing a whole scoring document without a version is refused (API-11)', async () => {
    const c = await committee({ committeeNumber: 7 });
    const res = await t.api().patch(`/api/committees/${c.id}`).set(admin.auth).send({ scoringDetails: { questions: [] } });
    expect(res.status).toBe(409);
    const ok = await t.api().patch(`/api/committees/${c.id}`).set(admin.auth).send({ scoringDetails: { questions: [] }, expectedUpdatedAt: c.updatedAt });
    expect(ok.status).toBe(200);
  });

  it('legacy stage PATCH gets server timestamps, not the client text (WEB-18, MOB-15)', async () => {
    const c = await committee({ committeeNumber: 8 });
    const res = await t.api().patch(`/api/committees/${c.id}`).set(admin.auth)
      .send({ stages: { registration: { completed: true, completedAt: '2026/10/16 - 08:30 ص' } } });
    expect(res.status).toBe(200);
    expect(Number.isNaN(Date.parse(res.body.committee.stages.registration.completedAt))).toBe(false);
  });

  it('renumbering a committee updates the numbers stored on its tasks', async () => {
    const c = await committee({ committeeNumber: 9 });
    await t.api().post('/api/tasks').set(admin.auth).send({ id: 'task-renumber', title: 'x', date: '2026-10-20', committeeId: c.id });
    const res = await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ id: c.id, committeeNumber: 109, expectedUpdatedAt: c.updatedAt }));
    expect(res.status).toBe(200);
    const { rows } = await t.pool.query("SELECT committee_number FROM schedule_tasks WHERE id = 'task-renumber';");
    expect(rows[0].committee_number).toBe(109);
  });
});

describe('tasks (API-12, WEB-07, MOB-06)', () => {
  it('a task keeps its committee and assignee, and the assignee can toggle it', async () => {
    const c = await committee({ committeeNumber: 20 });
    const asst = await userWithToken(t, { role: 'assistant', committeeIds: [c.id] });
    const res = await t.api().post('/api/tasks').set(admin.auth)
      .send({ id: 'task-assigned', title: 'تسليم', date: '2026-10-21', committeeId: c.id, assignedAssistantId: asst.id });
    expect(res.status).toBe(200);
    expect(res.body.task).toMatchObject({ committeeNumber: 20, assignedAssistantId: asst.id });
    expect((await t.api().patch('/api/tasks/task-assigned/toggle').set(asst.auth).send({ completed: true })).status).toBe(200);
    const notes = await t.api().get('/api/notifications').set(asst.auth);
    expect(notes.body.notifications.some((n: any) => n.title.includes('مهمة'))).toBe(true);
  });

  it('scoped staff cannot write tasks of another committee or overwrite them by id', async () => {
    const mine = await committee({ committeeNumber: 21 });
    const theirs = await committee({ committeeNumber: 22 });
    await t.api().post('/api/tasks').set(admin.auth).send({ id: 'task-theirs', title: 'لهم', date: '2026-10-21', committeeId: theirs.id });
    const asst = await userWithToken(t, { role: 'assistant', permissions: ['calendar_schedule'], committeeIds: [mine.id] });
    expect((await t.api().post('/api/tasks').set(asst.auth).send({ id: 'task-new', title: 'x', date: '2026-10-21', committeeId: theirs.id })).status).toBe(403);
    expect((await t.api().post('/api/tasks').set(asst.auth).send({ id: 'task-theirs', title: 'استيلاء', date: '2026-10-21', committeeId: mine.id })).status).toBe(403);
    expect((await t.api().post('/api/tasks').set(asst.auth).send({ id: 'task-mine', title: 'لي', date: '2026-10-21', committeeId: mine.id })).status).toBe(200);
  });
});

describe('idempotent writes (MOB-04)', () => {
  it('the same request with the same key is applied once', async () => {
    const c = await committee({ committeeNumber: 30 });
    const send = () => t.api().post(`/api/committees/${c.id}/actions`).set(admin.auth).set('Idempotency-Key', 'op-12345678-abc')
      .send({ action: { type: 'completeStage', stage: 'registration' } });
    const first = await send();
    const second = await send();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers['idempotent-replay']).toBe('true');
    const { rows } = await t.pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE entity_id = $1 AND action = 'committee.completeStage';", [c.id]);
    expect(rows[0].n).toBe(1);
  });

  it('a key reused for a different request is rejected', async () => {
    const c = await committee({ committeeNumber: 31 });
    await t.api().post(`/api/committees/${c.id}/actions`).set(admin.auth).set('Idempotency-Key', 'op-reuse-0001').send({ action: { type: 'receive' } });
    const other = await t.api().delete(`/api/committees/${c.id}`).set(admin.auth).set('Idempotency-Key', 'op-reuse-0001');
    expect(other.status).toBe(400);
  });
});

describe('course-sheet rows (API-12)', () => {
  it('only a super admin may replace a whole sheet', async () => {
    const head = await userWithToken(t, { role: 'committee_head', permissions: ['database_sheets'] });
    const res = await t.api().post('/api/summer-course-rows/bulk').set(head.auth).send({ rows: [], replaceCourseId: 'course-1' });
    expect(res.status).toBe(403);
    expect((await t.api().post('/api/summer-course-rows/bulk').set(admin.auth).send({ rows: [], replaceCourseId: 'course-1' })).status).toBe(200);
  });

  it('deleting a course that has sheet rows needs confirmation (API-27)', async () => {
    await seedCourse(t.pool, 'course-del', 'للحذف');
    await t.api().post('/api/summer-course-rows').set(admin.auth).send({ id: 'row-del', number: 1, courseId: 'course-del' });
    expect((await t.api().delete('/api/courses/course-del').set(admin.auth)).status).toBe(409);
    expect((await t.api().delete('/api/courses/course-del?deleteSheetRows=true').set(admin.auth)).status).toBe(200);
  });
});

describe('database lock (API-15)', () => {
  it('every table in public has row-level security enabled', async () => {
    const { rows } = await t.pool.query(
      "SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND NOT relrowsecurity;"
    );
    expect(rows).toEqual([]);
  });

  it('a non-owner role sees no rows even when it has table privileges', async () => {
    await t.pool.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon_probe') THEN CREATE ROLE anon_probe; END IF; END $$;");
    await t.pool.query('GRANT USAGE ON SCHEMA public TO anon_probe; GRANT SELECT ON app_users TO anon_probe;');
    const client = await t.pool.connect();
    try {
      await client.query('BEGIN; SET LOCAL ROLE anon_probe;');
      const { rows } = await client.query('SELECT count(*)::int AS n FROM app_users;');
      expect(rows[0].n).toBe(0);
    } finally {
      await client.query('ROLLBACK;');
      client.release();
    }
    const { rows } = await t.pool.query('SELECT count(*)::int AS n FROM app_users;');
    expect(rows[0].n).toBeGreaterThan(0);
  });
});

describe('script guard (API-24)', () => {
  it('developer scripts refuse a remote database unless --remote is given', () => {
    expect(() => assertLocalDatabaseOrConfirmed('postgresql://u:p@localhost:5432/db', [])).not.toThrow();
    expect(() => assertLocalDatabaseOrConfirmed('postgresql://u:p@db.pooler.supabase.com:5432/postgres', [])).toThrow(/--remote/);
    expect(() => assertLocalDatabaseOrConfirmed('postgresql://u:p@db.pooler.supabase.com:5432/postgres', ['--remote'])).not.toThrow();
  });
});
