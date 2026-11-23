import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { onCeremonyDone, sweepHeadGrants } from '../server/routes/grants.ts';
import { committeeBody, seedCourse, setupApp, userWithToken, type TestApp } from './helpers.ts';

// «شيخ اللجنة»: an admin makes a sheikh the head of a committee for a date window.
let t: TestApp;
let admin: Awaited<ReturnType<typeof userWithToken>>;
let sheikh: Awaited<ReturnType<typeof userWithToken>>;
let otherSheikh: Awaited<ReturnType<typeof userWithToken>>;
let c1: any;
let c2: any;

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const mk = async (n: number) => {
  const res = await t.api().post('/api/committees').set(admin.auth).send(committeeBody({ committeeNumber: n }));
  expect(res.status).toBe(200);
  await t.pool.query(`UPDATE committees SET lifecycle = 'active' WHERE id = $1;`, [res.body.committee.id]);
  return res.body.committee as any;
};
const grant = (body: Record<string, unknown>) => t.api().post('/api/grants').set(admin.auth).send(body);
const me = async (u: { auth: Record<string, string> }) => (await t.api().get('/api/auth/me').set(u.auth)).body;
const decide = (auth: Record<string, string>, id: string, decision: string) =>
  t.api().post(`/api/grants/${id}/decision`).set(auth).send({ decision });

beforeAll(async () => {
  t = await setupApp();
  await seedCourse(t.pool);
  admin = await userWithToken(t, { role: 'admin' });
  c1 = await mk(31);
  c2 = await mk(32);
  sheikh = await userWithToken(t, { role: 'sheikh', committeeIds: [] });
  otherSheikh = await userWithToken(t, { role: 'sheikh', committeeIds: [] });
});
afterAll(async () => {
  await t.pool.end();
});

describe('granting a temporary head', () => {
  it('an admin grants a sheikh the head of a committee for a window; the sheikh gets the head powers there only', async () => {
    const res = await grant({ userId: sheikh.id, committeeIds: [c1.id], startsOn: day(-1), endsOn: day(5) });
    expect(res.status).toBe(201);
    const perms = (await me(sheikh)).permissions;
    expect(perms.committeeScope).toEqual([c1.id]);
    expect(perms.actions['committees.update']).toBe(true);
    // Staffing is for an owner given can_assign, not for a head as such.
    expect(perms.actions['committees.members']).toBe(false);
    expect(perms.actions['users.read']).toBe(false); // a head right that is not about one committee stays out
    // Not the other committee.
    const onOther = await t.api().patch(`/api/committees/${c2.id}`).set(sheikh.auth).send({ stages: { registration: { completed: true } } });
    expect(onOther.status).toBe(403);
  });

  it('refuses a grant to a non-sheikh, to oneself, an overlapping window, or an inverted window', async () => {
    expect((await grant({ userId: admin.id, committeeIds: [c2.id], startsOn: day(0), endsOn: day(1) })).status).toBe(400);
    expect((await grant({ userId: sheikh.id, committeeIds: [c2.id], startsOn: day(3), endsOn: day(1) })).status).toBe(400);
    expect((await grant({ userId: sheikh.id, committeeIds: [c1.id], startsOn: day(0), endsOn: day(2) })).status).toBe(409);
  });

  it('only an admin may grant; a plain sheikh cannot', async () => {
    const res = await t.api().post('/api/grants').set(otherSheikh.auth).send({ userId: otherSheikh.id, committeeIds: [c2.id], startsOn: day(0), endsOn: day(1) });
    expect(res.status).toBe(403);
  });
});

describe('the ceremony decision', () => {
  it('the temporary head records a decision; a higher decider can change it, a lower one cannot', async () => {
    const list = await t.api().get('/api/grants').set(admin.auth);
    const g = list.body.grants.find((x: any) => x.userId === sheikh.id);
    expect((await decide(sheikh.auth, g.id, 'yes')).status).toBe(200);
    // The admin is above the temporary head: may decide.
    expect((await decide(admin.auth, g.id, 'no')).status).toBe(200);
    // The temporary head may no longer overwrite an admin's decision.
    expect((await decide(sheikh.auth, g.id, 'yes')).status).toBe(403);
  });

  it('a stranger cannot decide', async () => {
    const list = await t.api().get('/api/grants').set(admin.auth);
    const g = list.body.grants.find((x: any) => x.userId === sheikh.id);
    expect((await decide(otherSheikh.auth, g.id, 'yes')).status).toBe(403);
  });
});

describe('ending a grant', () => {
  it('an admin ends a grant early; the sheikh is back to a plain sheikh with no head powers', async () => {
    const list = await t.api().get('/api/grants').set(admin.auth);
    const g = list.body.grants.find((x: any) => x.userId === sheikh.id);
    const end = await t.api().post(`/api/grants/${g.id}/end`).set(admin.auth).send({});
    expect(end.status).toBe(200);
    expect(end.body.grant.status).toBe('ended');
    const perms = (await me(sheikh)).permissions;
    expect(perms.committeeScope).toEqual([]);
    expect(perms.actions['committees.members']).toBe(false);
  });
});

