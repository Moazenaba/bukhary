import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, createUser, login, setupApp, type TestApp } from './helpers.ts';

let t: TestApp;
beforeAll(async () => {
  t = await setupApp();
});
afterAll(async () => {
  await t.pool.end();
});

describe('login', () => {
  it('logs in an approved user by phone and returns access + refresh tokens without the password', async () => {
    const u = await createUser(t.pool, { role: 'sheikh' });
    const res = await t.api().post('/api/auth/login').send({ identifier: u.phone, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.id).toBe(u.id);
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('gives the same message for unknown users and wrong passwords', async () => {
    const u = await createUser(t.pool, { role: 'sheikh' });
    const wrong = await t.api().post('/api/auth/login').send({ identifier: u.phone, password: 'nope-123456' });
    const unknown = await t.api().post('/api/auth/login').send({ identifier: '0500000000', password: 'nope-123456' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('does not reveal a pending account before the password is correct', async () => {
    const u = await createUser(t.pool, { role: 'sheikh', status: 'pending' });
    const bad = await t.api().post('/api/auth/login').send({ identifier: u.phone, password: 'wrong-pass1' });
    expect(bad.status).toBe(401);
    const good = await t.api().post('/api/auth/login').send({ identifier: u.phone, password: PASSWORD });
    expect(good.status).toBe(403);
    expect(good.body.code).toBe('account_pending');
  });

  it('locks the account after repeated failures, even with the right password, without revealing it (API-22)', async () => {
    const u = await createUser(t.pool, { role: 'sheikh' });
    for (let i = 0; i < 3; i++) await t.api().post('/api/auth/login').send({ identifier: u.phone, password: 'wrong-pass1' });
    const res = await t.api().post('/api/auth/login').send({ identifier: u.phone, password: PASSWORD });
    const unknown = await t.api().post('/api/auth/login').send({ identifier: '0599999999', password: PASSWORD });
    expect(res.status).toBe(401);
    // Same answer as for an account that does not exist.
    expect(res.body.message).toBe(unknown.body.message);
    expect(res.body.code).toBe(unknown.body.code);
  });

  it('starts a fresh failure count once a lock has run out', async () => {
    const u = await createUser(t.pool, { role: 'sheikh' });
    await t.pool.query("UPDATE app_users SET failed_login_count = 3, locked_until = NOW() - interval '1 minute' WHERE id = $1;", [u.id]);
    await t.api().post('/api/auth/login').send({ identifier: u.phone, password: 'wrong-pass1' });
    const { rows } = await t.pool.query('SELECT failed_login_count, locked_until FROM app_users WHERE id = $1;', [u.id]);
    expect(rows[0]).toEqual({ failed_login_count: 1, locked_until: null });
    const ok = await t.api().post('/api/auth/login').send({ identifier: u.phone, password: PASSWORD });
    expect(ok.status).toBe(200);
  });

  it('records failed logins and lockouts in the audit log (API-32)', async () => {
    const u = await createUser(t.pool, { role: 'sheikh' });
    for (let i = 0; i < 3; i++) await t.api().post('/api/auth/login').send({ identifier: u.phone, password: 'wrong-pass1' });
    const { rows } = await t.pool.query("SELECT action FROM audit_logs WHERE entity = 'auth' AND entity_id = $1 ORDER BY created_at;", [u.id]);
    expect(rows.map((r) => r.action)).toEqual(['auth.login_failed', 'auth.login_failed', 'auth.locked']);
  });
});

describe('sessions', () => {
  it('rejects a token once the user is demoted or deleted (checked against the database)', async () => {
    const u = await createUser(t.pool, { role: 'committee_head', permissions: ['manage_courses'] });
    const { token } = await login(t, u.phone);
    const ok = await t.api().get('/api/courses').set('Authorization', `Bearer ${token}`);
    expect(ok.status).toBe(200);
    await t.pool.query("UPDATE app_users SET status = 'rejected' WHERE id = $1;", [u.id]);
    const after = await t.api().get('/api/courses').set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);
  });

  it('rotates refresh tokens: a used refresh token cannot be reused', async () => {
    const u = await createUser(t.pool, { role: 'sheikh' });
    const { refreshToken } = await login(t, u.phone);
    const first = await t.api().post('/api/auth/refresh').send({ refreshToken });
    expect(first.status).toBe(200);
    const again = await t.api().post('/api/auth/refresh').send({ refreshToken });
    expect(again.status).toBe(401);
  });

  it('change-password requires the current password and revokes old tokens', async () => {
    const u = await createUser(t.pool, { role: 'sheikh' });
    const { token } = await login(t, u.phone);
    const auth = { Authorization: `Bearer ${token}` };
    const bad = await t.api().post('/api/auth/change-password').set(auth).send({ currentPassword: 'x', newPassword: 'NewPass123' });
    expect(bad.status).toBe(400);
    const ok = await t.api().post('/api/auth/change-password').set(auth).send({ currentPassword: PASSWORD, newPassword: 'NewPass123' });
    expect(ok.status).toBe(200);
    const old = await t.api().get('/api/tasks').set(auth);
    expect(old.status).toBe(401);
    await login(t, u.phone, 'NewPass123');
  });

  it('returns 401 JSON without a token and JSON 404 for unknown API routes', async () => {
    const res = await t.api().get('/api/committees');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    const u = await createUser(t.pool, { role: 'sheikh' });
    const { token } = await login(t, u.phone);
    const missing = await t.api().get('/api/does-not-exist').set('Authorization', `Bearer ${token}`);
    expect(missing.status).toBe(404);
    expect(missing.headers['content-type']).toContain('application/json');
  });
});

describe('registration', () => {
  it('creates a pending account with a server-generated request code that can be tracked', async () => {
    const res = await t.api().post('/api/auth/register').send({
      name: 'متقدم جديد', phone: '0511122233', email: 'new@example.com', roleKey: 'super_admin', password: 'Joiner123',
    });
    expect(res.status).toBe(201);
    expect(res.body.requestCode).toMatch(/^REQ-\d{4}-[0-9A-F]{8}$/);
    const { rows } = await t.pool.query("SELECT role, status FROM app_users WHERE phone = '0511122233';");
    // Asking for super_admin is ignored.
    expect(rows[0]).toEqual({ role: 'sheikh', status: 'pending' });
    const status = await t.api().get(`/api/auth/join-status/${res.body.requestCode}`);
    expect(status.body.status).toBe('pending');
  });

  it('rejects weak passwords and duplicate phones', async () => {
    const weak = await t.api().post('/api/auth/register').send({ name: 'ضعيف', phone: '0511122244', password: '123' });
    expect(weak.status).toBe(400);
    const dup = await t.api().post('/api/auth/register').send({ name: 'مكرر', phone: '0511122233', password: 'Joiner123' });
    expect(dup.status).toBe(409);
  });
});
