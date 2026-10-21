// Vercel build (Build Output API): the web app as static files and the API as one Node function
// on the same domain, so the web app's relative /api calls and the Android app both reach it.
//   .vercel/output/static/                      vite build
//   .vercel/output/functions/api.func/          the Express app (deploy/vercel/api.ts), bundled
//   .vercel/output/config.json                  /api/* -> function, other paths -> index.html
// Pending migrations are applied first when DATABASE_URL is available to the build.
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';

const out = path.resolve('.vercel/output');
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

fs.rmSync(out, { recursive: true, force: true });

run('npx vite build');
fs.cpSync('dist', path.join(out, 'static'), { recursive: true });

const func = path.join(out, 'functions/api.func');
await build({
  entryPoints: ['deploy/vercel/api.ts'],
  outfile: path.join(func, 'index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['pg-native', 'vite'],
  define: { __PRODUCTION_BUILD__: 'true' },
  // Halves the bundle (3.6 MB -> 2 MB) for faster cold starts; names are kept for readable errors.
  minify: true,
  keepNames: true,
  legalComments: 'none',
  // Some bundled CommonJS packages call require() for Node built-ins.
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
// The function checks for pending migrations on start, so it needs the SQL files beside it.
fs.cpSync('migrations', path.join(func, 'migrations'), { recursive: true });
fs.writeFileSync(
  path.join(func, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 60 }, null, 2)
);

fs.writeFileSync(
  path.join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/(api(?:/.*)?|ping)$', dest: '/api' },
        { src: '^/assets/(.*)$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2
  )
);

if (process.env.DATABASE_URL || process.env.SUPABASE_DB_HOST) {
  run('npx esbuild scripts/migrate.ts --bundle --platform=node --format=esm --packages=external --outfile=.vercel/migrate.mjs --define:__PRODUCTION_BUILD__=true');
  run('node .vercel/migrate.mjs');
} else {
  console.warn('DATABASE_URL is not set for the build: migrations were not applied.');
}
