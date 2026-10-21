import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committeeBody, seedCourse, setupApp, userWithToken, type TestApp } from './helpers.ts';

// Regression tests for the authorization fixes: API-01, API-05, API-06, API-07, API-08, API-34, NEW-01/02.

let t: TestApp;
let admin: Awaited<ReturnType<typeof userWithToken>>;
const committee = async (overrides: Record<string, unknown> = {}) => {
  const res = await t.api().post('/api/committees').set(admin.auth).send(committeeBody(overrides));
  expect(res.status).toBe(200);
  return res.body.committee as { id: string; committeeNumber: number; updatedAt: string };
};
const userBody = (u: { id: string; phone: string }, extra: Record<string, unknown> = {}) => ({ id: u.id, name: 'اسم', phone: u.phone, ...extra });

let c1: { id: string }, c2: { id: string }, c3: { id: string };
beforeAll(async () => {
  t = await setupApp();
  await seedCourse(t.pool);
  await seedCourse(t.pool, 'course-2', 'دورة ثانية');
  admin = await userWithToken(t, { role: 'super_admin' });
  c1 = await committee({ committeeNumber: 1 });
  c2 = await committee({ committeeNumber: 2 });
  c3 = await committee({ committeeNumber: 3 });
});
afterAll(async () => {
  await t.pool.end();
});

describe('user management by committee heads (API-01)', () => {
  const head = () => userWithToken(t, { role: 'committee_head', permissions: ['manage_assistants', 'manage_committees'], committeeIds: [c1.id] });

  it('a head cannot assign committees to themself', async () => {
    const h = await head();
    const res = await t.api().post('/api/users').set(h.auth).send(userBody(h, { assignedCommitteeIds: [c1.id, c2.id, c3.id] }));
    expect(res.status).toBe(403);
    const legacy = await t.api().post('/api/users').set(h.auth).send(userBody(h, { assignedCommittees: [1, 2, 3] }));
    expect(legacy.status).toBe(403);
    const patch = await t.api().patch(`/api/committees/${c3.id}`).set(h.auth).send({ stages: { sheet: { completed: true } } });
    expect(patch.status).toBe(403);
  });

  it('a head cannot give access flags to themself', async () => {
    const h = await userWithToken(t, { role: 'committee_head', permissions: ['manage_assistants'], committeeIds: [c1.id], allExams: false });
    for (const extra of [{ allCommitteesAllowed: true }, { allExamsAllowed: true }, { allowedExamIds: ['x'] }]) {
      const res = await t.api().post('/api/users').set(h.auth).send(userBody(h, extra));
      expect(res.status).toBe(403);
    }
    const { rows } = await t.pool.query('SELECT all_committees, allowed_exam_ids FROM app_users WHERE id = $1;', [h.id]);
    expect(rows[0]).toEqual({ all_committees: false, allowed_exam_ids: [] });
  });

  it('a head assigns only committees inside their own scope, and only to sheikhs', async () => {
    const h = await head();
    const ok = await t.api().post('/api/users').set(h.auth)
      .send({ id: 'usr_asst_in', name: 'معاون', phone: '0512000001', password: 'Initial123', status: 'approved', assignedCommitteeIds: [c1.id] });
    expect(ok.status).toBe(200);
    const outside = await t.api().post('/api/users').set(h.auth)
      .send({ id: 'usr_asst_out', name: 'معاون', phone: '0512000002', password: 'Initial123', status: 'approved', assignedCommitteeIds: [c2.id] });
    expect(outside.status).toBe(403);
    const otherHead = await userWithToken(t, { role: 'committee_head', permissions: ['manage_committees'] });
    const editHead = await t.api().post('/api/users').set(h.auth).send(userBody(otherHead, { status: 'rejected' }));
    expect(editHead.status).toBe(403);
    const sheikh = await userWithToken(t, { role: 'sheikh' });
    const promote = await t.api().post('/api/users').set(h.auth).send(userBody(sheikh, { role: 'committee_head' }));
    expect(promote.status).toBe(403);
    const superAdmin = await userWithToken(t, { role: 'super_admin' });
    const editSuper = await t.api().post('/api/users').set(h.auth).send(userBody(superAdmin, { name: 'تغيير' }));
    expect(editSuper.status).toBe(404);
  });

  it('a head can still approve a sheikh applicant without touching permissions (WEB-05)', async () => {
    const h = await head();
    const applicant = await userWithToken(t, { role: 'sheikh', status: 'approved' });
    await t.pool.query("UPDATE app_users SET status = 'pending' WHERE id = $1;", [applicant.id]);
    const res = await t.api().post('/api/users').set(h.auth).send(userBody(applicant, { status: 'approved', assignedCommitteeIds: [c1.id] }));
    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe('approved');
    expect(res.body.user.permissions).toEqual([]);
  });

  it('nobody changes their own access, super admins included', async () => {
    const other = await userWithToken(t, { role: 'super_admin' });
    const res = await t.api().post('/api/users').set(other.auth).send(userBody(other, { permissions: ['exams_pdf'] }));
    expect(res.status).toBe(403);
  });
});

