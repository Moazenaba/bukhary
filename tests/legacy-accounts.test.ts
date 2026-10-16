import bcrypt from 'bcryptjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { issueRefreshToken } from '../server/auth.ts';
import { countRealSuperAdmins, createFirstSuperAdmin } from '../server/bootstrapAdmin.ts';
import { loadConfig } from '../server/config.ts';
import { createPool, type Pool } from '../server/db.ts';
import { listMigrations, migrate } from '../server/migrate.ts';
import { TEST_DB_URL, recreateDatabase, testEnv } from './helpers.ts';

// Migration 007 must disable the demo accounts of the old schema (published passwords) unless
// their password was changed through the app, and create-admin must not be blocked by them.

const DB_URL = (() => {
  const u = new URL(TEST_DB_URL);
  u.pathname = '/bukhari_legacy_accounts_test';
  return u.toString();
})();

const OLD_PASSWORD = 'Legacy-demo-pass-1';
const CHANGED_PASSWORD = 'Changed-in-app-pass-1';

let pool: Pool;
let app: ReturnType<typeof createApp>;
let adminRefreshToken: string;
let tmpDir: string;

async function insertLegacyUser(id: string, role: string, phone: string, email: string, password: string, changedInApp: boolean) {
  await pool.query(
    `INSERT INTO app_users (id, name, phone, email, password, role, status, assigned_committees, permissions, created_at, data, password_changed_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'approved', '[1]'::jsonb, '[]'::jsonb, NOW(), '{}'::jsonb, $7);`,
    [id, `${id} (legacy)`, phone, email, await bcrypt.hash(password, 4), role, changedInApp ? new Date().toISOString() : null]
  );
}

beforeAll(async () => {
  await recreateDatabase(DB_URL);
  const config = loadConfig(testEnv(DB_URL));
  pool = createPool(config);
  app = createApp(config, pool);

  // A database as it was before migration 007.
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bukhari-migrations-'));
  for (const m of listMigrations().filter((m) => m.version < '007')) fs.copyFileSync(m.file, path.join(tmpDir, path.basename(m.file)));
  await migrate(pool, tmpDir);

  await insertLegacyUser('user-admin', 'super_admin', '0501112233', 'admin', OLD_PASSWORD, false);
  await insertLegacyUser('user-head-dosari', 'committee_head', '0552223344', 'dosari@bukhari.org', CHANGED_PASSWORD, true);
  await insertLegacyUser('user-ast-moaz', 'assistant', '0553334455', 'moaz@bukhari.org', OLD_PASSWORD, false);
  adminRefreshToken = await issueRefreshToken(pool, config, 'user-admin');
});

afterAll(async () => {
  await pool.end();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('legacy demo accounts', () => {
  it('can still sign in before migration 007 (the risk being fixed)', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: 'admin', password: OLD_PASSWORD });
    expect(res.status).toBe(200);
  });

  it('migration 007 disables accounts that still have their original password', async () => {
    expect(await migrate(pool)).toEqual(['007_disable_legacy_accounts']);
    const { rows } = await pool.query(
      "SELECT id, status, password, token_version FROM app_users WHERE id IN ('user-admin','user-ast-moaz') ORDER BY id;"
    );
    for (const r of rows) {
      expect(r.status).toBe('rejected');
      expect(r.password).toBeNull();
      expect(r.token_version).toBeGreaterThan(0);
    }
    const { rows: tokens } = await pool.query("SELECT revoked_at FROM refresh_tokens WHERE user_id = 'user-admin';");
    expect(tokens.every((t) => t.revoked_at !== null)).toBe(true);
    const { rows: logs } = await pool.query("SELECT entity_id FROM audit_logs WHERE action = 'user.legacy_disabled' ORDER BY entity_id;");
    expect(logs.map((l) => l.entity_id)).toEqual(['user-admin', 'user-ast-moaz']);
  });

  it('the published credentials no longer work', async () => {
    const login = await request(app).post('/api/auth/login').send({ identifier: 'admin', password: OLD_PASSWORD });
    expect(login.status).toBe(401);
    const byPhone = await request(app).post('/api/auth/login').send({ identifier: '0553334455', password: OLD_PASSWORD });
    expect(byPhone.status).toBe(401);
    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken: adminRefreshToken });
    expect(refresh.status).toBe(401);
  });

  it('keeps legacy ids whose password was changed through the app', async () => {
    const { rows } = await pool.query("SELECT status, password FROM app_users WHERE id = 'user-head-dosari';");
    expect(rows[0].status).toBe('approved');
    expect(rows[0].password).not.toBeNull();
    const login = await request(app).post('/api/auth/login').send({ identifier: '0552223344', password: CHANGED_PASSWORD });
    expect(login.status).toBe(200);
  });

  it('re-running migrations changes nothing', async () => {
    expect(await migrate(pool)).toEqual([]);
  });
});

describe('create-admin bootstrap', () => {
  it('is not blocked by a legacy super admin that still has its original password', async () => {
    // e.g. create-admin run before migration 007, or the account re-approved by hand.
    await pool.query("UPDATE app_users SET status = 'approved' WHERE id = 'user-admin';");
    expect(await countRealSuperAdmins(pool)).toBe(0);
    const id = await createFirstSuperAdmin(pool, { name: 'Real Admin', phone: '0509998877', email: null, password: 'Real-admin-pass-1' });
    const login = await request(app).post('/api/auth/login').send({ identifier: '0509998877', password: 'Real-admin-pass-1' });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(id);
  });

  it('refuses when a real super admin exists', async () => {
    await expect(
      createFirstSuperAdmin(pool, { name: 'Second', phone: '0509998866', email: null, password: 'Another-pass-123' })
    ).rejects.toThrow(/already exists/);
  });

  it('counts a legacy super admin whose password was changed through the app as real', async () => {
    await pool.query("DELETE FROM app_users WHERE role = 'super_admin' AND id <> 'user-admin';");
    await pool.query("UPDATE app_users SET status = 'approved', password_changed_at = NOW() WHERE id = 'user-admin';");
    expect(await countRealSuperAdmins(pool)).toBe(1);
  });
});
