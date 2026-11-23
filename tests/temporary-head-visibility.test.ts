import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committeeBody, seedCourse, setupApp, userWithToken, type TestApp } from './helpers.ts';

// A «شيخ اللجنة» grant must work everywhere a committee head's committee works: in the list of committees,
// in the tasks of that committee, and in its notices. A bug here shows up as «the committee vanished».
let t: TestApp;
let admin: Awaited<ReturnType<typeof userWithToken>>;
let sheikh: Awaited<ReturnType<typeof userWithToken>>;
let c1: any;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  t = await setupApp();
  await seedCourse(t.pool);
  admin = await userWithToken(t, { role: 'admin' });
  const res = await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: 41 }));
  c1 = res.body.committee;
  sheikh = await userWithToken(t, { role: 'sheikh', committeeIds: [] });
  const g = await t.api().post('/api/grants').set(admin.auth).send({ userId: sheikh.id, committeeIds: [c1.id], startsOn: day(-1), endsOn: day(5) });
  expect(g.status).toBe(201);
});
afterAll(async () => {
  await t.pool.end();
});

describe('a grant shows the committee to its holder', () => {
  it('the committee is in the holder\'s list of committees', async () => {
    const res = await t.api().get('/api/committees').set(sheikh.auth);
    expect(res.status).toBe(200);
    const ids = (res.body.committees ?? []).map((c: any) => c.id);
    expect(ids).toContain(c1.id);
  });

  it('the tasks of that committee are in the holder\'s tasks', async () => {
    await t.api().post('/api/tasks').set(admin.auth).send({ id: 'task-vis-1', title: 'تسليم الأوراق', date: day(1), committeeId: c1.id, type: 'general' });
    const res = await t.api().get('/api/tasks').set(sheikh.auth);
    expect(res.status).toBe(200);
    expect((res.body.tasks ?? []).some((x: any) => x.title === 'تسليم الأوراق')).toBe(true);
  });
});

describe('an observer assigned after a ceremony is done keeps the assignment', () => {
  it('a new observer on a committee whose ceremony already ended is not ended by the sweep', async () => {
    const c2 = await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: 42 }));
    const committee2 = c2.body.committee;
    await t.pool.query(`UPDATE committees SET stages = jsonb_set(COALESCE(stages, '{}'::jsonb), '{ceremony}', '{"completed": true}') WHERE id = $1;`, [committee2.id]);
    const observer = await userWithToken(t, { role: 'sheikh', committeeIds: [] });
    const a = await t.api().post('/api/assignments').set(admin.auth).send({ userId: observer.id, committeeId: committee2.id, task: 'exam', startsOn: day(0), endsOn: day(3) });
    expect(a.status).toBe(201);
    // Any read runs the sweep; the new observer must still be active.
    await t.api().get('/api/grants').set(admin.auth);
    const { rows } = await t.pool.query('SELECT status FROM committee_staff WHERE id = $1;', [a.body.assignment.id]);
    expect(rows[0].status).toBe('active');
  });
});

describe('the ceremony done through the committee action ends the grant and its observers', () => {
  it('POST /committees/:id/actions completeStage ceremony removes «شيخ اللجنة» on that committee', async () => {
    const c3 = (await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: 43 }))).body.committee;
    // Every stage before the ceremony is done (the order rule), so the ceremony can be completed.
    await t.pool.query(`UPDATE committees SET stages = (SELECT jsonb_object_agg(k, '{"completed": true}'::jsonb) FROM unnest(ARRAY['registration','exam','scoring','aggregation','review','sheet','accreditation','announcement']) k) WHERE id = $1;`, [c3.id]);
    const holder = await userWithToken(t, { role: 'sheikh', committeeIds: [] });
    const g = await t.api().post('/api/grants').set(admin.auth).send({ userId: holder.id, committeeIds: [c3.id], startsOn: day(-1), endsOn: day(5) });
    expect(g.status).toBe(201);
    const act = await t.api().post(`/api/committees/${c3.id}/actions`).set(admin.auth).send({ action: { type: 'completeStage', stage: 'ceremony' } });
    expect(act.status).toBe(200);
    const row = await t.pool.query('SELECT status FROM committee_head_grants WHERE id = $1;', [g.body.grant.id]);
    expect(row.rows[0].status).toBe('ended');
  });
});

describe('a person may observe a committee they are already on', () => {
  it('an observer assignment on one\'s own committee is accepted', async () => {
    const own = (await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: 44 }))).body.committee;
    const person = await userWithToken(t, { role: 'sheikh', committeeIds: [own.id] });
    const a = await t.api().post('/api/assignments').set(admin.auth).send({ userId: person.id, committeeId: own.id, task: 'exam', startsOn: day(0), endsOn: day(3) });
    expect(a.status).toBe(201);
  });
});

