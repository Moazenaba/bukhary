import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committeeBody, seedCourse, setupApp, userWithToken, type TestApp } from './helpers.ts';

let t: TestApp;
let admin: Awaited<ReturnType<typeof userWithToken>>;
beforeAll(async () => {
  t = await setupApp();
  await seedCourse(t.pool);
  admin = await userWithToken(t, { role: 'super_admin' });
  for (const n of [1, 2, 3]) {
    const res = await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: n }));
    expect(res.status).toBe(200);
  }
});
afterAll(async () => {
  await t.pool.end();
});

describe('paged lists', () => {
  it('return the full list when no limit is given (existing clients)', async () => {
    const res = await t.api().get('/api/committees').set(admin.auth);
    expect(res.body.committees).toHaveLength(3);
    expect(res.body.total).toBeNull();
    expect(res.body.hasMore).toBe(false);
  });

  it('page with limit and offset, in committee-number order', async () => {
    const first = await t.api().get('/api/committees?limit=2').set(admin.auth);
    expect(first.body.committees.map((c: any) => c.committeeNumber)).toEqual([1, 2]);
    expect(first.body.total).toBe(3);
    expect(first.body.hasMore).toBe(true);

    const last = await t.api().get('/api/committees?limit=2&offset=2').set(admin.auth);
    expect(last.body.committees.map((c: any) => c.committeeNumber)).toEqual([3]);
    expect(last.body.hasMore).toBe(false);
  });

  it('reject a limit above 500', async () => {
    const res = await t.api().get('/api/committees?limit=501').set(admin.auth);
    expect(res.status).toBe(400);
  });

  it('tasks page the same way', async () => {
    const res = await t.api().get('/api/tasks?limit=5').set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.tasks).toEqual([]);
    expect(res.body.total).toBe(0);
  });
});
