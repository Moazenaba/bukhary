import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committeeBody, createUser, seedCourse, setupApp, userWithToken, type TestApp } from './helpers.ts';

// Ceremony attendees: people added to a ceremony are notified with its details, see it in the
// committee's ceremony details, and are told when the time or place changes or they are removed.

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

const committee = async (n: number) => {
  const res = await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: n }));
  expect(res.status).toBe(200);
  return res.body.committee as any;
};
const schedule = (id: string, action: Record<string, unknown>) =>
  t.api().post(`/api/committees/${id}/actions`).set(admin.auth).send({ action: { type: 'scheduleCeremony', ...action } });
const inbox = async (auth: Record<string, string>) =>
  ((await t.api().get('/api/notifications').set(auth)).body.notifications as any[]).map((n) => `${n.title} | ${n.description}`);

describe('ceremony attendees', () => {
  it('adding a person notifies them with the ceremony details and records their name', async () => {
    const c = await committee(41);
    const teacher = await userWithToken(t, { role: 'teacher', name: 'الشيخ محمد' });
    const res = await schedule(c.id, { ceremonyDate: '2026-11-05', ceremonyTime: '8 م', ceremonyPlace: 'القاعة الكبرى', attendeeUserIds: [teacher.id] });
    expect(res.status).toBe(200);
    expect(res.body.committee.ceremonyDetails.attendees).toEqual([{ id: teacher.id, name: 'الشيخ محمد' }]);
    const mine = await inbox(teacher.auth);
    expect(mine.some((m) => m.startsWith('تمت إضافتك لحفل تكريم لجنة 41') && m.includes('2026-11-05 8 م — القاعة الكبرى'))).toBe(true);
    // Only the person added gets the personal notice.
    const other = await userWithToken(t, { role: 'assistant' });
    expect((await inbox(other.auth)).some((m) => m.startsWith('تمت إضافتك'))).toBe(false);
  });

  it('a new time notifies those still invited; removed people are told; others are not re-notified', async () => {
    const c = await committee(42);
    const a = await userWithToken(t, { role: 'assistant', name: 'أحمد' });
    const b = await userWithToken(t, { role: 'assistant', name: 'بكر' });
    await schedule(c.id, { ceremonyDate: '2026-11-06', attendeeUserIds: [a.id, b.id] });
    await schedule(c.id, { ceremonyDate: '2026-11-07', attendeeUserIds: [a.id] });
    const forA = await inbox(a.auth);
    expect(forA.filter((m) => m.startsWith('تمت إضافتك')).length).toBe(1);
    expect(forA.some((m) => m.startsWith('تغيّر موعد حفل تكريم لجنة 42') && m.includes('2026-11-07'))).toBe(true);
    expect((await inbox(b.auth)).some((m) => m.startsWith('تم إلغاء إضافتك لحفل تكريم لجنة 42'))).toBe(true);
  });

  it('saving without attendeeUserIds, or saving the committee, keeps the attendees', async () => {
    const c = await committee(43);
    const a = await userWithToken(t, { role: 'assistant', name: 'خالد' });
    await schedule(c.id, { ceremonyDate: '2026-11-08', attendeeUserIds: [a.id] });
    const res = await schedule(c.id, { ceremonyDate: '2026-11-08', notes: 'تجهيز الدروع' });
    expect(res.body.committee.ceremonyDetails.attendees).toEqual([{ id: a.id, name: 'خالد' }]);
    const current = res.body.committee;
    const saved = await t.api().post('/api/committees').set(admin.auth).send({
      ...current, generalNotes: 'تعديل', ceremonyDetails: { ...current.ceremonyDetails, attendees: [] }, expectedUpdatedAt: current.updatedAt,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.committee.ceremonyDetails.attendees).toEqual([{ id: a.id, name: 'خالد' }]);
  });

  it('only approved accounts can be invited, and only ceremony schedulers list candidates', async () => {
    const c = await committee(44);
    const pending = await createUser(t.pool, { role: 'assistant', status: 'pending' });
    expect((await schedule(c.id, { ceremonyDate: '2026-11-09', attendeeUserIds: [pending.id] })).status).toBe(400);
    const list = await t.api().get('/api/users/ceremony-candidates').set(admin.auth);
    expect(list.status).toBe(200);
    expect(list.body.users.some((u: any) => u.id === pending.id)).toBe(false);
    const asst = await userWithToken(t, { role: 'assistant' });
    expect((await t.api().get('/api/users/ceremony-candidates').set(asst.auth)).status).toBe(403);
  });
});
