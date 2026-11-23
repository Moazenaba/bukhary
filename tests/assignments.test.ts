import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committeeBody, seedCourse, setupApp, userWithToken, type TestApp } from './helpers.ts';

// «مراقب»: an extra, scoped job on top of the sheikh's own role (a committee_staff row since migration 025).
let t: TestApp;
let sa: Awaited<ReturnType<typeof userWithToken>>;
let admin: Awaited<ReturnType<typeof userWithToken>>;
let paper: Buffer;
let own: any; // the sheikh's own committee
let other: any; // the committee he is sent to observe
let third: any;
let sheikh: Awaited<ReturnType<typeof userWithToken>>;
let head: Awaited<ReturnType<typeof userWithToken>>; // heads `other`
let strangerHead: Awaited<ReturnType<typeof userWithToken>>; // heads `own`

const book = 'كتاب المراقبة';
const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const binary = (res: any, cb: any) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const mk = async (n: number, extra: Record<string, unknown> = {}) => {
  const res = await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: n, ...extra }));
  expect(res.status).toBe(200);
  // Members see a committee once it is active (docs/PLAN_ROLES_AND_FLOW.md).
  await t.pool.query(`UPDATE committees SET lifecycle = 'active' WHERE id = $1;`, [res.body.committee.id]);
  return res.body.committee as any;
};
const assign = (auth: Record<string, string>, body: Record<string, unknown>) => t.api().post('/api/assignments').set(auth).send(body);
const me = async (u: { auth: Record<string, string> }) => (await t.api().get('/api/auth/me').set(u.auth)).body;
const audits = async (action: string) =>
  (await t.pool.query('SELECT count(*)::int AS n FROM audit_logs WHERE action = $1;', [action])).rows[0].n as number;

async function exam(id: string, opensAt: string | null, examBook = book) {
  await t.api().post('/api/exams').set(sa.auth).send({ id, title: id, book: examBook, opensAt });
  await t.api().put(`/api/exams/${id}/file`).set(sa.auth).set('Content-Type', 'application/pdf').send(paper);
}

beforeAll(async () => {
  t = await setupApp();
  await seedCourse(t.pool);
  sa = await userWithToken(t, { role: 'super_admin' });
  admin = await userWithToken(t, { role: 'admin' });
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  paper = Buffer.from(await doc.save());
  own = await mk(1, { competitionBook: 'كتابه' });
  other = await mk(2, { competitionBook: book });
  third = await mk(3, { competitionBook: 'كتاب ثالث' });
  sheikh = await userWithToken(t, { role: 'sheikh', committeeIds: [own.id], allExams: false });
  head = await userWithToken(t, { role: 'committee_head', committeeIds: [other.id] });
  strangerHead = await userWithToken(t, { role: 'committee_head', committeeIds: [own.id] });
  // The head of `other` owns it and may staff it (can_assign); the head of `own` owns it without that right.
  await t.pool.query(
    `INSERT INTO committee_staff (id, committee_id, user_id, role, can_assign, notified_at) VALUES
       ('stf-h1', $1, $2, 'owner', true, NOW()), ('stf-h2', $3, $4, 'owner', false, NOW());`,
    [other.id, head.id, own.id, strangerHead.id]
  );
});
afterAll(async () => {
  await t.pool.end();
});

describe('who may assign', () => {
  it('a plain sheikh cannot; nobody can assign themselves; a head only on their own committee', async () => {
    const body = { userId: sheikh.id, committeeId: other.id, task: 'exam' };
    expect((await assign(sheikh.auth, body)).status).toBe(403);
    expect((await assign(strangerHead.auth, body)).status).toBe(403); // not his committee
    expect((await assign(head.auth, { ...body, userId: head.id })).status).toBe(403); // himself
  });

  it('refuses targets that are not sheikhs or heads, or an inverted window', async () => {
    expect((await assign(admin.auth, { userId: sa.id, committeeId: other.id, task: 'exam' })).status).toBe(400);
    expect((await assign(admin.auth, { userId: sheikh.id, committeeId: other.id, task: 'exam', startsOn: '2026-05-02', endsOn: '2026-05-01' })).status).toBe(400);
  });
});

