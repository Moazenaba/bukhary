import 'dotenv/config';
import { loadConfig } from '../server/config.ts';
import { createPool } from '../server/db.ts';
import { listMigrations, migrate, pendingMigrations } from '../server/migrate.ts';
import { assertLocalDatabaseOrConfirmed } from '../server/scriptGuard.ts';

// Usage:
//   npm run migrate            apply pending migrations
//   npm run migrate -- status  list applied / pending migrations without changing anything
//   npm run migrate -- --remote  allow a non-local DATABASE_URL (the release step uses migrate:prod)

async function main() {
  const config = loadConfig(process.env, { requireSecrets: false });
  assertLocalDatabaseOrConfirmed(config.databaseUrl);
  const pool = createPool(config);
  try {
    if (process.argv[2] === 'status') {
      const pending = new Set((await pendingMigrations(pool)).map((m) => m.name));
      for (const m of listMigrations()) console.log(`${pending.has(m.name) ? 'pending ' : 'applied '} ${m.name}`);
      return;
    }
    const applied = await migrate(pool, undefined, (msg) => console.log(msg));
    console.log(applied.length ? `Applied ${applied.length} migration(s).` : 'Database is up to date.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
