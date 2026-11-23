import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committeeBody, seedCourse, setupApp, userWithToken, type TestApp } from './helpers.ts';

// The whole flow of docs/PLAN_ROLES_AND_FLOW.md: the admin creates a committee with its owner, sends it to the exams
// manager, allows observers; the manager staffs and activates it (only then do members hear about it); then
// «تمت المراقبة», the admin's accreditation, the ceremony and its sheikhs.

type U = Awaited<ReturnType<typeof userWithToken>>;
let t: TestApp;
let admin: U, manager: U, owner: U, obsA: U, obsB: U, cerA: U, cerB: U, outsider: U;
let c: any; // the committee under test
let c2: any; // another committee on the same day

const DAY = '2026-12-10';
const inbox = async (u: U) =>
  ((await t.api().get('/api/notifications').set(u.auth)).body.notifications as any[]).map((n) => `${n.title} | ${n.description}`);
const step = (u: U, id: string, to: string) => t.api().post(`/api/committees/${id}/lifecycle`).set(u.auth).send({ to });
const addStaff = (u: U, id: string, body: Record<string, unknown>) => t.api().post(`/api/committees/${id}/staff`).set(u.auth).send(body);
const people = (u: U, id: string) => t.api().get(`/api/committees/${id}/people`).set(u.auth);

beforeAll(async () => {
  t = await setupApp();
  await seedCourse(t.pool);
  admin = await userWithToken(t, { role: 'admin' });
  manager = await userWithToken(t, { role: 'exams_manager', name: 'مدير الحفلات' });
  owner = await userWithToken(t, { role: 'committee_head', name: 'شيخ اللجنة', phone: '01011112222' });
  obsA = await userWithToken(t, { role: 'sheikh', name: 'مراقب أ' });
  obsB = await userWithToken(t, { role: 'sheikh', name: 'مراقب ب' });
  cerA = await userWithToken(t, { role: 'sheikh', name: 'شيخ حفل أ' });
  cerB = await userWithToken(t, { role: 'sheikh', name: 'شيخ حفل ب' });
  outsider = await userWithToken(t, { role: 'sheikh', name: 'غريب' });
});
afterAll(async () => {
  await t.pool.end();
});

describe('creation and sending (admin)', () => {
  it('only an admin creates a committee; it starts as a draft with its owner, who hears nothing yet', async () => {
    expect((await t.api().post('/api/committees').set(manager.auth).send(committeeBody({ committeeNumber: 1 }))).status).toBe(403);
    const res = await t.api().post('/api/committees').set(admin.auth)
      .send(committeeBody({ committeeNumber: 1, examDate: DAY, sheikhCountry: 'مسجد النور', ownerUserId: owner.id }));
    expect(res.status).toBe(200);
    c = res.body.committee;
    expect(c.lifecycle).toBe('draft');
    expect((await t.api().get(`/api/committees/${c.id}`).set(owner.auth)).status).toBe(404);
    expect((await t.api().get(`/api/committees/${c.id}`).set(manager.auth)).status).toBe(404);
    expect((await inbox(owner)).length).toBe(0);
  });

  it('steps go one at a time, each by its person', async () => {
    expect((await step(manager, c.id, 'sent_to_manager')).status).toBe(404); // the manager does not see a draft
    expect((await step(admin, c.id, 'active')).status).toBe(400); // no skipping
    expect((await step(owner, c.id, 'sent_to_manager')).status).toBe(404);
  });

  it('sending tells the exams manager, who now sees the committee', async () => {
    const res = await step(admin, c.id, 'sent_to_manager');
    expect(res.status).toBe(200);
    expect(res.body.committee.lifecycle).toBe('sent_to_manager');
    expect((await inbox(manager)).some((m) => m.startsWith('لجنة جديدة: لجنة 1') && m.includes(DAY) && m.includes('مسجد النور'))).toBe(true);
    expect((await t.api().get(`/api/committees/${c.id}`).set(manager.auth)).status).toBe(200);
    expect(((await t.api().get('/api/committees').set(manager.auth)).body.committees as any[]).map((x) => x.id)).toContain(c.id);
  });

  it('observers wait for the admin to allow them', async () => {
    const early = await addStaff(manager, c.id, { userId: obsA.id, role: 'observer' });
    expect(early.status).toBe(403);
    expect((await step(manager, c.id, 'observers_open')).status).toBe(403); // the admin's step
    expect((await step(admin, c.id, 'observers_open')).status).toBe(200);
    expect((await inbox(manager)).some((m) => m.startsWith('الأدمن سمح لك بإضافة مراقبين في لجنة 1'))).toBe(true);
  });
});