describe('an exam observer keeps the sheikh role and gains read access on one committee', () => {
  let assignmentId: string;

  it('before the assignment: the other committee is invisible and its paper closed', async () => {
    await exam('paper-obs', hours(-1));
    expect((await t.api().get(`/api/committees/${other.id}`).set(sheikh.auth)).status).toBe(404);
    expect((await t.api().get('/api/exams/paper-obs/file').set(sheikh.auth)).status).toBe(403);
  });

  it("the committee's head assigns; the account and role are untouched, with an audit row and a notification", async () => {
    const before = await audits('assignment.create');
    const res = await assign(head.auth, { userId: sheikh.id, committeeId: other.id, task: 'exam', endsOn: day(1) });
    expect(res.status).toBe(201);
    assignmentId = res.body.assignment.id;
    expect(res.body.assignment).toMatchObject({ task: 'exam', status: 'active', userName: expect.any(String), assignedBy: expect.any(String) });
    expect(await audits('assignment.create')).toBe(before + 1);
    const { rows } = await t.pool.query('SELECT role, assigned_committee_ids FROM app_users WHERE id = $1;', [sheikh.id]);
    expect(rows[0].role).toBe('sheikh');
    expect([...rows[0].assigned_committee_ids].sort()).toEqual([own.id, other.id].sort());
    const inbox = (await t.api().get('/api/notifications').set(sheikh.auth)).body.notifications as any[];
    expect(inbox.some((n) => /المراقبة/.test(n.title))).toBe(true);
    // The same task twice is refused.
    expect((await assign(head.auth, { userId: sheikh.id, committeeId: other.id, task: 'exam' })).status).toBe(409);
  });

  it('he now reads the committee he observes and still his own; /auth/me lists the assignment', async () => {
    expect((await t.api().get(`/api/committees/${other.id}`).set(sheikh.auth)).status).toBe(200);
    const list = (await t.api().get('/api/committees').set(sheikh.auth)).body.committees as any[];
    expect(list.map((c) => c.id).sort()).toEqual([own.id, other.id].sort());
    const m = await me(sheikh);
    expect(m.permissions.role).toBe('sheikh');
    expect(m.permissions.observing).toEqual([{ id: assignmentId, committeeId: other.id, task: 'exam' }]);
    expect(m.permissions.actions['assignments.manage']).toBe(false);
  });

  it('read-only: he cannot edit the observed committee, nor read a third one', async () => {
    const edit = await t.api().post('/api/committees').set(sheikh.auth).send({ ...other, committeeName: 'تعديل' });
    expect(edit.status).toBe(403);
    expect((await t.api().put(`/api/committees/${other.id}/members`).set(sheikh.auth).send({ userIds: [] })).status).toBe(403);
    expect((await t.api().get(`/api/committees/${third.id}`).set(sheikh.auth)).status).toBe(404);
  });

  it("opens the paper of the observed committee's book, with the usual watermark, and no other paper", async () => {
    await exam('paper-other', hours(-1), 'كتاب غير مرتبط');
    const ok = await t.api().get('/api/exams/paper-obs/file').set(sheikh.auth).buffer(true).parse(binary);
    expect(ok.status).toBe(200);
    expect((await t.api().get('/api/exams/paper-other/file').set(sheikh.auth)).status).toBe(403);
    const list = (await t.api().get('/api/exams').set(sheikh.auth)).body.exams as any[];
    expect(list.map((e) => e.id)).toEqual(['paper-obs']);
    expect(list[0].canOpen).toBe(true);
  });

  it('the exam lock still applies to him before the exam opens', async () => {
    await exam('paper-future', hours(200));
    await t.pool.query('UPDATE exams SET book = $1 WHERE id = $2;', [book, 'paper-future']);
    const res = await t.api().get('/api/exams/paper-future/file').set(sheikh.auth);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('exam_not_open_yet');
    await t.pool.query('DELETE FROM exams WHERE id = $1;', ['paper-future']);
  });

  it('writes a note on the assignment; only he and the committee managers read it', async () => {
    expect((await t.api().post(`/api/assignments/${assignmentId}/observations`).set(sheikh.auth).send({ note: '' })).status).toBe(400);
    expect((await t.api().post(`/api/assignments/${assignmentId}/observations`).set(sheikh.auth).send({ note: 'الأمور منضبطة' })).status).toBe(201);
    expect((await t.api().post(`/api/assignments/${assignmentId}/observations`).set(strangerHead.auth).send({ note: 'x' })).status).toBe(403);
    const asHead = await t.api().get(`/api/assignments/${assignmentId}/observations`).set(head.auth);
    expect(asHead.body.observations.map((o: any) => o.note)).toEqual(['الأمور منضبطة']);
    expect((await t.api().get(`/api/assignments/${assignmentId}/observations`).set(strangerHead.auth)).status).toBe(404);
  });

  it('a head of another committee cannot end it; the committee head can, and everything returns to the role', async () => {
    expect((await t.api().post(`/api/assignments/${assignmentId}/end`).set(strangerHead.auth)).status).toBe(404);
    const before = await audits('assignment.end');
    const res = await t.api().post(`/api/assignments/${assignmentId}/end`).set(head.auth);
    expect(res.status).toBe(200);
    expect(res.body.assignment.status).toBe('ended');
    expect(await audits('assignment.end')).toBe(before + 1);
    expect((await t.api().get(`/api/committees/${other.id}`).set(sheikh.auth)).status).toBe(404);
    expect((await t.api().get('/api/exams/paper-obs/file').set(sheikh.auth)).status).toBe(403);
    expect((await me(sheikh)).permissions.observing).toEqual([]);
    // The account and the history survive.
    const { rows } = await t.pool.query('SELECT count(*)::int AS n FROM committee_staff WHERE id = $1;', [assignmentId]);
    expect(rows[0].n).toBe(1);
    expect((await t.api().post(`/api/assignments/${assignmentId}/end`).set(head.auth)).status).toBe(409);
  });

  it('dates no longer end a job: the committee lifecycle does (the dates sent by older apps are accepted)', async () => {
    const res = await assign(admin.auth, { userId: sheikh.id, committeeId: other.id, task: 'exam', endsOn: day(-3) });
    expect(res.status).toBe(201);
    expect((await t.api().get(`/api/committees/${other.id}`).set(sheikh.auth)).status).toBe(200);
  });
});

