// Writes a compressed, restorable dump of the database to ./backups (or BACKUP_DIR).
//
//   npm run backup
//
// Needs the PostgreSQL client tools (pg_dump 17 or newer for Supabase). Set PG_DUMP to the
// full path if pg_dump is not on PATH. The password is passed to pg_dump through PGPASSWORD,
// never on the command line. A non-local database needs `npm run backup -- --remote`.
// The dump contains password hashes and personal data: store it encrypted (see docs/BACKUP_RESTORE.md).
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const parsed = new URL(dbUrl);
const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
if (!LOCAL.has(parsed.hostname) && !process.argv.includes('--remote')) {
  console.error(`DATABASE_URL points at ${parsed.hostname}. Add "-- --remote" if you really mean that database.`);
  process.exit(1);
}
const password = decodeURIComponent(parsed.password);
parsed.password = '';
const dbUrlWithoutPassword = parsed.toString();

const outDir = path.resolve(process.env.BACKUP_DIR || 'backups');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = path.join(outDir, `bukhari-${stamp}.dump`);

const env = { ...process.env };
if (password) env.PGPASSWORD = password;
const isLocal = LOCAL.has(parsed.hostname);
const caPath = process.env.DATABASE_CA_CERT_PATH;
if (caPath && !isLocal) {
  env.PGSSLROOTCERT = path.resolve(caPath);
  env.PGSSLMODE = 'verify-full';
}

const result = spawnSync(
  process.env.PG_DUMP || 'pg_dump',
  // Only the app's data (schema public); Supabase's own schemas and extensions exist in every project
  // and cannot be restored elsewhere (see docs/BACKUP_RESTORE.md).
  ['-w', '--format=custom', '--no-owner', '--no-privileges', '--schema=public', `--dbname=${dbUrlWithoutPassword}`, `--file=${file}`],
  { env, stdio: 'inherit', timeout: 15 * 60 * 1000 }
);
if (result.error || result.status !== 0) {
  console.error(`Backup failed${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}.`);
  fs.rmSync(file, { force: true });
  process.exit(1);
}
const size = (fs.statSync(file).size / 1024).toFixed(1);
console.log(`Backup written: ${file} (${size} KB)`);
