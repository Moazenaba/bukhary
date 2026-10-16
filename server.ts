import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createApp } from './server/app.ts';
import { loadConfig } from './server/config.ts';
import { createPool } from './server/db.ts';
import { logger, reportError } from './server/logger.ts';
import { pendingMigrations } from './server/migrate.ts';

// Entry point: API + web app. Schema changes are never applied here; run
// `npm run migrate` during deployment. The server refuses to start while
// migrations are pending, so it never serves requests against an old schema.

// The production bundle (npm run build) defines this, so `npm start` runs in production
// mode even if the host forgot to set NODE_ENV.
declare const __PRODUCTION_BUILD__: boolean | undefined;
if (typeof __PRODUCTION_BUILD__ !== 'undefined' && __PRODUCTION_BUILD__) process.env.NODE_ENV ??= 'production';

async function main() {
  const config = loadConfig();
  const pool = createPool(config);

  const pending = await pendingMigrations(pool);
  if (pending.length) {
    throw new Error(`Database migrations are pending (${pending.map((m) => m.name).join(', ')}). Run "npm run migrate" first.`);
  }

  const app = createApp(config, pool);

  if (config.isProduction) {
    const dist = path.resolve(process.cwd(), 'dist');
    if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist/index.html not found. Run "npm run build" first.');
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  const server = app.listen(config.port, '0.0.0.0', () => {
    logger.info('server.started', { port: config.port, env: config.nodeEnv });
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('server.stopping', { signal });
    server.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
    // Give in-flight requests 10 s, then exit anyway.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason: any) => {
  reportError('process.unhandled_rejection', { message: reason?.message ?? String(reason), stack: reason?.stack });
});

main().catch((err) => {
  logger.error('server.start_failed', { message: err.message });
  process.exit(1);
});
