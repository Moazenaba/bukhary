import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committeeBody, createUser, seedCourse, setupApp, userWithToken, type TestApp } from './helpers.ts';

// The four roles (migration 015): super admins see everything; admins see everything except other
// admins; committee heads staff the committees assigned to them with sheikhs; sheikhs see only
// the committees and ceremonies they were given.

let t: TestApp;
let superAdmin: Awaited<ReturnType<typeof userWithToken>>;
let admin: Awaited<ReturnType<typeof userWithToken>>;

beforeAll(async () => {
  t = await setupApp();
  await seedCourse(t.pool);
  superAdmin = await userWithToken(t, { role: 'super_admin', name: 'المشرف العام' });
  admin = await userWithToken(t, { role: 'admin', name: 'أدمن أول' });
});
afterAll(async () => {
  await t.pool.end();
});

const committee = async (n: number) => {
  const res = await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: n }));
  expect(res.status).toBe(200);
  return res.body.committee as any;
};
const ids = (list: any[]) => list.map((x) => x.id);
const inbox = async (auth: Record<string, string>) =>
  ((await t.api().get('/api/notifications').set(auth)).body.notifications as any[]).map((n) => n.title as string);

describe('admins and super admins', () => {
  it('an admin never sees other admins or super admins, a super admin sees everyone', async () => {
    const other = await userWithToken(t, { role: 'admin', name: 'أدمن ثان' });
    const sheikh = await userWithToken(t, { role: 'sheikh' });
    const asAdmin = ids((await t.api().get('/api/users').set(admin.auth)).body.users);
    expect(asAdmin).toEqual(expect.arrayContaining([admin.id, sheikh.id]));
    expect(asAdmin).not.toContain(other.id);
    expect(asAdmin).not.toContain(superAdmin.id);
    const asSuper = ids((await t.api().get('/api/users').set(superAdmin.auth)).body.users);
    expect(asSuper).toEqual(expect.arrayContaining([admin.id, other.id, superAdmin.id, sheikh.id]));
  });

  it('an admin cannot edit, reset, delete or create admin accounts; it is as if they did not exist', async () => {
    const other = await userWithToken(t, { role: 'admin' });
    const edit = await t.api().post('/api/users').set(admin.auth).send({ id: other.id, name: 'تغيير', phone: other.phone });
    expect(edit.status).toBe(404);
    expect((await t.api().post(`/api/users/${other.id}/reset-password`).set(admin.auth).send({ password: 'NewPassw0rd' })).status).toBe(404);
    expect((await t.api().delete(`/api/users/${superAdmin.id}`).set(admin.auth)).status).toBe(404);
    const create = await t.api().post('/api/users').set(admin.auth)
      .send({ id: 'usr_new_admin', name: 'أدمن جديد', phone: '0533000001', password: 'Initial123', role: 'admin', status: 'approved' });
    expect(create.status).toBe(403);
    const sheikh = await userWithToken(t, { role: 'sheikh' });
    const promote = await t.api().post('/api/users').set(admin.auth).send({ id: sheikh.id, name: 'ش', phone: sheikh.phone, role: 'super_admin' });
    expect(promote.status).toBe(403);
  });

  it('an admin creates committee heads and sheikhs and assigns their committees', async () => {
    const c = await committee(1);
    const res = await t.api().post('/api/users').set(admin.auth)
      .send({ id: 'usr_head_1', name: 'رئيس لجنة', phone: '0533000002', password: 'Initial123', role: 'committee_head', status: 'approved', assignedCommitteeIds: [c.id] });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('committee_head');
    expect(res.body.user.assignedCommitteeIds).toEqual([c.id]);
  });

  it('a super admin creates admins; admins are told what only super admins can do', async () => {
    const res = await t.api().post('/api/users').set(superAdmin.auth)
      .send({ id: 'usr_admin_2', name: 'أدمن', phone: '0533000003', password: 'Initial123', role: 'admin', status: 'approved' });
    expect(res.status).toBe(200);
    const me = (await t.api().get('/api/auth/me').set(admin.auth)).body.permissions;
    expect(me.actions['users.admins']).toBe(false);
    expect(me.actions['audit.read']).toBe(false);
    expect(me.actions['database.admin']).toBe(false);
    expect(me.actions['users.grant']).toBe(true);
    expect(me.actions['committees.create']).toBe(true);
    expect(me.grantableRoles).toEqual(['committee_head', 'sheikh']);
    expect(me.committeeScope).toBe('all');
    expect((await t.api().get('/api/audit-logs').set(admin.auth)).status).toBe(403);
  });

  it('admins invited to a ceremony are hidden from other admins, and stay invited when an admin edits the list', async () => {
    const c = await committee(2);
    const sheikh = await userWithToken(t, { role: 'sheikh', name: 'شيخ الحفل' });
    const scheduled = await t.api().post(`/api/committees/${c.id}/actions`).set(superAdmin.auth)
      .send({ action: { type: 'scheduleCeremony', ceremonyDate: '2026-12-01', attendeeUserIds: [admin.id, superAdmin.id] } });
    expect(scheduled.status).toBe(200);
    const asOther = await userWithToken(t, { role: 'admin' });
    const seen = (await t.api().get(`/api/committees/${c.id}`).set(asOther.auth)).body.committee.ceremonyDetails.attendees;
    expect(seen).toEqual([]);
    const edit = await t.api().post(`/api/committees/${c.id}/actions`).set(asOther.auth)
      .send({ action: { type: 'scheduleCeremony', ceremonyDate: '2026-12-01', attendeeUserIds: [sheikh.id] } });
    expect(edit.status).toBe(200);
    expect(ids(edit.body.committee.ceremonyDetails.attendees)).toEqual([sheikh.id]);
    const { rows } = await t.pool.query("SELECT ceremony_details -> 'attendees' AS a FROM committees WHERE id = $1;", [c.id]);
    expect(ids(rows[0].a).sort()).toEqual([admin.id, superAdmin.id, sheikh.id].sort());
    const candidates = ids((await t.api().get('/api/users/ceremony-candidates').set(asOther.auth)).body.users);
    expect(candidates).not.toContain(admin.id);
    expect(candidates).toContain(sheikh.id);
  });
});

