import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurePush, flushPushes, loadServiceAccount, type PushTransport } from '../server/push.ts';
import { setupApp, userWithToken, type TestApp } from './helpers.ts';

// Push notifications (FCM): phones register a token; every server notification is pushed to the
// phones of the people it is for; dead tokens are removed. Firebase is replaced by a fake transport.

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const account = {
  project_id: 'bukhari-test',
  client_email: 'push@bukhari-test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};

let t: TestApp;
let sent: Array<{ token: string; title: string; body?: string; data: Record<string, string> }>;
let authCalls: number;
let deadTokens: Set<string>;

const transport: PushTransport = async (url, init) => {
  if (url === 'https://oauth2.googleapis.com/token') {
    authCalls++;
    const assertion = new URLSearchParams(init.body).get('assertion')!;
    // The assertion must be signed with the service account key and ask for FCM.
    const claims = jwt.verify(assertion, publicKey.export({ type: 'spki', format: 'pem' }).toString(), { algorithms: ['RS256'] }) as any;
    expect(claims.iss).toBe(account.client_email);
    expect(claims.scope).toContain('firebase.messaging');
    return { status: 200, json: async () => ({ access_token: 'fake-access', expires_in: 3600 }) };
  }
  expect(url).toBe(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`);
  expect(init.headers.Authorization).toBe('Bearer fake-access');
  const { message } = JSON.parse(init.body);
  if (deadTokens.has(message.token)) {
    return { status: 404, json: async () => ({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }) };
  }
  sent.push({ token: message.token, title: message.notification.title, body: message.notification.body, data: message.data });
  return { status: 200, json: async () => ({ name: 'projects/x/messages/1' }) };
};

beforeAll(async () => {
  t = await setupApp();
  configurePush(t.pool, account, transport);
});
afterAll(async () => {
  configurePush(t.pool, undefined);
  await t.pool.end();
});
beforeEach(async () => {
  sent = [];
  authCalls = 0;
  deadTokens = new Set();
  await t.pool.query('DELETE FROM device_tokens;');
});

const token = () => `fcm-${crypto.randomUUID()}-token`;

describe('push notifications', () => {
  it('a broadcast from the super admin reaches every registered phone', async () => {
    const admin = await userWithToken(t, { role: 'super_admin' });
    const asst = await userWithToken(t, { role: 'sheikh' });
    const pending = await userWithToken(t, { role: 'sheikh' });
    const a = token();
    const b = token();
    const c = token();
    expect((await t.api().post('/api/devices').set(admin.auth).send({ token: a })).status).toBe(200);
    expect((await t.api().post('/api/devices').set(asst.auth).send({ token: b })).status).toBe(200);
    await t.api().post('/api/devices').set(pending.auth).send({ token: c });
    // An account that is no longer approved gets nothing.
    await t.pool.query("UPDATE app_users SET status = 'rejected' WHERE id = $1;", [pending.id]);

    const res = await t.api().post('/api/notifications').set(admin.auth).send({ title: 'اجتماع عاجل', description: 'بعد العصر', type: 'urgent' });
    expect(res.status).toBe(201);
    await flushPushes();
    expect(sent.map((s) => s.token).sort()).toEqual([a, b].sort());
    expect(sent[0]).toMatchObject({ title: 'اجتماع عاجل', body: 'بعد العصر', data: { type: 'urgent' } });
  });

  it('a targeted notification reaches only that user, and the access token is reused', async () => {
    const admin = await userWithToken(t, { role: 'super_admin' });
    const head = await userWithToken(t, { role: 'committee_head', permissions: ['calendar_schedule'] });
    const asst = await userWithToken(t, { role: 'sheikh' });
    const headToken = token();
    const asstToken = token();
    await t.api().post('/api/devices').set(head.auth).send({ token: headToken });
    await t.api().post('/api/devices').set(asst.auth).send({ token: asstToken });

    const res = await t.api().post('/api/tasks').set(admin.auth).send({
      id: `task-${crypto.randomUUID()}`, title: 'تسليم الكشوف', date: '2026-10-20', type: 'delivery', priority: 'urgent', assignedAssistantId: asst.id,
    });
    expect(res.status).toBe(200);
    await flushPushes();
    expect(sent.map((s) => s.token)).toEqual([asstToken]);
    expect(sent[0].title).toBe('مهمة جديدة مسندة إليك');
    expect(authCalls).toBeLessThanOrEqual(1);
  });

  it('removes tokens Firebase no longer accepts, and the token moves with the signed-in account', async () => {
    const admin = await userWithToken(t, { role: 'super_admin' });
    const first = await userWithToken(t, { role: 'sheikh' });
    const second = await userWithToken(t, { role: 'sheikh' });
    const shared = token();
    const dead = token();
    await t.api().post('/api/devices').set(first.auth).send({ token: shared });
    await t.api().post('/api/devices').set(first.auth).send({ token: dead });
    // The same phone signs in as another account: notifications for the first stop.
    await t.api().post('/api/devices').set(second.auth).send({ token: shared });
    const { rows } = await t.pool.query('SELECT user_id FROM device_tokens WHERE token = $1;', [shared]);
    expect(rows[0].user_id).toBe(second.id);

    deadTokens.add(dead);
    await t.api().post('/api/notifications').set(admin.auth).send({ title: 'تنبيه', description: '' });
    await flushPushes();
    const { rows: left } = await t.pool.query('SELECT token FROM device_tokens;');
    expect(left.map((r) => r.token)).toEqual([shared]);
  });

  it('signing out (or unregistering) stops pushes to that phone', async () => {
    const asst = await userWithToken(t, { role: 'sheikh' });
    const a = token();
    const b = token();
    await t.api().post('/api/devices').set(asst.auth).send({ token: a });
    await t.api().post('/api/devices').set(asst.auth).send({ token: b });
    expect((await t.api().post('/api/devices/unregister').set(asst.auth).send({ token: a })).status).toBe(200);
    expect((await t.api().post('/api/auth/logout').set(asst.auth).send({ deviceToken: b })).status).toBe(200);
    const { rows } = await t.pool.query('SELECT count(*)::int AS n FROM device_tokens WHERE user_id = $1;', [asst.id]);
    expect(rows[0].n).toBe(0);
  });

  it('a new join request notifies the super admins', async () => {
    const admin = await userWithToken(t, { role: 'super_admin' });
    const adminToken = token();
    await t.api().post('/api/devices').set(admin.auth).send({ token: adminToken });
    const res = await t.api().post('/api/auth/register').send({ name: 'متقدم جديد', phone: `05${crypto.randomInt(10_000_000, 99_999_999)}`, roleKey: 'assistant', password: 'Passw0rd-123' });
    expect(res.status).toBe(201);
    await flushPushes();
    expect(sent.some((s) => s.token === adminToken && s.title === 'طلب انضمام جديد')).toBe(true);
  });

  it('device registration needs a session', async () => {
    expect((await t.api().post('/api/devices').send({ token: token() })).status).toBe(401);
  });
});

describe('service account loading', () => {
  it('reads raw JSON or base64, and rejects incomplete credentials', () => {
    const json = JSON.stringify(account);
    expect(loadServiceAccount({ FCM_SERVICE_ACCOUNT_JSON: json })?.project_id).toBe('bukhari-test');
    expect(loadServiceAccount({ FCM_SERVICE_ACCOUNT_JSON: Buffer.from(json).toString('base64') })?.client_email).toBe(account.client_email);
    expect(loadServiceAccount({})).toBeUndefined();
    expect(() => loadServiceAccount({ FCM_SERVICE_ACCOUNT_JSON: '{"project_id":"x"}' })).toThrow(/private_key/);
  });
});
