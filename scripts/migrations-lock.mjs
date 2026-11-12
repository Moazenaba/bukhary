// Records the fingerprint of every migration in migrations/checksums.json. Run it once after adding
// a new migration; a released migration must never change afterwards (tests/migrations-safety).
import crypto from 'crypto';
import fs from 'fs';

const dir = 'migrations';
const lock = {};
for (const f of fs.readdirSync(dir).filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f)).sort()) {
  lock[f] = crypto.createHash('sha256').update(fs.readFileSync(`${dir}/${f}`)).digest('hex');
}
fs.writeFileSync(`${dir}/checksums.json`, `${JSON.stringify(lock, null, 2)}\n`);
console.log(`${Object.keys(lock).length} migrations locked`);