describe('committee heads', () => {
  it('staff only the committees they head, with sheikhs only; added and removed sheikhs are told', async () => {
    const mine = await committee(10);
    const other = await committee(11);
    const head = await userWithToken(t, { role: 'committee_head', committeeIds: [mine.id] });
    const sheikh = await userWithToken(t, { role: 'sheikh', name: 'الشيخ أحمد' });
    const otherHead = await userWithToken(t, { role: 'committee_head' });

    const add = await t.api().put(`/api/committees/${mine.id}/members`).set(head.auth).send({ userIds: [sheikh.id] });
    expect(add.status).toBe(200);
    expect(add.body.committee.staff).toEqual(expect.arrayContaining([
      { id: sheikh.id, name: 'الشيخ أحمد', role: 'sheikh' },
      expect.objectContaining({ id: head.id, role: 'committee_head' }),
    ]));
    expect((await inbox(sheikh.auth)).some((m) => m.startsWith('تمت إضافتك إلى لجنة 10'))).toBe(true);
    expect(ids((await t.api().get('/api/committees').set(sheikh.auth)).body.committees)).toEqual([mine.id]);

    expect((await t.api().put(`/api/committees/${other.id}/members`).set(head.auth).send({ userIds: [sheikh.id] })).status).toBe(403);
    expect((await t.api().put(`/api/committees/${mine.id}/members`).set(head.auth).send({ userIds: [otherHead.id] })).status).toBe(400);
    expect((await t.api().put(`/api/committees/${mine.id}/members`).set(head.auth).send({ userIds: [admin.id] })).status).toBe(400);

    // The head is not among the people they place, so emptying the list keeps them on the committee.
    const remove = await t.api().put(`/api/committees/${mine.id}/members`).set(head.auth).send({ userIds: [] });
    expect(remove.status).toBe(200);
    expect(ids(remove.body.committee.staff)).toEqual([head.id]);
    expect((await inbox(sheikh.auth)).some((m) => m.startsWith('تم إلغاء إضافتك إلى لجنة 10'))).toBe(true);
    expect((await t.api().get('/api/committees').set(sheikh.auth)).body.committees).toEqual([]);
  });

  it('an admin places committee heads on a committee too', async () => {
    const c = await committee(12);
    const head = await userWithToken(t, { role: 'committee_head' });
    const res = await t.api().put(`/api/committees/${c.id}/members`).set(admin.auth).send({ userIds: [head.id] });
    expect(res.status).toBe(200);
    const me = (await t.api().get('/api/auth/me').set(head.auth)).body.permissions;
    expect(me.committeeScope).toEqual([c.id]);
  });

  it('a head creates a committee, which becomes theirs, but cannot delete it without the permission', async () => {
    const head = await userWithToken(t, { role: 'committee_head' });
    const body = committeeBody({ committeeNumber: 13 });
    expect((await t.api().post('/api/committees').set(head.auth).send(body)).status).toBe(200);
    expect(ids((await t.api().get('/api/committees').set(head.auth)).body.committees)).toEqual([body.id]);
    expect((await t.api().delete(`/api/committees/${body.id}`).set(head.auth)).status).toBe(403);
  });
});

