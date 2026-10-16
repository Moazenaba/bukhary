import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { Queryable } from './db.ts';
import { SYSTEM_PERMISSIONS } from './policy.ts';

/**
 * Demo accounts seeded by the old all-in-one schema with passwords that were published in the
 * project documents. Migration 007 disables them while their password was never changed through
 * the app; the same rule is used here so the bootstrap works even before that migration ran.
 */
export const LEGACY_DEMO_USER_IDS = ['user-admin', 'user-head-dosari', 'user-ast-moaz'] as const;

export interface FirstSuperAdminInput {
  name: string;
  phone: string;
  email: string | null;
  password: string;
}

/** Approved super admins that count as real: legacy demo accounts with their original password do not. */
export async function countRealSuperAdmins(db: Queryable): Promise<number> {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM app_users
     WHERE role = 'super_admin' AND status = 'approved'
       AND NOT (id = ANY($1::text[]) AND password_changed_at IS NULL);`,
    [LEGACY_DEMO_USER_IDS]
  );
  return rows[0].n;
}

/** Creates the first super admin. Refuses when a real approved super admin already exists. */
export async function createFirstSuperAdmin(db: Queryable, input: FirstSuperAdminInput): Promise<string> {
  if ((await countRealSuperAdmins(db)) > 0) {
    throw new Error('An approved super admin already exists. Manage users from the app instead.');
  }
  const id = `usr_${crypto.randomUUID()}`;
  await db.query(
    `INSERT INTO app_users (id, name, phone, email, password, role, status, assigned_committees, permissions,
       created_at, approved_at, approved_by, data, updated_at)
     VALUES ($1,$2,$3,$4,$5,'super_admin','approved','[]'::jsonb,$6,$7,$7,'bootstrap','{}'::jsonb,NOW());`,
    [id, input.name, input.phone, input.email, await bcrypt.hash(input.password, 12), JSON.stringify(SYSTEM_PERMISSIONS), new Date().toISOString()]
  );
  return id;
}