describe('the sweep at the end of a window', () => {
  it('an undecided grant ends on its last day and the granting admin is told; a «yes» one waits for the ceremony', async () => {
    const past = { userId: otherSheikh.id, committeeIds: [c2.id], startsOn: day(-10), endsOn: day(-1) };
    const undecided = await grant(past);
    expect(undecided.status).toBe(201);
    const yesGrant = await grant({ userId: sheikh.id, committeeIds: [c1.id], startsOn: day(-10), endsOn: day(-1) });
    expect(yesGrant.status).toBe(201);
    await decide(sheikh.auth, yesGrant.body.grant.id, 'yes');

    await sweepHeadGrants(t.pool);

    const rows = await t.pool.query('SELECT id, status FROM committee_head_grants WHERE id = ANY($1::text[]);', [[undecided.body.grant.id, yesGrant.body.grant.id]]);
    const byId = Object.fromEntries(rows.rows.map((r: any) => [r.id, r.status]));
    expect(byId[undecided.body.grant.id]).toBe('ended');
    expect(byId[yesGrant.body.grant.id]).toBe('active'); // the ceremony is not done yet

    const told = await t.pool.query("SELECT count(*)::int AS n FROM notifications WHERE target_user_id = $1 AND title = 'انتهت مدة «شيخ اللجنة»';", [admin.id]);
    expect(told.rows[0].n).toBeGreaterThan(0);
  });

  it('a «yes» grant ends once the ceremony of its committee is marked done', async () => {
    await t.pool.query(`UPDATE committees SET stages = jsonb_set(COALESCE(stages, '{}'::jsonb), '{ceremony}', '{"completed": true}') WHERE id = $1;`, [c1.id]);
    await onCeremonyDone(t.pool, c1.id);
    const { rows } = await t.pool.query("SELECT status FROM committee_head_grants WHERE user_id = $1 AND committee_ids @> $2::jsonb;", [sheikh.id, JSON.stringify([c1.id])]);
    expect(rows.every((r: any) => r.status === 'ended')).toBe(true);
  });
});

describe('who sees a grant', () => {
  it('a committee head sees the grants on their own committee, and nothing else', async () => {
    const head = await userWithToken(t, { role: 'committee_head', committeeIds: [c2.id] });
    const g = await grant({ userId: otherSheikh.id, committeeIds: [c2.id], startsOn: day(0), endsOn: day(3) });
    expect(g.status).toBe(201);
    const seen = await t.api().get('/api/grants').set(head.auth);
    expect(seen.status).toBe(200);
    expect(seen.body.grants.some((x: any) => x.id === g.body.grant.id)).toBe(true);
    expect(seen.body.grants.every((x: any) => x.committeeIds.includes(c2.id))).toBe(true);
    // And he may decide on it: the permanent head is above the temporary one.
    expect((await decide(head.auth, g.body.grant.id, 'no')).status).toBe(200);
  });
});

describe('«شيخ اللجنة» stacks with observer roles and ends per committee', () => {
  it('one person may hold it on one committee and observe another at the same time; a head\'s phone comes with each notice', async () => {
    const head = await userWithToken(t, { role: 'committee_head', committeeIds: [c1.id] });
    const person = await userWithToken(t, { role: 'sheikh', committeeIds: [] });
    const g = await grant({ userId: person.id, committeeIds: [c1.id], startsOn: day(0), endsOn: day(4) });
    expect(g.status).toBe(201);
    const obs = await t.api().post('/api/assignments').set(admin.auth).send({ userId: person.id, committeeId: c2.id, task: 'exam', startsOn: day(0), endsOn: day(4) });
    expect(obs.status).toBe(201);
    const perms = (await me(person)).permissions;
    expect(perms.committeeScope).toContain(c1.id);
    expect(perms.observing.map((o: any) => o.committeeId)).toContain(c2.id);
    // The notice for the grant names the committee's head and his phone.
    const n = await t.pool.query(
      "SELECT description FROM notifications WHERE target_user_id = $1 AND title LIKE 'تم إسنادك «شيخ اللجنة»%' ORDER BY created_at DESC LIMIT 1;",
      [person.id]
    );
    const who = await t.pool.query('SELECT name FROM app_users WHERE id = $1;', [head.id]);
    expect(n.rows[0].description).toContain(`رئيس اللجنة: ${who.rows[0].name}`);
  });

  it('a committee whose ceremony is done leaves the grant and ends its observers, and no other committee is touched', async () => {
    const person = await userWithToken(t, { role: 'sheikh', committeeIds: [] });
    const g = await grant({ userId: person.id, committeeIds: [c1.id, c2.id], startsOn: day(0), endsOn: day(4) });
    expect(g.status).toBe(201);
    await t.pool.query(`UPDATE committees SET stages = jsonb_set(COALESCE(stages, '{}'::jsonb), '{ceremony}', '{"completed": true}') WHERE id = $1;`, [c1.id]);
    await onCeremonyDone(t.pool, c1.id);
    const row = await t.pool.query('SELECT status, committee_ids FROM committee_head_grants WHERE id = $1;', [g.body.grant.id]);
    expect(row.rows[0].status).toBe('active');
    expect(row.rows[0].committee_ids).toEqual([c2.id]);
    const after = (await me(person)).permissions;
    expect(after.committeeScope).not.toContain(c1.id);
    expect(after.committeeScope).toContain(c2.id);
  });
});