describe('sheikhs', () => {
  it('see nothing until something is assigned to them', async () => {
    await committee(20);
    const sheikh = await userWithToken(t, { role: 'sheikh' });
    expect((await t.api().get('/api/committees').set(sheikh.auth)).body.committees).toEqual([]);
    expect((await t.api().get('/api/tasks').set(sheikh.auth)).body.tasks).toEqual([]);
  });

  it('a ceremony invitation from the sheikh page shows that ceremony only, with a notice', async () => {
    const c = await committee(21);
    await committee(22);
    await t.api().post(`/api/committees/${c.id}/actions`).set(admin.auth)
      .send({ action: { type: 'scheduleCeremony', ceremonyDate: '2026-12-05', ceremonyPlace: 'المسجد' } });
    const sheikh = await userWithToken(t, { role: 'sheikh', name: 'المدعو' });
    expect((await inbox(sheikh.auth)).some((m) => m.startsWith('تم تحديد موعد حفل لجنة 21'))).toBe(false);

    const invite = await t.api().post(`/api/committees/${c.id}/ceremony-attendees`).set(admin.auth).send({ add: [sheikh.id] });
    expect(invite.status).toBe(200);
    expect(invite.body.committee.ceremonyDetails.ceremonyPlace).toBe('المسجد');
    expect((await inbox(sheikh.auth)).some((m) => m.startsWith('تمت إضافتك لحفل تكريم لجنة 21'))).toBe(true);

    const seen = (await t.api().get('/api/committees').set(sheikh.auth)).body.committees;
    expect(ids(seen)).toEqual([c.id]);
    // The ceremony's calendar task and the committee's broadcast reach the invited sheikh now.
    expect((await t.api().get('/api/tasks').set(sheikh.auth)).body.tasks.map((x: any) => x.id)).toEqual([`task-ceremony-${c.id}`]);
    expect((await inbox(sheikh.auth)).some((m) => m.startsWith('تم تحديد موعد حفل لجنة 21'))).toBe(true);
    // Invited is not assigned: the sheikh cannot act on the committee.
    expect((await t.api().post(`/api/committees/${c.id}/actions`).set(sheikh.auth).send({ action: { type: 'receive' } })).status).toBe(403);

    const removed = await t.api().post(`/api/committees/${c.id}/ceremony-attendees`).set(admin.auth).send({ remove: [sheikh.id] });
    expect(removed.status).toBe(200);
    expect((await t.api().get('/api/committees').set(sheikh.auth)).body.committees).toEqual([]);
  });

  it('cannot invite people to a ceremony or staff a committee', async () => {
    const c = await committee(23);
    const sheikh = await userWithToken(t, { role: 'sheikh', committeeIds: [c.id] });
    const friend = await userWithToken(t, { role: 'sheikh' });
    expect((await t.api().post(`/api/committees/${c.id}/ceremony-attendees`).set(sheikh.auth).send({ add: [friend.id] })).status).toBe(403);
    expect((await t.api().put(`/api/committees/${c.id}/members`).set(sheikh.auth).send({ userIds: [friend.id] })).status).toBe(403);
    expect((await t.api().get(`/api/committees/${(await committee(24)).id}`).set(sheikh.auth)).status).toBe(404);
  });
});

describe('migration 015', () => {
  it('turns teachers, assistants and auditors into sheikhs who see only their committees', async () => {
    const sql = fs.readFileSync(path.resolve('migrations/015_people_roles.sql'), 'utf8');
    await t.pool.query('ALTER TABLE app_users DROP CONSTRAINT chk_app_users_role;');
    const old = await createUser(t.pool, { role: 'teacher', allCommittees: true, permissions: ['manage_committees'] });
    const head = await createUser(t.pool, { role: 'committee_head', allCommittees: true, permissions: ['manage_committees'] });
    await t.pool.query(sql);
    const { rows } = await t.pool.query('SELECT id, role, all_committees, permissions FROM app_users WHERE id = ANY($1::text[]);', [[old.id, head.id]]);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[old.id]).toMatchObject({ role: 'sheikh', all_committees: false, permissions: [] });
    expect(byId[head.id]).toMatchObject({ role: 'committee_head', all_committees: true, permissions: ['manage_committees'] });
    await expect(t.pool.query("UPDATE app_users SET role = 'teacher' WHERE id = $1;", [head.id])).rejects.toThrow(/chk_app_users_role/);
  });
});