describe('committee scope (API-07, NEW-01, API-05)', () => {
  it('"all committees" gives every committee, in every course', async () => {
    const other = await committee({ committeeNumber: 1, courseId: 'course-2' });
    const h = await userWithToken(t, { role: 'committee_head', permissions: ['manage_committees'], allCommittees: true });
    for (const c of [c2, other]) {
      const res = await t.api().patch(`/api/committees/${c.id}`).set(h.auth).send({ stages: { registration: { completed: true } } });
      expect(res.status).toBe(200);
    }
    const me = await t.api().get('/api/auth/me').set(h.auth);
    expect(me.body.permissions.committeeScope).toBe('all');
  });

  it('an empty list means no committees, not all', async () => {
    const h = await userWithToken(t, { role: 'committee_head', permissions: ['manage_committees'] });
    const res = await t.api().patch(`/api/committees/${c2.id}`).set(h.auth).send({ stages: { registration: { completed: true } } });
    expect(res.status).toBe(403);
  });

  it('the same committee number in another course is out of scope', async () => {
    const mine = await committee({ committeeNumber: 91 });
    const other = await committee({ committeeNumber: 91, courseId: 'course-2' });
    const h = await userWithToken(t, { role: 'committee_head', permissions: ['manage_committees'], committeeIds: [mine.id] });
    expect((await t.api().patch(`/api/committees/${mine.id}`).set(h.auth).send({ stages: { registration: { completed: true } } })).status).toBe(200);
    const res = await t.api().patch(`/api/committees/${other.id}`).set(h.auth).send({ stages: { registration: { completed: true } } });
    expect(res.status).toBe(403);
  });

  it('only a super admin grants "all committees"; applying a profile copies its settings', async () => {
    await t.api().post('/api/permission-profiles').set(admin.auth).send({
      id: 'prof-all', name: 'كل اللجان', allCommitteesAllowed: true, permissions: ['manage_committees', 'unknown_perm'],
    });
    const h = await userWithToken(t, { role: 'committee_head' });
    const res = await t.api().post('/api/users').set(admin.auth).send(userBody(h, { profileId: 'prof-all' }));
    expect(res.status).toBe(200);
    expect(res.body.user.allCommitteesAllowed).toBe(true);
    expect(res.body.user.permissions).toEqual(['manage_committees']);
    expect(res.body.user.profileId).toBe('prof-all');
  });

  it('a scoped head who creates a committee gets it in scope', async () => {
    const h = await userWithToken(t, { role: 'committee_head', permissions: ['add_new_committee', 'manage_committees'] });
    const body = committeeBody({ committeeNumber: 44 });
    expect((await t.api().post('/api/committees').set(h.auth).send(body)).status).toBe(200);
    const res = await t.api().patch(`/api/committees/${body.id}`).set(h.auth).send({ stages: { registration: { completed: true } } });
    expect(res.status).toBe(200);
  });
});