describe('a ceremony assignment', () => {
  it('invites him to the ceremony and cancelling removes the invitation', async () => {
    const guest = await userWithToken(t, { role: 'sheikh' });
    const res = await assign(admin.auth, { userId: guest.id, committeeId: third.id, task: 'ceremony' });
    expect(res.status).toBe(201);
    const c = (await t.api().get(`/api/committees/${third.id}`).set(guest.auth)).body.committee;
    expect(c.ceremonyDetails.attendees.map((a: any) => a.id)).toContain(guest.id);
    const cancelled = await t.api().post(`/api/assignments/${res.body.assignment.id}/cancel`).set(admin.auth);
    expect(cancelled.body.assignment.status).toBe('cancelled');
    expect((await t.api().get(`/api/committees/${third.id}`).set(guest.auth)).status).toBe(404);
  });
});

describe('listing', () => {
  it('a head sees assignments on his committee only; people see their own', async () => {
    const mineList = (await t.api().get('/api/assignments').set(sheikh.auth)).body.assignments as any[];
    expect(mineList.every((a) => a.userId === sheikh.id)).toBe(true);
    expect((await t.api().get(`/api/assignments?committeeId=${other.id}`).set(strangerHead.auth)).status).toBe(403);
    const onOther = (await t.api().get(`/api/assignments?committeeId=${other.id}`).set(head.auth)).body.assignments as any[];
    expect(onOther.length).toBeGreaterThan(0);
  });
});
