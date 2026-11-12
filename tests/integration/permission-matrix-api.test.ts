import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Action, isAllowed } from '../../server/policy.ts';
import { SYSTEM_PERMISSIONS } from '../../server/policy.ts';
import { committeeBody, createUser, seedCourse, setupApp, userWithToken, type TestApp } from '../helpers.ts';

// The permission table checked through the real API: for each kind of user and each guarded
// request, the server refuses (403) exactly when the policy says no. A route that forgets its
// check, or checks the wrong thing, fails here.

let t: TestApp;
let admin: Awaited<ReturnType<typeof userWithToken>>;
let mine: any;
let n = 500;
const fresh = () => `id-${crypto.randomUUID()}`;

type Probe = { action: Action; run: (auth: Record<string, string>) => Promise<{ status: number }> };
const PROBES: Probe[] = [
  { action: 'committees.create', run: (a) => t.api().post('/api/committees').set(a).send(committeeBody({ committeeNumber: n++ })) },
  { action: 'committees.update', run: async (a) => t.api().post('/api/committees').set(a).send({ ...committeeBody({ id: mine.id, committeeNumber: mine.committeeNumber }), committeeName: 'اسم' }) },
  { action: 'committees.delete', run: async (a) => {
      const c = (await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: n++ }))).body.committee;
      await t.pool.query(`UPDATE app_users SET assigned_committee_ids = assigned_committee_ids || to_jsonb($1::text) WHERE role <> 'super_admin';`, [c.id]);
      return t.api().delete(`/api/committees/${c.id}`).set(a);
    } },
  { action: 'committees.reception', run: (a) => t.api().post(`/api/committees/${mine.id}/actions`).set(a).send({ action: { type: 'receive' } }) },
  { action: 'courses.write', run: (a) => t.api().post('/api/courses').set(a).send({ id: fresh(), name: 'دورة' }) },
  { action: 'exams.read', run: (a) => t.api().get('/api/exams').set(a) },
  { action: 'exams.write', run: (a) => t.api().post('/api/exams').set(a).send({ id: fresh(), title: 'امتحان', book: 'كتاب' }) },
  { action: 'exams.delete', run: async (a) => {
      const id = fresh();
      await t.api().post('/api/exams').set(admin.auth).send({ id, title: 'امتحان', book: 'كتاب' });
      return t.api().delete(`/api/exams/${id}`).set(a);
    } },
  { action: 'tasks.write', run: (a) => t.api().post('/api/tasks').set(a).send({ id: fresh(), title: 'مهمة', date: '2026-12-01', committeeId: mine.id }) },
  { action: 'users.read', run: (a) => t.api().get('/api/users').set(a) },
  { action: 'users.delete', run: async (a) => {
      const v = await createUser(t.pool, { role: 'sheikh' });
      return t.api().delete(`/api/users/${v.id}`).set(a);
    } },
  { action: 'profiles.read', run: (a) => t.api().get('/api/permission-profiles').set(a) },
  { action: 'books.write', run: (a) => t.api().post('/api/books').set(a).send({ name: `كتاب ${fresh()}` }) },
  { action: 'summerRows.read', run: (a) => t.api().get('/api/summer-course-rows').set(a) },
  { action: 'summerRows.write', run: (a) => t.api().post('/api/summer-course-rows').set(a).send({ id: fresh(), number: 1 }) },
  { action: 'scoring.read', run: (a) => t.api().get('/api/scoring').set(a) },
  { action: 'notifications.create', run: (a) => t.api().post('/api/notifications').set(a).send({ title: 'تنبيه', description: 'نص', type: 'info' }) },
  { action: 'audit.read', run: (a) => t.api().get('/api/audit-logs').set(a) },
  { action: 'database.admin', run: (a) => t.api().get('/api/database/status').set(a) },
  { action: 'database.backup', run: (a) => t.api().get('/api/database/backup/tables').set(a) },
];

const PEOPLE = [
  { label: 'admin', role: 'admin', permissions: [] as string[] },
  { label: 'committee head', role: 'committee_head', permissions: [] },
  { label: 'committee head + all permissions', role: 'committee_head', permissions: [...SYSTEM_PERMISSIONS] },
  { label: 'sheikh', role: 'sheikh', permissions: [] },
  { label: 'sheikh + all permissions', role: 'sheikh', permissions: [...SYSTEM_PERMISSIONS] },
];

beforeAll(async () => {
  t = await setupApp();
  await seedCourse(t.pool);
  admin = await userWithToken(t, { role: 'super_admin' });
  mine = (await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: 1 }))).body.committee;
});
afterAll(async () => {
  await t.pool.end();
});

describe.each(PEOPLE)('$label', (who) => {
  let user: Awaited<ReturnType<typeof userWithToken>>;
  beforeAll(async () => {
    user = await userWithToken(t, { role: who.role, permissions: who.permissions, committeeIds: [mine.id] });
  });
  it.each(PROBES.map((p) => [p.action, p] as const))('%s', async (action, probe) => {
    const allowed = isAllowed({ role: who.role as any, permissions: who.permissions }, action);
    const res = await probe.run(user.auth);
    expect(res.status, `${action}: got ${res.status}`).not.toBe(401);
    if (allowed) expect(res.status, `${action} should be allowed, got ${res.status}`).not.toBe(403);
    else expect([403, 404], `${action} should be refused, got ${res.status}`).toContain(res.status);
  });
});

describe('committee scope through the API', () => {
  it('a committee head cannot act on a committee that is not theirs', async () => {
    const other = (await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: n++ }))).body.committee;
    const head = await userWithToken(t, { role: 'committee_head', committeeIds: [mine.id] });
    expect((await t.api().post(`/api/committees/${other.id}/actions`).set(head.auth).send({ action: { type: 'receive' } })).status).toBe(403);
    expect((await t.api().get(`/api/committees/${other.id}`).set(head.auth)).status).toBe(404);
    const list = await t.api().get('/api/committees').set(head.auth);
    expect(list.body.committees.map((c: any) => c.id)).toEqual([mine.id]);
  });

  it('a sheikh sees only their committees and cannot change any', async () => {
    const s = await userWithToken(t, { role: 'sheikh', committeeIds: [mine.id] });
    const list = await t.api().get('/api/committees').set(s.auth);
    expect(list.body.committees.map((c: any) => c.id)).toEqual([mine.id]);
    expect((await t.api().post(`/api/committees/${mine.id}/actions`).set(s.auth).send({ action: { type: 'completeStage', stage: 'registration' } })).status).toBe(403);
  });
});
