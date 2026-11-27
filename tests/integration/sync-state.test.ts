import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committeeBody, seedCourse, setupApp, userWithToken, type TestApp } from '../helpers.ts';

// Clients poll /api/sync/state (a few bytes) and reload the full lists only when it changes.
let t: TestApp;
let admin: Awaited<ReturnType<typeof userWithToken>>;
const version = async (auth: Record<string, string>) => {
  const res = await t.api().get('/api/sync/state').set(auth);
  expect(res.status).toBe(200);
  return res.body.version as string;
};

beforeAll(async () => {
  t = await setupApp();
  await seedCourse(t.pool);
  admin = await userWithToken(t, { role: 'super_admin' });
});
afterAll(async () => {
  await t.pool.end();
});

describe('sync fingerprint', () => {
  it('stays the same while nothing changes, and is tiny', async () => {
    const a = await version(admin.auth);
    expect(await version(admin.auth)).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it('changes when a committee is added, edited or deleted, and when a task changes', async () => {
    const v0 = await version(admin.auth);
    const c = (await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: 1 }))).body.committee;
    const v1 = await version(admin.auth);
    expect(v1).not.toBe(v0);
    await t.api().post(`/api/committees/${c.id}/actions`).set(admin.auth).send({ action: { type: 'completeStage', stage: 'registration' } });
    const v2 = await version(admin.auth);
    expect(v2).not.toBe(v1);
    await t.api().post('/api/tasks').set(admin.auth).send({ id: 'sync-task', title: 'مهمة', date: '2026-12-01' });
    const v3 = await version(admin.auth);
    expect(v3).not.toBe(v2);
    await t.api().delete(`/api/committees/${c.id}`).set(admin.auth);
    expect(await version(admin.auth)).not.toBe(v3);
  });

  it('a notification for someone else does not make my app reload', async () => {
    const other = await userWithToken(t, { role: 'sheikh' });
    const mine = await version(admin.auth);
    await t.pool.query(
      `INSERT INTO notifications (id, title, description, type, created_at, data, target_user_id) VALUES ('n-other', 'x', '', 'info', NOW(), '{}'::jsonb, $1);`,
      [other.id]
    );
    expect(await version(admin.auth)).toBe(mine);
  });

  it('says which list changed: a task changes «tasks» only, a committee «committees» only', async () => {
    const parts = async () => (await t.api().get('/api/sync/state').set(admin.auth)).body.parts as Record<string, string>;
    const p0 = await parts();
    expect(Object.keys(p0)).toEqual(expect.arrayContaining(['me', 'committees', 'tasks', 'courses', 'exams', 'sheet', 'users', 'notifications', 'books', 'settings', 'permissions']));
    await t.api().post('/api/tasks').set(admin.auth).send({ id: 'sync-task-2', title: 'مهمة', date: '2026-12-02' });
    const p1 = await parts();
    expect(p1.tasks).not.toBe(p0.tasks);
    for (const k of ['committees', 'courses', 'exams', 'sheet', 'users', 'books', 'settings', 'permissions']) expect(p1[k]).toBe(p0[k]);
    await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: 7 }));
    const p2 = await parts();
    expect(p2.committees).not.toBe(p1.committees);
    expect(p2.tasks).toBe(p1.tasks);
    expect(p2.exams).toBe(p1.exams);
  });

  it('a change to my own account (role, scope) changes every part', async () => {
    const sheikh = await userWithToken(t, { role: 'sheikh' });
    const before = (await t.api().get('/api/sync/state').set(sheikh.auth)).body.parts as Record<string, string>;
    await t.pool.query(`UPDATE app_users SET all_committees = true WHERE id = $1;`, [sheikh.id]);
    const after = (await t.api().get('/api/sync/state').set(sheikh.auth)).body.parts as Record<string, string>;
    for (const k of Object.keys(before)) expect(after[k]).not.toBe(before[k]);
  });

  it('needs a login', async () => {
    expect((await t.api().get('/api/sync/state')).status).toBe(401);
  });
});