describe('permission ids (API-34) and directory (API-08)', () => {
  it('unknown permission strings are dropped', async () => {
    const u = await userWithToken(t, { role: 'committee_head' });
    const res = await t.api().post('/api/users').set(admin.auth).send(userBody(u, { permissions: ['exams_pdf', 'تصحيح امتحان التوحيد'] }));
    expect(res.status).toBe(200);
    expect(res.body.user.permissions).toEqual(['exams_pdf']);
  });

  it('heads see the sheikhs they can staff committees with, not other heads or admins', async () => {
    const h = await userWithToken(t, { role: 'committee_head', committeeIds: [c1.id] });
    const mine = await userWithToken(t, { role: 'sheikh', committeeIds: [c1.id] });
    const free = await userWithToken(t, { role: 'sheikh', committeeIds: [c2.id] });
    const otherHead = await userWithToken(t, { role: 'committee_head' });
    const anAdmin = await userWithToken(t, { role: 'admin' });
    const list = await t.api().get('/api/users').set(h.auth);
    const ids = list.body.users.map((u: any) => u.id);
    expect(ids).toEqual(expect.arrayContaining([mine.id, free.id, h.id]));
    expect(ids).not.toContain(otherHead.id);
    expect(ids).not.toContain(anAdmin.id);
    expect(ids).not.toContain(admin.id);
  });

  it('never stores or returns an ID or passport number', async () => {
    const res = await t.api().post('/api/auth/register')
      .send({ name: 'متقدم', phone: `011${String(Date.now() % 100_000_000).padStart(8, '0')}`, password: 'Passw0rd-123', nationalId: '2990101', passportNumber: 'P-1' });
    expect(res.status).toBe(201);
    const { rows } = await t.pool.query('SELECT passport_number, data FROM app_users WHERE request_code = $1;', [res.body.requestCode]);
    expect(rows[0].passport_number).toBeNull();
    expect(rows[0].data.nationalId).toBeUndefined();
    const list = await t.api().get('/api/users').set(admin.auth);
    expect(JSON.stringify(list.body)).not.toMatch(/nationalId|passportNumber/);
  });

  it('a save that leaves fields out keeps their stored values (found by the contract test)', async () => {
    const u = await userWithToken(t, { role: 'sheikh', committeeIds: [c1.id] });
    await t.pool.query(
      `UPDATE app_users SET notes = 'ملاحظة', email = 'a@b.co',
         data = '{"whatsapp":"0599","interviewNotes":"جيد"}'::jsonb WHERE id = $1;`,
      [u.id]
    );
    const res = await t.api().post('/api/users').set(admin.auth).send({ id: u.id, name: 'اسم جديد', phone: u.phone });
    expect(res.status).toBe(200);
    const { rows } = await t.pool.query('SELECT name, notes, email, data FROM app_users WHERE id = $1;', [u.id]);
    expect(rows[0]).toMatchObject({ name: 'اسم جديد', notes: 'ملاحظة', email: 'a@b.co' });
    expect(rows[0].data).toMatchObject({ whatsapp: '0599', interviewNotes: 'جيد' });
  });

  it('task assignee list is limited to the actor\'s committees (D-07)', async () => {
    const asst = await userWithToken(t, { role: 'committee_head', committeeIds: [c1.id] });
    const colleague = await userWithToken(t, { role: 'sheikh', committeeIds: [c1.id], name: 'زميل' });
    const stranger = await userWithToken(t, { role: 'sheikh', committeeIds: [c3.id], name: 'غريب' });
    const res = await t.api().get('/api/users/assignable').set(asst.auth);
    expect(res.status).toBe(200);
    const ids = res.body.users.map((u: any) => u.id);
    expect(ids).toEqual(expect.arrayContaining([asst.id, colleague.id]));
    expect(ids).not.toContain(stranger.id);
    expect(Object.keys(res.body.users[0]).sort()).toEqual(['id', 'name', 'role']);
  });
});

describe('exam allow-lists (API-06, API-13)', () => {
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(512, 1)]);
  it('a head limited to exam A cannot download or read exam B', async () => {
    for (const id of ['exam-allow-a', 'exam-allow-b']) {
      await t.api().post('/api/exams').set(admin.auth).send({ id, title: id, book: 'كتاب', sampleQuestions: ['سؤال سري'], notes: 'ملاحظة' });
      await t.api().put(`/api/exams/${id}/file`).set(admin.auth).set('Content-Type', 'application/pdf').send(pdf);
    }
    const h = await userWithToken(t, { role: 'committee_head', allExams: false, allowedExamIds: ['exam-allow-a'] });
    expect((await t.api().get('/api/exams/exam-allow-a/file').set(h.auth)).status).toBe(200);
    expect((await t.api().get('/api/exams/exam-allow-b/file').set(h.auth)).status).toBe(403);
    const list = await t.api().get('/api/exams').set(h.auth);
    const b = list.body.exams.find((e: any) => e.id === 'exam-allow-b');
    expect(b.sampleQuestions).toEqual([]);
    expect(b.notes).toBeUndefined();
    expect(b.canOpen).toBe(false);
  });

  it('sheikhs never see exams or sample questions', async () => {
    const asst = await userWithToken(t, { role: 'sheikh' });
    const list = await t.api().get('/api/exams').set(asst.auth);
    expect(list.status).toBe(403);
    expect(JSON.stringify(list.body)).not.toContain('سؤال سري');
  });

  it('a malformed X-File-Name is a 400, not a 500', async () => {
    const res = await t.api().put('/api/exams/exam-allow-a/file').set(admin.auth)
      .set('Content-Type', 'application/pdf').set('X-File-Name', '%E0%A4%A').send(pdf);
    expect(res.status).toBe(400);
  });
});
