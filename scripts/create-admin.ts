import 'dotenv/config';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { loadConfig } from '../server/config.ts';
import { createPool } from '../server/db.ts';
import { passwordSchema, phoneSchema, emailSchema } from '../server/routes/users.ts';
import { SYSTEM_PERMISSIONS } from '../server/policy.ts';

// One-time bootstrap of the first super admin. Reads ADMIN_NAME, ADMIN_PHONE,
// ADMIN_PASSWORD and optional ADMIN_EMAIL from the environment, so no password
// is ever written in code or SQL. Refuses to run if an approved super admin exists.

async function main() {
  const name = (process.env.ADMIN_NAME || '').trim();
  if (!name) throw new Error('ADMIN_NAME is required.');
  const phone = phoneSchema.parse(process.env.ADMIN_PHONE || '');
  const email = emailSchema.parse(process.env.ADMIN_EMAIL || null);
  const password = passwordSchema.parse(process.env.ADMIN_PASSWORD || '');
  if (password.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters for the super admin.');

  const pool = createPool(loadConfig(process.env, { requireSecrets: false }));
  try {
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM app_users WHERE role = 'super_admin' AND status = 'approved';");
    if (rows[0].n > 0) throw new Error('An approved super admin already exists. Manage users from the app instead.');
    const id = `usr_${crypto.randomUUID()}`;
    await pool.query(
      `INSERT INTO app_users (id, name, phone, email, password, role, status, assigned_committees, permissions,
         created_at, approved_at, approved_by, data, updated_at)
       VALUES ($1,$2,$3,$4,$5,'super_admin','approved','[]'::jsonb,$6,$7,$7,'bootstrap','{}'::jsonb,NOW());`,
      [id, name, phone, email, await bcrypt.hash(password, 12), JSON.stringify(SYSTEM_PERMISSIONS), new Date().toISOString()]
    );
    console.log(`Super admin created (id ${id}). Log in with phone ${phone}.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
