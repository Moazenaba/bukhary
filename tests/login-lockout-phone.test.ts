import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';
import { normalizePhone } from '../server/schemas.ts';
import { PASSWORD, createUser, setupApp, testEnv, type TestApp } from './helpers.ts';

// Lockouts are per caller: people guessing a shared account's password lock only themselves out,
// and the owner still signs in. Egyptian mobiles are one account whatever the typed form.

let t: TestApp;
let behindProxy: ReturnType<typeof createApp>;
beforeAll(async () => {
  t = await setupApp();
  // The same app behind a proxy that reports each caller's address, as on Vercel.
  behindProxy = createApp(loadConfig({ ...testEnv(), TRUST_PROXY: 'true' }), t.pool);
});
afterAll(async () => {
  await t.pool.end();
});

const egyptMobile = () => `010${crypto.randomInt(10_000_000, 99_999_999)}`;
const loginFrom = (ip: string, identifier: string, password: string) =>
  request(behindProxy).post('/api/auth/login').set('X-Forwarded-For', ip).send({ identifier, password });

describe('per-caller lockout', () => {
  it('wrong guesses from one address do not lock the owner out from another', async () => {
    const u = await createUser(t.pool, { role: 'super_admin' });
    for (let i = 0; i < 3; i++) expect((await loginFrom('198.51.100.7', u.phone, 'wrong-pass1')).status).toBe(401);
    // The guesser is locked, even with the right password...
    expect((await loginFrom('198.51.100.7', u.phone, PASSWORD)).status).toBe(401);
    // ...the owner is not.
    expect((await loginFrom('203.0.113.9', u.phone, PASSWORD)).status).toBe(200);
  });

  it('many addresses together still lock the whole account', async () => {
    const u = await createUser(t.pool, { role: 'sheikh' });
    // accountLockAttempts defaults to 10 x MAX_LOGIN_ATTEMPTS (3 in tests) = 30.
    for (let i = 0; i < 30; i++) await loginFrom(`192.0.2.${i + 1}`, u.phone, 'wrong-pass1');
    expect((await loginFrom('203.0.113.50', u.phone, PASSWORD)).status).toBe(401);
  });
});

describe('phone forms', () => {
  it('normalises Egyptian mobiles and leaves other numbers alone', () => {
    expect(normalizePhone('+20 101 234 5678')).toBe('01012345678');
    expect(normalizePhone('00201012345678')).toBe('01012345678');
    expect(normalizePhone('201012345678')).toBe('01012345678');
    expect(normalizePhone('٠١٠١٢٣٤٥٦٧٨')).toBe('01012345678');
    expect(normalizePhone('0501234567')).toBe('0501234567');
    expect(normalizePhone('+966 50 123 4567')).toBe('+966501234567');
  });

  it('one number is one join request, and signs in with either form', async () => {
    const local = egyptMobile();
    const intl = `+2${local}`;
    const first = await t.api().post('/api/auth/register').send({ name: 'متقدم', phone: intl, password: 'Passw0rd-123' });
    expect(first.status).toBe(201);
    const { rows } = await t.pool.query('SELECT phone FROM app_users WHERE request_code = $1;', [first.body.requestCode]);
    expect(rows[0].phone).toBe(local);

    const again = await t.api().post('/api/auth/register').send({ name: 'متقدم', phone: local, password: 'Passw0rd-123' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('join_request_pending');

    await t.pool.query("UPDATE app_users SET status = 'approved' WHERE phone = $1;", [local]);
    expect((await t.api().post('/api/auth/login').send({ identifier: intl, password: 'Passw0rd-123' })).status).toBe(200);
    expect((await t.api().post('/api/auth/login').send({ identifier: local, password: 'Passw0rd-123' })).status).toBe(200);
    const exists = await t.api().post('/api/auth/register').send({ name: 'متقدم', phone: local, password: 'Passw0rd-123' });
    expect(exists.body.code).toBe('account_exists');
  });

  it('migration 014 rewrites stored phones to the local form unless that number is taken', async () => {
    const taken = egyptMobile();
    const free = egyptMobile();
    const owner = await createUser(t.pool, { role: 'sheikh', phone: taken });
    const duplicate = await createUser(t.pool, { role: 'sheikh', phone: `+2${taken}` });
    const other = await createUser(t.pool, { role: 'sheikh', phone: `0020 ${free.slice(1)}` });
    const sql = fs.readFileSync(path.resolve('migrations/014_login_failures_phone_form.sql'), 'utf8');
    await t.pool.query(sql.slice(sql.indexOf('WITH canon')));
    const { rows } = await t.pool.query('SELECT id, phone FROM app_users WHERE id = ANY($1);', [[owner.id, duplicate.id, other.id]]);
    const phone = Object.fromEntries(rows.map((r) => [r.id, r.phone]));
    expect(phone[owner.id]).toBe(taken);
    expect(phone[duplicate.id]).toBe(`+2${taken}`);
    expect(phone[other.id]).toBe(free);
  });

  it('an older account stored as +20… still signs in with what its owner types', async () => {
    const local = egyptMobile();
    const u = await createUser(t.pool, { role: 'sheikh', phone: `+2${local}` });
    expect((await t.api().post('/api/auth/login').send({ identifier: u.phone, password: PASSWORD })).status).toBe(200);
    expect((await t.api().post('/api/auth/login').send({ identifier: local, password: PASSWORD })).status).toBe(200);
  });
});
