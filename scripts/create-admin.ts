import 'dotenv/config';
import { createFirstSuperAdmin } from '../server/bootstrapAdmin.ts';
import { loadConfig } from '../server/config.ts';
import { createPool } from '../server/db.ts';
import { pendingMigrations } from '../server/migrate.ts';
import { assertLocalDatabaseOrConfirmed } from '../server/scriptGuard.ts';
import { passwordSchema, phoneSchema, emailSchema } from '../server/routes/users.ts';

// One-time bootstrap of the first super admin. Reads ADMIN_NAME, ADMIN_PHONE,
// ADMIN_PASSWORD and optional ADMIN_EMAIL from the environment, so no password
// is ever written in code or SQL. Refuses to run if a real approved super admin exists
// (legacy demo accounts that still have their published password do not count).

async function main() {
  const name = (process.env.ADMIN_NAME || '').trim();
  if (!name) throw new Error('ADMIN_NAME is required.');
  const phone = phoneSchema.parse(process.env.ADMIN_PHONE || '');
  const email = emailSchema.parse(process.env.ADMIN_EMAIL || null);
  const password = passwordSchema.parse(process.env.ADMIN_PASSWORD || '');
  if (password.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters for the super admin.');

  const config = loadConfig(process.env, { requireSecrets: false });
  assertLocalDatabaseOrConfirmed(config.databaseUrl);
  const pool = createPool(config);
  try {
    const pending = await pendingMigrations(pool);
    if (pending.length > 0) {
      throw new Error(`Run the database migrations first (pending: ${pending.map((m) => m.name).join(', ')}).`);
    }
    const id = await createFirstSuperAdmin(pool, { name, phone, email, password });
    console.log(`Super admin created (id ${id}). Log in with phone ${phone}.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
