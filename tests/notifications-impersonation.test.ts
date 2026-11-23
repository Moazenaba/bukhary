import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committeeBody, seedCourse, setupApp, userWithToken, type TestApp } from './helpers.ts';

// Manual messages to a chosen audience (docs/PLAN_ROLES_AND_FLOW.md 1.6) and «الدخول بعين المستخدم» (1.7).
type U = Awaited<ReturnType<typeof userWithToken>>;
let t: TestApp;
let sa: U, admin: U, admin2: U, manager: U, owner: U, obs: U, cer: U, idle: U;
let c: any;

const send = (u: U, body: Record<string, unknown>) => t.api().post('/api/notifications').set(u.auth).send({ title: 'رسالة', ...body });
const titles = async (u: { auth: Record<string, string> }) =>
  ((await t.api().get('/api/notifications').set(u.auth)).body.notifications as any[]).map((n) => n.title);

beforeAll(async () => {
  t = await setupApp();
  await seedCourse(t.pool);
  sa = await userWithToken(t, { role: 'super_admin' });
  admin = await userWithToken(t, { role: 'admin', name: 'الأدمن' });
  admin2 = await userWithToken(t, { role: 'admin' });
  manager = await userWithToken(t, { role: 'exams_manager' });
  owner = await userWithToken(t, { role: 'committee_head', name: 'صاحب اللجنة' });
  obs = await userWithToken(t, { role: 'sheikh', name: 'المراقب' });
  cer = await userWithToken(t, { role: 'sheikh', name: 'شيخ الحفل' });
  idle = await userWithToken(t, { role: 'sheikh', name: 'متاح' });
  const res = await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: 5, examDate: '2026-12-12', ownerUserId: owner.id }));
  c = res.body.committee;
  for (const to of ['sent_to_manager', 'observers_open']) await t.api().post(`/api/committees/${c.id}/lifecycle`).set(admin.auth).send({ to });
  await t.api().post(`/api/committees/${c.id}/staff`).set(manager.auth).send({ userId: obs.id, role: 'observer' });
  await t.api().post(`/api/committees/${c.id}/staff`).set(admin.auth).send({ userId: cer.id, role: 'ceremony_sheikh' });
  await t.api().post(`/api/committees/${c.id}/lifecycle`).set(manager.auth).send({ to: 'active' });
});
afterAll(async () => {
  await t.pool.end();
});

describe('sending to an audience', () => {
  it('only admins and the exams manager send', async () => {
    expect((await send(owner, { audience: { kind: 'all' } })).status).toBe(403);
    expect((await send(obs, { audience: { kind: 'all' } })).status).toBe(403);
  });

  it('to everyone: never a super admin, and no admin when an admin sends', async () => {
    const res = await send(admin, { title: 'للكل', audience: { kind: 'all' } });
    expect(res.status).toBe(201);
    expect(await titles(obs)).toContain('للكل');
    expect(await titles(manager)).toContain('للكل');
    expect(await titles(sa)).not.toContain('للكل');
    expect(await titles(admin2)).not.toContain('للكل');
    expect(res.body.recipients).toBe(5); // manager, owner, observer, ceremony sheikh, idle
  });

  it('to chosen people, to an account role, to every observer, to a committee or some of its roles', async () => {
    await send(manager, { title: 'لشخص', audience: { kind: 'users', userIds: [idle.id, sa.id] } });
    expect(await titles(idle)).toContain('لشخص');
    expect(await titles(sa)).not.toContain('لشخص');

    await send(admin, { title: 'للمديرين', audience: { kind: 'accountRole', accountRole: 'exams_manager' } });
    expect(await titles(manager)).toContain('للمديرين');
    expect(await titles(owner)).not.toContain('للمديرين');

    await send(admin, { title: 'لكل المراقبين', audience: { kind: 'staffRole', staffRole: 'observer' } });
    expect(await titles(obs)).toContain('لكل المراقبين');
    expect(await titles(cer)).not.toContain('لكل المراقبين');

    await send(admin, { title: 'لمشايخ حفلة 5', audience: { kind: 'committee', committeeId: c.id, committeeRoles: ['ceremony_sheikh'] } });
    expect(await titles(cer)).toContain('لمشايخ حفلة 5');
    expect(await titles(obs)).not.toContain('لمشايخ حفلة 5');
  });

  it('to the people free on a day', async () => {
    const preview = await t.api().post('/api/notifications/preview').set(admin.auth).send({ audience: { kind: 'available', date: '2026-12-12' } });
    expect(preview.status).toBe(200);
    const ids = preview.body.sample.map((p: any) => p.id);
    expect(ids).toContain(idle.id);
    expect(ids).not.toContain(obs.id); // he observes that day
    expect(ids).not.toContain(owner.id);
  });

  it('lists what was sent, with how many it reached', async () => {
    const sent = (await t.api().get('/api/notifications/sent').set(admin.auth)).body.sent as any[];
    expect(sent.find((x) => x.title === 'للكل')).toMatchObject({ recipients: 5 });
    const mine = (await t.api().get('/api/notifications/sent').set(manager.auth)).body.sent as any[];
    expect(mine.map((x) => x.title)).toEqual(['لشخص']);
  });
});

