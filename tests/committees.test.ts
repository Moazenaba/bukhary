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

async function createCommittee(overrides: Record<string, unknown> = {}) {
  const body = committeeBody(overrides);
  const res = await t.api().post('/api/committees').set(admin.auth).send(body);
  expect(res.status).toBe(200);
  return res.body.committee;
}

describe('committee writes', () => {
  it('stores only known fields and derives the course name from the course table', async () => {
    const body = { ...committeeBody({ committeeNumber: 1 }), courseName: 'مزيف', evil: '<script>', role: 'super_admin' };
    const res = await t.api().post('/api/committees').set(admin.auth).send(body);
    expect(res.status).toBe(200);
    const { rows } = await t.pool.query('SELECT course_name, data FROM committees WHERE id = $1;', [body.id]);
    expect(rows[0].course_name).toBe('دورة الاختبار');
    expect(rows[0].data).toEqual({});
    const list = await t.api().get('/api/committees').set(admin.auth);
    const c = list.body.committees.find((x: any) => x.id === body.id);
    expect(c.evil).toBeUndefined();
  });

  it('rejects an unknown course and invalid input with 400', async () => {
    const unknown = await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: 2, courseId: 'nope' }));
    expect(unknown.status).toBe(400);
    const invalid = await t.api().post('/api/committees').set(admin.auth).send({ id: 'x', committeeNumber: -1 });
    expect(invalid.status).toBe(400);
  });

  it('rejects a duplicate committee number in the same course', async () => {
    await createCommittee({ committeeNumber: 3 });
    const dup = await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: 3 }));
    expect(dup.status).toBe(409);
  });

  it('bulk save is all-or-nothing', async () => {
    const good = committeeBody({ committeeNumber: 50 });
    const bad = committeeBody({ committeeNumber: 51, courseId: 'missing-course' });
    const res = await t.api().post('/api/committees/bulk').set(admin.auth).send({ committees: [good, bad] });
    expect(res.status).toBe(400);
    const { rows } = await t.pool.query('SELECT 1 FROM committees WHERE id = $1;', [good.id]);
    expect(rows).toHaveLength(0);
  });
});