describe('staffing and activation (exams manager)', () => {
  it('the manager adds observers and the driver; nobody is told before activation', async () => {
    expect((await addStaff(manager, c.id, { userId: obsA.id, role: 'observer' })).status).toBe(201);
    expect((await addStaff(manager, c.id, { userId: obsB.id, role: 'observer' })).status).toBe(201);
    expect((await addStaff(manager, c.id, { userId: obsA.id, role: 'observer' })).status).toBe(409); // already there
    const driver = await t.api().patch(`/api/committees/${c.id}/driver`).set(manager.auth).send({ hasDriver: true, name: 'عم سيد', phone: '01099998888' });
    expect(driver.status).toBe(200);
    expect(driver.body.committee.driver).toEqual({ name: 'عم سيد', phone: '01099998888' });
    expect((await inbox(obsA)).length).toBe(0);
    expect((await t.api().get(`/api/committees/${c.id}`).set(obsA.auth)).status).toBe(404);
    expect((await t.api().get('/api/auth/me').set(obsA.auth)).body.permissions.committeeScope).toEqual([]);
  });

  it('activation releases every held notice with the details each person needs', async () => {
    const res = await step(manager, c.id, 'active');
    expect(res.status).toBe(200);
    const forOwner = await inbox(owner);
    expect(forOwner.some((m) => m.startsWith('تم إسناد لجنة 1') && m.includes('عدد المراقبين: 2'))).toBe(true);
    const forA = (await inbox(obsA)).find((m) => m.startsWith('تم تكليفك بالمراقبة في لجنة 1'))!;
    expect(forA).toBeTruthy();
    for (const part of ['مسجد النور', DAY, 'شيخ اللجنة: شيخ اللجنة', '1011112222', 'مراقب ب', 'عم سيد', '01099998888']) {
      expect(forA, part).toContain(part);
    }
    const seen = await t.api().get(`/api/committees/${c.id}`).set(obsA.auth);
    expect(seen.status).toBe(200);
    // No ceremony yet: no ceremony details (older screens read a ceremony's lists when they are present).
    expect(seen.body.committee.ceremonyDetails).toBeUndefined();
    expect((await t.api().get(`/api/committees/${c.id}`).set(admin.auth)).body.committee.ceremonyDetails).toBeUndefined();
    expect((await t.api().get('/api/auth/me').set(owner.auth)).body.permissions.staff).toEqual([
      expect.objectContaining({ committeeId: c.id, role: 'owner', canAssign: false, lifecycle: 'active' }),
    ]);
  });

  it('a person added after activation is told at once, and the owner hears who joined', async () => {
    const late = await userWithToken(t, { role: 'sheikh', name: 'مراقب متأخر' });
    expect((await addStaff(manager, c.id, { userId: late.id, role: 'observer' })).status).toBe(201);
    expect((await inbox(late)).some((m) => m.startsWith('تم تكليفك بالمراقبة في لجنة 1'))).toBe(true);
    expect((await inbox(owner)).some((m) => m.startsWith('انضم مراقب إلى لجنة 1') && m.includes('مراقب متأخر'))).toBe(true);
  });
});

describe('the owner is a supervisor unless given the right to assign', () => {
  it('cannot staff without can_assign; the manager gives it and the owner is told', async () => {
    expect((await addStaff(owner, c.id, { userId: outsider.id, role: 'observer' })).status).toBe(403);
    expect((await t.api().patch(`/api/committees/${c.id}/owner/can-assign`).set(owner.auth).send({ value: true })).status).toBe(403);
    expect((await t.api().patch(`/api/committees/${c.id}/owner/can-assign`).set(manager.auth).send({ value: true })).status).toBe(200);
    expect((await inbox(owner)).some((m) => m.startsWith('يمكنك الآن تعيين المراقبين ومشايخ الحفلة في لجنة 1'))).toBe(true);
    const added = await addStaff(owner, c.id, { userId: outsider.id, role: 'observer' });
    expect(added.status).toBe(201);
    expect((await t.api().delete(`/api/committees/${c.id}/staff/${added.body.staff.id}`).set(owner.auth)).status).toBe(200);
    expect((await t.api().patch(`/api/committees/${c.id}/owner/can-assign`).set(manager.auth).send({ value: false })).status).toBe(200);
  });

  it('only the admin changes the owner', async () => {
    expect((await t.api().put(`/api/committees/${c.id}/owner`).set(manager.auth).send({ userId: outsider.id })).status).toBe(403);
  });
});

