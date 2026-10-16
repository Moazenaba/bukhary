// Writes a compressed, restorable dump of the database to ./backups (or BACKUP_DIR).
//
//   npm run backup
//
// Needs the PostgreSQL client tools (pg_dump 17 or newer for Supabase). Set PG_DUMP to the
// full path if pg_dump is not on PATH. Note: the connection string (with its password) is
// given to pg_dump as an argument, so keep this script on the operator's own machine.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const outDir = path.resolve(process.env.BACKUP_DIR || 'backups');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = path.join(outDir, `bukhari-${stamp}.dump`);

const env = { ...process.env };
const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(dbUrl);
const caPath = process.env.DATABASE_CA_CERT_PATH;
if (caPath && !isLocal) {
  env.PGSSLROOTCERT = path.resolve(caPath);
  env.PGSSLMODE = 'verify-full';
}

const result = spawnSync(
  process.env.PG_DUMP || 'pg_dump',
  ['-w', '--format=custom', '--no-owner', '--no-privileges', `--dbname=${dbUrl}`, `--file=${file}`],
  { env, stdio: 'inherit', timeout: 15 * 60 * 1000 }
);
if (result.error || result.status !== 0) {
  console.error(`Backup failed${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}.`);
  fs.rmSync(file, { force: true });
  process.exit(1);
}
const size = (fs.statSync(file).size / 1024).toFixed(1);
console.log(`Backup written: ${file} (${size} KB)`);