describe('acting as another user («الدخول بعين المستخدم»)', () => {
  let as: { auth: Record<string, string> };

  it('an admin may act as anyone but admins; nobody else may', async () => {
    expect((await t.api().post(`/api/impersonation/start/${obs.id}`).set(manager.auth)).status).toBe(403);
    expect((await t.api().post(`/api/impersonation/start/${admin2.id}`).set(admin.auth)).status).toBe(404);
    expect((await t.api().post(`/api/impersonation/start/${sa.id}`).set(admin.auth)).status).toBe(404);
    expect((await t.api().post(`/api/impersonation/start/${admin.id}`).set(sa.auth)).status).toBe(200);
  });

  it('opens exactly what the person sees, and sends nobody a notice', async () => {
    const before = (await t.pool.query('SELECT count(*)::int AS n FROM notifications;')).rows[0].n;
    const res = await t.api().post(`/api/impersonation/start/${obs.id}`).set(admin.auth);
    expect(res.status).toBe(200);
    as = { auth: { Authorization: `Bearer ${res.body.token}` } };
    const me = (await t.api().get('/api/auth/me').set(as.auth)).body;
    expect(me.user.id).toBe(obs.id);
    expect(me.permissions.impersonating).toEqual({ by: 'الأدمن' });
    expect(me.permissions.committeeScope).toEqual([c.id]);
    expect(((await t.api().get('/api/committees').set(as.auth)).body.committees as any[]).map((x) => x.id)).toEqual([c.id]);
    expect((await t.pool.query('SELECT count(*)::int AS n FROM notifications;')).rows[0].n).toBe(before);
  });

  it('may act for the person; the log names both', async () => {
    const mine = (await t.api().get(`/api/committees/${c.id}/people`).set(as.auth)).body.mine[0];
    const excuse = await t.api().post(`/api/committees/${c.id}/staff/${mine.id}/excuse`).set(as.auth).send({ reason: 'تجربة' });
    expect(excuse.status).toBe(200);
    const { rows } = await t.pool.query(`SELECT user_name, impersonator_name, details FROM audit_logs WHERE action = 'staff.excuse' ORDER BY created_at DESC LIMIT 1;`);
    expect(rows[0]).toMatchObject({ user_name: 'المراقب', impersonator_name: 'الأدمن' });
    expect(rows[0].details).toContain('بواسطة الأدمن نيابة عن المراقب');
    // The action's own notices still go out (the manager hears of the excuse).
    expect((await titles(manager)).some((x) => x.startsWith('اعتذار: المراقب'))).toBe(true);
  });

  it('cannot register a phone, change the password, or start another impersonation', async () => {
    expect((await t.api().post('/api/devices').set(as.auth).send({ token: 'x'.repeat(40), platform: 'android' })).status).toBe(403);
    expect((await t.api().post('/api/auth/change-password').set(as.auth).send({ currentPassword: 'a', newPassword: 'Bbbbbb123' })).status).toBe(403);
    expect((await t.api().post(`/api/impersonation/start/${idle.id}`).set(as.auth)).status).toBe(403);
  });

  it('admins read the log (impersonations included) without super admins\' rows; ending closes the session', async () => {
    const logs = (await t.api().get('/api/audit-logs?impersonatedOnly=true').set(admin2.auth)).body.logs as any[];
    expect(logs.some((l) => l.impersonatedBy === 'الأدمن' && l.action === 'staff.excuse')).toBe(true);
    const all = (await t.api().get('/api/audit-logs').set(admin2.auth)).body.logs as any[];
    expect(all.some((l) => l.role === 'super_admin')).toBe(false);
    // The super admin opening the admin's account is not shown to admins; the admin opening the observer's is.
    expect(all.some((l) => l.action === 'impersonation.start' && l.entityId === admin.id)).toBe(false);
    expect(all.some((l) => l.action === 'impersonation.start' && l.entityId === obs.id)).toBe(true);
    expect((await t.api().post('/api/impersonation/end').set(as.auth)).status).toBe(200);
    expect((await t.api().get('/api/auth/me').set(as.auth)).status).toBe(401);
    expect((await t.api().get('/api/auth/me').set(admin.auth)).status).toBe(200);
  });
});