describe('who sees whom on the committee', () => {
  it('observers see observers and the owner (with phone), not each other\'s phones; outsiders see nothing', async () => {
    const res = await people(obsA, c.id);
    expect(res.status).toBe(200);
    expect(res.body.viewer).toBe('observer');
    expect(res.body.owner).toMatchObject({ name: 'شيخ اللجنة', phone: '01011112222' });
    expect(res.body.observers.map((o: any) => o.name)).toEqual(expect.arrayContaining(['مراقب أ', 'مراقب ب']));
    expect(res.body.observers.every((o: any) => !('phone' in o))).toBe(true);
    expect(res.body.observers.every((o: any) => o.userId === obsA.id || o.note === undefined)).toBe(true);
    expect(res.body.driver).toEqual({ name: 'عم سيد', phone: '01099998888' });
    expect((await people(outsider, c.id)).status).toBe(404);
  });

  it('the manager and the owner see everyone', async () => {
    expect((await people(manager, c.id)).body.viewer).toBe('manager');
    expect((await people(owner, c.id)).body.viewer).toBe('owner');
  });
});

describe('same-day conflicts warn, and the note reaches the person', () => {
  it('a second committee on the same day asks for confirmation, then takes the note', async () => {
    const res = await t.api().post('/api/committees').set(admin.auth)
      .send(committeeBody({ committeeNumber: 2, examDate: DAY, sheikhCountry: 'مسجد الرحمة', ownerUserId: outsider.id }));
    c2 = res.body.committee;
    await step(admin, c2.id, 'sent_to_manager');
    await step(admin, c2.id, 'observers_open');
    await step(manager, c2.id, 'active');
    const warn = await addStaff(manager, c2.id, { userId: obsA.id, role: 'observer' });
    expect(warn.status).toBe(409);
    expect(warn.body.code).toBe('schedule_conflict');
    expect(warn.body.details.conflicts[0]).toMatchObject({ committeeId: c.id, day: DAY, userName: 'مراقب أ' });
    const ok = await addStaff(manager, c2.id, { userId: obsA.id, role: 'observer', confirmConflicts: true, note: 'لجنتك هنا الساعة 4 عصرًا' });
    expect(ok.status).toBe(201);
    expect((await inbox(obsA)).some((m) => m.startsWith('تم تكليفك بالمراقبة في لجنة 2') && m.includes('ملاحظة: لجنتك هنا الساعة 4 عصرًا'))).toBe(true);
  });

  it('the availability list shows who is busy that day and with what', async () => {
    expect((await t.api().get(`/api/people/availability?date=${DAY}`).set(owner.auth)).status).toBe(403);
    const res = await t.api().get(`/api/people/availability?date=${DAY}`).set(manager.auth);
    expect(res.status).toBe(200);
    const busyA = res.body.busy.find((p: any) => p.id === obsA.id);
    expect(busyA.items.map((i: any) => i.committeeId).sort()).toEqual([c.id, c2.id].sort());
    expect(res.body.available.map((p: any) => p.id)).toContain(cerA.id);
    expect(res.body.unassigned.map((p: any) => p.id)).toContain(cerA.id);
    expect(res.body.unassigned.map((p: any) => p.id)).not.toContain(obsA.id);
  });
});

describe('excusing oneself', () => {
  it('the person excuses themself; the manager and the owner are told; nobody else may excuse for them', async () => {
    const mine = (await people(obsA, c2.id)).body.mine[0];
    expect((await t.api().post(`/api/committees/${c2.id}/staff/${mine.id}/excuse`).set(obsB.auth).send({ reason: 'x' })).status).toBe(404);
    const res = await t.api().post(`/api/committees/${c2.id}/staff/${mine.id}/excuse`).set(obsA.auth).send({ reason: 'ظرف عائلي' });
    expect(res.status).toBe(200);
    expect((await inbox(manager)).some((m) => m.startsWith('اعتذار: مراقب أ (مراقب) في لجنة 2') && m.includes('ظرف عائلي'))).toBe(true);
    expect((await inbox(outsider)).some((m) => m.startsWith('اعتذار: مراقب أ'))).toBe(true); // the owner of c2
    expect((await people(manager, c2.id)).body.excused.map((e: any) => e.userId)).toContain(obsA.id);
    expect((await t.api().get(`/api/committees/${c2.id}`).set(obsA.auth)).status).toBe(404);
  });
});

