import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../server/config.ts';
import { purgeExpired } from '../server/maintenance.ts';
import { PASSWORD, createUser, login, setupApp, testEnv, userWithToken, type TestApp } from './helpers.ts';

// Sessions (API-09, WEB-11), admin password reset with a forced change (WEB-02), config guard (API-24).

let t: TestApp;
let admin: Awaited<ReturnType<typeof userWithToken>>;
beforeAll(async () => {
  t = await setupApp();
  admin = await userWithToken(t, { role: 'super_admin' });
});
afterAll(async () => {
  await t.pool.end();
});

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const cookieFrom = (res: any): string => {
  const set: string[] = res.headers['set-cookie'] ?? [];
  const c = set.find((x) => x.startsWith('bukhari_rt='));
  return c ? c.split(';')[0] : '';
};

describe('sessions', () => {
  it('logout ends the session immediately: the access token stops working', async () => {
    const u = await createUser(t.pool, { role: 'sheikh' });
    const { token, refreshToken } = await login(t, u.phone);
    expect((await t.api().get('/api/tasks').set(bearer(token))).status).toBe(200);
    expect((await t.api().post('/api/auth/logout').set(bearer(token)).send({ refreshToken })).status).toBe(200);
    expect((await t.api().get('/api/tasks').set(bearer(token))).status).toBe(401);
    expect((await t.api().post('/api/auth/refresh').send({ refreshToken })).status).toBe(401);
  });

  it('reusing a rotated refresh token revokes the whole session, including the newer token', async () => {
    const u = await createUser(t.pool, { role: 'sheikh' });
    const { refreshToken } = await login(t, u.phone);
    const first = await t.api().post('/api/auth/refresh').send({ refreshToken });
    expect(first.status).toBe(200);
    expect((await t.api().post('/api/auth/refresh').send({ refreshToken })).status).toBe(401);
    expect((await t.api().post('/api/auth/refresh').send({ refreshToken: first.body.refreshToken })).status).toBe(401);
    expect((await t.api().get('/api/tasks').set(bearer(first.body.token))).status).toBe(401);
  });

  it('the web gets its refresh token only as an HttpOnly cookie', async () => {
    const u = await createUser(t.pool, { role: 'sheikh' });
    const res = await t.api().post('/api/auth/login').set('X-Client', 'web').send({ identifier: u.phone, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeUndefined();
    const raw = (res.headers['set-cookie'] as unknown as string[]).find((x) => x.startsWith('bukhari_rt='))!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    expect(raw).toMatch(/Path=\/api\/auth/);
    // The cookie alone (without the X-Client header) is not accepted: CSRF protection.
    expect((await t.api().post('/api/auth/refresh').set('Cookie', cookieFrom(res)).send({})).status).toBe(401);
  });

  it('two web tabs refreshing with the same cookie both keep a valid session', async () => {
    const u = await createUser(t.pool, { role: 'sheikh' });
    const res = await t.api().post('/api/auth/login').set('X-Client', 'web').send({ identifier: u.phone, password: PASSWORD });
    const cookie = cookieFrom(res);
    const [a, b] = await Promise.all([
      t.api().post('/api/auth/refresh').set('X-Client', 'web').set('Cookie', cookie).send({}),
      t.api().post('/api/auth/refresh').set('X-Client', 'web').set('Cookie', cookie).send({}),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((await t.api().get('/api/tasks').set(bearer(a.body.token))).status).toBe(200);
    expect((await t.api().get('/api/tasks').set(bearer(b.body.token))).status).toBe(200);
  });

  it('access tokens carry a session id and expire in 15 minutes by default', async () => {
    const u = await createUser(t.pool, { role: 'sheikh' });
    const { token } = await login(t, u.phone);
    const claims = jwt.decode(token) as any;
    expect(claims.sid).toBeTruthy();
    expect(claims.exp - claims.iat).toBe(15 * 60);
  });

  it('old access tokens without a session id still work until they expire', async () => {
    const u = await createUser(t.pool, { role: 'sheikh' });
    const legacy = jwt.sign({ ver: 0 }, t.config.jwtSecret, { subject: u.id, expiresIn: '5m', algorithm: 'HS256' });
    expect((await t.api().get('/api/tasks').set(bearer(legacy))).status).toBe(200);
  });

  it('the purge removes expired tokens and keeps live sessions', async () => {
    const u = await createUser(t.pool, { role: 'sheikh' });
    const { token } = await login(t, u.phone);
    await t.pool.query("UPDATE refresh_tokens SET expires_at = NOW() - interval '2 days' WHERE user_id = $1;", [admin.id]);
    const purged = await purgeExpired(t.pool);
    expect(purged.refreshTokens).toBeGreaterThan(0);
    expect((await t.api().get('/api/tasks').set(bearer(token))).status).toBe(200);
  });
});

describe('admin password reset (WEB-02)', () => {
  it('only a super admin resets passwords', async () => {
    const head = await userWithToken(t, { role: 'committee_head', permissions: ['manage_assistants'] });
    const target = await createUser(t.pool, { role: 'sheikh' });
    const res = await t.api().post(`/api/users/${target.id}/reset-password`).set(head.auth).send({ password: 'Temp12345' });
    expect(res.status).toBe(403);
  });

  it('reset signs the user out, forces a new password, then everything works again', async () => {
    const target = await createUser(t.pool, { role: 'sheikh' });
    const before = await login(t, target.phone);
    const reset = await t.api().post(`/api/users/${target.id}/reset-password`).set(admin.auth).send({ password: 'Temp12345' });
    expect(reset.status).toBe(200);
    expect((await t.api().get('/api/tasks').set(bearer(before.token))).status).toBe(401);
    expect((await t.api().post('/api/auth/refresh').send({ refreshToken: before.refreshToken })).status).toBe(401);

    const temp = await t.api().post('/api/auth/login').send({ identifier: target.phone, password: 'Temp12345' });
    expect(temp.status).toBe(200);
    expect(temp.body.mustChangePassword).toBe(true);
    const blocked = await t.api().get('/api/committees').set(bearer(temp.body.token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('password_change_required');
    expect((await t.api().get('/api/auth/me').set(bearer(temp.body.token))).status).toBe(200);

    const changed = await t.api().post('/api/auth/change-password').set(bearer(temp.body.token))
      .send({ currentPassword: 'Temp12345', newPassword: 'Mine12345' });
    expect(changed.status).toBe(200);
    expect(changed.body.mustChangePassword).toBe(false);
    expect((await t.api().get('/api/committees').set(bearer(changed.body.token))).status).toBe(200);

    const { rows } = await t.pool.query("SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'user.password_reset';", [target.id]);
    expect(rows).toHaveLength(1);
    const notes = await t.api().get('/api/notifications').set(bearer(changed.body.token));
    expect(notes.body.notifications.some((n: any) => n.title.includes('كلمة المرور'))).toBe(true);
  });

  it('a new password must differ from the current one', async () => {
    const u = await createUser(t.pool, { role: 'sheikh' });
    const { token } = await login(t, u.phone);
    const res = await t.api().post('/api/auth/change-password').set(bearer(token)).send({ currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(res.status).toBe(400);
  });
});

describe('minimum app version', () => {
  it('an Android build older than MIN_ANDROID_VERSION_CODE is told to update; newer and web clients pass', async () => {
    const { createApp } = await import('../server/app.ts');
    const request = (await import('supertest')).default;
    const app = createApp({ ...t.config, minAndroidVersionCode: 2 }, t.pool);
    const old = await request(app).get('/api/health').set('X-App-Version-Code', '1');
    expect(old.status).toBe(426);
    expect(old.body.code).toBe('app_update_required');
    expect((await request(app).get('/api/health').set('X-App-Version-Code', '2')).status).toBe(200);
    expect((await request(app).get('/api/health')).status).toBe(200);
  });
});

describe('configuration (API-24)', () => {
  it('refuses to start without a strong JWT secret outside automated tests', () => {
    expect(() => loadConfig({ NODE_ENV: 'development', DATABASE_URL: 'postgres://x' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...testEnv(), JWT_SECRET: '' })).not.toThrow();
    // Scripts that never sign tokens may run without one.
    expect(() => loadConfig({ NODE_ENV: 'development', DATABASE_URL: 'postgres://x' }, { requireSecrets: false })).not.toThrow();
  });
});