describe('stage updates', () => {
  it('merges stages per key so parallel updates do not overwrite each other', async () => {
    const c = await createCommittee({ committeeNumber: 10 });
    const [a, b] = await Promise.all([
      t.api().patch(`/api/committees/${c.id}`).set(admin.auth).send({ stages: { registration: { completed: true } } }),
      t.api().patch(`/api/committees/${c.id}`).set(admin.auth).send({ stages: { exam: { completed: true } } }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const { rows } = await t.pool.query('SELECT stages FROM committees WHERE id = $1;', [c.id]);
    expect(rows[0].stages.registration.completed).toBe(true);
    expect(rows[0].stages.exam.completed).toBe(true);
  });

  it('returns 409 when the client edits a stale version', async () => {
    const c = await createCommittee({ committeeNumber: 11 });
    await t.api().patch(`/api/committees/${c.id}`).set(admin.auth).send({ stages: { exam: { completed: true } } });
    const stale = await t.api().patch(`/api/committees/${c.id}`).set(admin.auth)
      .send({ stages: { scoring: { completed: true } }, expectedUpdatedAt: c.updatedAt });
    expect(stale.status).toBe(409);
  });

  it('stamps reception and approval with the logged-in user, ignoring names sent by the client', async () => {
    const c = await createCommittee({ committeeNumber: 12 });
    const asst = await userWithToken(t, { role: 'committee_head', assigned: [12], name: 'المعاون الحقيقي' });
    const res = await t.api().patch(`/api/committees/${c.id}`).set(asst.auth)
      .send({ receivedByAssistant: { assistantName: 'شخص آخر', notes: 'تم' }, stages: { registration: { completed: true } } });
    expect(res.status).toBe(200);
    expect(res.body.committee.receivedByAssistant.assistantName).toBe('المعاون الحقيقي');
    expect(res.body.committee.receivedByAssistant.assistantId).toBe(asst.id);
  });

  it('writes an audit log row in the same transaction', async () => {
    const c = await createCommittee({ committeeNumber: 13 });
    await t.api().patch(`/api/committees/${c.id}`).set(admin.auth).send({ stages: { sheet: { completed: true } } });
    const { rows } = await t.pool.query("SELECT actor_id, action FROM audit_logs WHERE entity = 'committee' AND entity_id = $1 ORDER BY created_at;", [c.id]);
    expect(rows.map((r) => r.action)).toEqual(['committee.create', 'committee.patch']);
    expect(rows[1].actor_id).toBe(admin.id);
  });
});

describe('authorization', () => {
  it('sheikhs see their committees but change nothing, not even on their own committee', async () => {
    const mine = await createCommittee({ committeeNumber: 20 });
    const sheikh = await userWithToken(t, { role: 'sheikh', assigned: [20], permissions: ['manage_committees'] });
    const ok = await t.api().get(`/api/committees/${mine.id}`).set(sheikh.auth);
    expect(ok.status).toBe(200);
    expect(ok.body.committee.studentsCount).toBe(10);
    const reception = await t.api().patch(`/api/committees/${mine.id}`).set(sheikh.auth).send({ stages: { exam: { completed: true } } });
    expect(reception.status).toBe(403);
    const finalize = await t.api().patch(`/api/committees/${mine.id}`).set(sheikh.auth).send({ stages: { ceremony: { completed: true } } });
    expect(finalize.status).toBe(403);
    const fullEdit = await t.api().post('/api/committees').set(sheikh.auth).send(committeeBody({ id: mine.id, committeeNumber: 20 }));
    expect(fullEdit.status).toBe(403);
    const create = await t.api().post('/api/committees').set(sheikh.auth).send(committeeBody({ committeeNumber: 22 }));
    expect(create.status).toBe(403);
  });

  it('committee heads manage only their assigned committees', async () => {
    const mine = await createCommittee({ committeeNumber: 30 });
    const other = await createCommittee({ committeeNumber: 31 });
    const head = await userWithToken(t, { role: 'committee_head', permissions: ['manage_committees'], assigned: [30] });
    const ok = await t.api().patch(`/api/committees/${mine.id}`).set(head.auth).send({ stages: { registration: { completed: true } } });
    expect(ok.status).toBe(200);
    // The accreditation (and so the ceremony after it) is the admin's step.
    const accredit = await t.api().patch(`/api/committees/${mine.id}`).set(head.auth).send({ stages: { ceremony: { completed: true } } });
    expect(accredit.status).toBe(403);
    const del = await t.api().delete(`/api/committees/${other.id}`).set(head.auth);
    expect(del.status).toBe(403);
  });

  it('sheikhs write nothing anywhere, whatever permissions they hold', async () => {
    const c = await createCommittee({ committeeNumber: 40 });
    const sheikh = await userWithToken(t, { role: 'sheikh', permissions: ['manage_committees', 'calendar_schedule', 'database_sheets'] });
    expect((await t.api().get('/api/committees').set(sheikh.auth)).status).toBe(200);
    expect((await t.api().patch(`/api/committees/${c.id}`).set(sheikh.auth).send({ stages: { exam: { completed: true } } })).status).toBe(403);
    expect((await t.api().post('/api/tasks').set(sheikh.auth).send({ id: 't1', title: 'x', date: '2026-10-01' })).status).toBe(403);
    expect((await t.api().post('/api/summer-course-rows').set(sheikh.auth).send({ id: 'r1', number: 1 })).status).toBe(403);
    expect((await t.api().get('/api/audit-logs').set(sheikh.auth)).status).toBe(403);
    expect((await t.api().get('/api/users').set(sheikh.auth)).status).toBe(403);
    expect((await t.api().get('/api/exams').set(sheikh.auth)).status).toBe(403);
  });

  it('committee heads score only their committees; sheikhs never score', async () => {
    const c = await createCommittee({ committeeNumber: 61 });
    const scoped = await userWithToken(t, { role: 'committee_head', name: 'رئيس' });
    const denied = await t.api().post('/api/scoring').set(scoped.auth)
      .send({ id: 's0', committeeId: c.id, studentName: 'طالب', questionNumber: 1, score: 8, maxScore: 10 });
    expect(denied.status).toBe(403);
    const sheikh = await userWithToken(t, { role: 'sheikh', committeeIds: [c.id] });
    const notSheikh = await t.api().post('/api/scoring').set(sheikh.auth)
      .send({ id: 's0', committeeId: c.id, studentName: 'طالب', questionNumber: 1, score: 8, maxScore: 10 });
    expect(notSheikh.status).toBe(403);
    const assigned = await userWithToken(t, { role: 'committee_head', committeeIds: [c.id] });
    const ok = await t.api().post('/api/scoring').set(assigned.auth)
      .send({ id: 's0', committeeId: c.id, studentName: 'طالب', questionNumber: 1, score: 8, maxScore: 10 });
    expect(ok.status).toBe(200);
  });

  it('heads with all committees record scores, scorer name comes from the token', async () => {
    const c = await createCommittee({ committeeNumber: 60 });
    const teacher = await userWithToken(t, { role: 'committee_head', name: 'المعلم', allCommittees: true });
    const res = await t.api().post('/api/scoring').set(teacher.auth)
      .send({ id: 's1', committeeId: c.id, studentName: 'طالب', questionNumber: 1, score: 8, maxScore: 10 });
    expect(res.status).toBe(200);
    expect(res.body.record.scorerName).toBe('المعلم');
    const over = await t.api().post('/api/scoring').set(teacher.auth)
      .send({ id: 's2', committeeId: c.id, studentName: 'طالب', questionNumber: 1, score: 11, maxScore: 10 });
    expect(over.status).toBe(400);
  });

  it('/api/auth/me returns the same evaluated permissions the server enforces', async () => {
    const a = await createCommittee({ committeeNumber: 81 });
    const b = await createCommittee({ committeeNumber: 82 });
    const asst = await userWithToken(t, { role: 'sheikh', committeeIds: [a.id, b.id] });
    const me = await t.api().get('/api/auth/me').set(asst.auth);
    expect(me.status).toBe(200);
    expect(me.body.permissions.actions['committees.read']).toBe(true);
    expect(me.body.permissions.actions['committees.reception']).toBe(false);
    expect(me.body.permissions.actions['committees.create']).toBe(false);
    expect(me.body.permissions.grantableRoles).toEqual(['sheikh']);
    expect([...me.body.permissions.committeeScope].sort()).toEqual([a.id, b.id].sort());
    expect(me.body.permissions.committeeNumbers).toEqual([81, 82]);
  });
});

describe('conflict protection', () => {
  it('rejects a full save based on an outdated version (409) and keeps the newer data', async () => {
    const c = await createCommittee({ committeeNumber: 70, sheikhPhone: '0500000001' });
    const newer = await t.api().patch(`/api/committees/${c.id}`).set(admin.auth).send({ stages: { exam: { completed: true } } });
    expect(newer.status).toBe(200);
    const stale = await t.api().post('/api/committees').set(admin.auth)
      .send({ ...committeeBody({ id: c.id, committeeNumber: 70, sheikhPhone: '0599999999' }), expectedUpdatedAt: c.updatedAt });
    expect(stale.status).toBe(409);
    const { rows } = await t.pool.query('SELECT sheikh_phone, stages FROM committees WHERE id = $1;', [c.id]);
    expect(rows[0].sheikh_phone).toBe('0500000001');
    expect(rows[0].stages.exam.completed).toBe(true);
  });

  it('a save with the current version succeeds', async () => {
    const c = await createCommittee({ committeeNumber: 71 });
    const ok = await t.api().post('/api/committees').set(admin.auth)
      .send({ ...committeeBody({ id: c.id, committeeNumber: 71, sheikhPhone: '0511111111' }), expectedUpdatedAt: c.updatedAt });
    expect(ok.status).toBe(200);
  });

  it('a committee must belong to a course', async () => {
    const res = await t.api().post('/api/committees').set(admin.auth).send({ ...committeeBody({ committeeNumber: 72 }), courseId: '' });
    expect(res.status).toBe(400);
  });

  it('the same committee number cannot repeat in a course, even one without a course', async () => {
    await t.pool.query("INSERT INTO committees (id, committee_number, committee_name, course_id) VALUES ('nc-1', 80, 'a', NULL);");
    await expect(t.pool.query("INSERT INTO committees (id, committee_number, committee_name, course_id) VALUES ('nc-2', 80, 'b', NULL);")).rejects.toThrow();
  });
});
