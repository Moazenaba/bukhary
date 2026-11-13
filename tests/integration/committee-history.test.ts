import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committeeBody, seedCourse, setupApp, userWithToken, type TestApp } from '../helpers.ts';

let t: TestApp;
beforeAll(async () => {
  t = await setupApp();
  await seedCourse(t.pool);
});
afterAll(async () => {
  await t.pool.end();
});

describe('committee history', () => {
  it("a committee's own head sees what changed and when; admin names show as «الإدارة»; others see nothing", async () => {
    const sa = await userWithToken(t, { role: 'super_admin', name: 'المشرف العام' });
    const admin = await userWithToken(t, { role: 'admin', name: 'أدمن فلان' });
    const c = (await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: 4, sheikhName: 'الشيخ أ' }))).body.committee;
    const head = await userWithToken(t, { role: 'committee_head', committeeIds: [c.id], name: 'رئيس اللجنة' });
    const other = await userWithToken(t, { role: 'committee_head', committeeIds: [], name: 'رئيس آخر' });
    await t.api().post('/api/committees').set(head.auth)
      .send({ ...committeeBody({ id: c.id, committeeNumber: 4, sheikhName: 'الشيخ ب', examDate: '2026-12-01' }), expectedUpdatedAt: c.updatedAt });
    await t.api().post(`/api/committees/${c.id}/actions`).set(head.auth).send({ action: { type: 'completeStage', stage: 'registration' } });

    const mine = (await t.api().get(`/api/committees/${c.id}/history`).set(head.auth)).body.history;
    expect(mine[0].by).toBe('رئيس اللجنة');
    expect(mine[0].changes).toContainEqual({ field: 'stages.registration', before: false, after: true });
    expect(mine[1].changes).toEqual(expect.arrayContaining([
      { field: 'sheikhName', before: 'الشيخ أ', after: 'الشيخ ب' },
      { field: 'examDate', before: null, after: '2026-12-01' },
    ]));
    expect(mine.at(-1)).toMatchObject({ by: 'الإدارة', action: 'committee.create' });
    expect(JSON.stringify(mine)).not.toContain('أدمن فلان');

    const forSuper = (await t.api().get(`/api/committees/${c.id}/history`).set(sa.auth)).body.history;
    expect(forSuper.at(-1).by).toBe('أدمن فلان');

    expect((await t.api().get(`/api/committees/${c.id}/history`).set(other.auth)).status).toBe(404);
  });
});