describe('after the exam: observed, accredited, ceremony', () => {
  it('«تمت المراقبة» frees the observers and tells them', async () => {
    const res = await step(manager, c.id, 'observed');
    expect(res.status).toBe(200);
    expect(res.body.committee.stages.exam.completed).toBe(true);
    expect((await inbox(obsB)).some((m) => m.startsWith('تمت المراقبة في لجنة 1'))).toBe(true);
    const avail = await t.api().get(`/api/people/availability?date=${DAY}`).set(manager.auth);
    expect(avail.body.available.map((p: any) => p.id)).toContain(obsB.id);
  });

  it('ceremony sheikhs wait for the accreditation, which is the admin\'s', async () => {
    expect((await addStaff(manager, c.id, { userId: cerA.id, role: 'ceremony_sheikh' })).status).toBe(403);
    expect((await step(manager, c.id, 'accredited')).status).toBe(403);
    const res = await step(admin, c.id, 'accredited');
    expect(res.status).toBe(200);
    expect(res.body.committee.stages.accreditation.completed).toBe(true);
    expect((await inbox(manager)).some((m) => m.startsWith('تم اعتماد لجنة 1') && m.includes('عيّن مشايخ للحفلة'))).toBe(true);
  });

  it('the manager creates the ceremony and names its sheikhs, who are told where, when and with whom', async () => {
    const cer = await t.api().post(`/api/committees/${c.id}/ceremony`).set(manager.auth)
      .send({ ceremonyDate: '2026-12-20', ceremonyTime: '7 م', ceremonyPlace: 'القاعة الكبرى', honoredStudentsCount: 8 });
    expect(cer.status).toBe(200);
    expect((await addStaff(manager, c.id, { userId: cerA.id, role: 'ceremony_sheikh' })).status).toBe(201);
    expect((await addStaff(manager, c.id, { userId: cerB.id, role: 'ceremony_sheikh' })).status).toBe(201);
    const forB = (await inbox(cerB)).find((m) => m.startsWith('تم تعيينك شيخًا لحفلة لجنة 1'))!;
    for (const part of ['القاعة الكبرى', '2026-12-20 7 م', 'المكرّمون: 8', 'شيخ حفل أ', 'عم سيد']) expect(forB, part).toContain(part);
  });

  it('ceremony sheikhs see each other, not the observers; observers do not see the ceremony sheikhs', async () => {
    const asCer = (await people(cerA, c.id)).body;
    expect(asCer.viewer).toBe('ceremony_sheikh');
    expect(asCer.ceremonySheikhs.map((s: any) => s.name).sort()).toEqual(['شيخ حفل أ', 'شيخ حفل ب']);
    expect(asCer.observers).toEqual([]);
    const asObs = (await people(obsB, c.id)).body;
    expect(asObs.ceremonySheikhs).toEqual([]);
    const committeeAsObs = (await t.api().get(`/api/committees/${c.id}`).set(obsB.auth)).body.committee;
    expect(committeeAsObs.ceremonyDetails.attendees).toEqual([]);
  });

  it('moving the ceremony tells its sheikhs and the owner (urgent)', async () => {
    await t.api().post(`/api/committees/${c.id}/ceremony`).set(manager.auth)
      .send({ ceremonyDate: '2026-12-21', ceremonyTime: '7 م', ceremonyPlace: 'القاعة الكبرى' });
    expect((await inbox(cerA)).some((m) => m.startsWith('تغيّر موعد أو مكان حفلة لجنة 1') && m.includes('2026-12-21'))).toBe(true);
    expect((await inbox(owner)).some((m) => m.startsWith('تغيّر موعد أو مكان حفلة لجنة 1'))).toBe(true);
  });

  it('every step is in the audit log, and the admin may go back one step', async () => {
    const { rows } = await t.pool.query(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'committee.lifecycle' AND entity_id = $1;`, [c.id]);
    expect(rows[0].n).toBe(5); // sent, observers allowed, active, observed, accredited
    expect((await step(manager, c.id, 'observed')).status).toBe(403);
    expect((await step(admin, c.id, 'observed')).status).toBe(200);
    expect((await step(admin, c.id, 'accredited')).status).toBe(200);
  });
});
