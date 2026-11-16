import express from 'express';
import helmet from 'helmet';
import { authenticate } from './auth.ts';
import type { AppConfig } from './config.ts';
import type { Pool } from './db.ts';
import { errorHandler, notFound, requestId, route } from './http.ts';
import { idempotency } from './idempotency.ts';
import { requestLog } from './requestLog.ts';
import { pendingMigrations } from './migrate.ts';
import { auditLogsRouter, databaseRouter, ocrRouter } from './routes/admin.ts';
import { syncRouter } from './routes/sync.ts';
import { systemSettingsRouter } from './routes/systemSettings.ts';
import { authRouter } from './routes/authRoutes.ts';
import { assignmentsRouter } from './routes/assignments.ts';
import { committeesRouter } from './routes/committees.ts';
import { coursesRouter } from './routes/courses.ts';
import { examsRouter } from './routes/exams.ts';
import { notificationsRouter } from './routes/notifications.ts';
import { scoringRouter } from './routes/scoring.ts';
import { booksRouter, customPermissionsRouter, profilesRouter } from './routes/settings.ts';
import { summerRowsRouter } from './routes/summerRows.ts';
import { tasksRouter } from './routes/tasks.ts';
import { usersRouter } from './routes/users.ts';
import { devicesRouter } from './routes/devices.ts';
import { configurePush } from './push.ts';

/** Builds the API. Static files / Vite are attached by the entry point (server.ts). */
export function createApp(config: AppConfig, pool: Pool) {
  configurePush(pool, config.fcmServiceAccount);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(requestId);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", ...(config.isProduction ? [] : ["'unsafe-inline'", "'unsafe-eval'"])],
          // Fonts and icons are bundled with the app; nothing is loaded from third parties.
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", ...(config.isProduction ? [] : ['ws:', 'wss:'])],
          frameSrc: ["'self'", 'blob:'],
          objectSrc: ["'self'", 'blob:'],
          upgradeInsecureRequests: config.isProduction ? [] : null,
        },
      },
      hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    })
  );
  app.use(requestLog);
  // OCR images are the only large JSON bodies; everything else stays small.
  app.use('/api/extract-table', express.json({ limit: '15mb' }));
  app.use(express.json({ limit: '1mb' }));

  // An Android build older than the minimum is told to update instead of having its writes refused
  // one by one; the app keeps them queued until it is updated (426 Upgrade Required).
  app.use('/api/', (req, res, next) => {
    const sent = Number(req.get('X-App-Version-Code'));
    if (config.minAndroidVersionCode > 0 && Number.isFinite(sent) && sent > 0 && sent < config.minAndroidVersionCode) {
      return res.status(426).json({ success: false, code: 'app_update_required', message: 'يرجى تحديث التطبيق إلى أحدث إصدار للمتابعة' });
    }
    next();
  });

  // ---- Public ----
  app.get('/ping', (_req, res) => res.type('text/plain').send('pong'));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/ready', route(async (_req, res) => {
    try {
      await pool.query('SELECT 1;');
      const pending = await pendingMigrations(pool);
      // Only the count is public; `npm run migrate -- status` lists the names (API-25).
      if (pending.length) return res.status(503).json({ status: 'migrations_pending', pending: pending.length });
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'database_unavailable' });
    }
  }));
  app.use('/api/auth', authRouter(config, pool));

  // ---- Authenticated ----
  // Writes that carry an Idempotency-Key are applied once, however often they are retried.
  const authed = [authenticate(config, pool), idempotency(pool)];
  app.use('/api/courses', authed, coursesRouter(pool));
  app.use('/api/committees', authed, committeesRouter(pool, config));
  app.use('/api/assignments', authed, assignmentsRouter(pool));
  app.use('/api/users', authed, usersRouter(pool, { strictPermissionIds: config.strictPermissionIds }));
  app.use('/api/exams', authed, examsRouter(pool));
  app.use('/api/tasks', authed, tasksRouter(pool));
  app.use('/api/notifications', authed, notificationsRouter(pool));
  app.use('/api/devices', authed, devicesRouter(pool));
  app.use('/api/scoring', authed, scoringRouter(pool));
  app.use('/api/summer-course-rows', authed, summerRowsRouter(pool));
  app.use('/api/books', authed, booksRouter(pool));
  app.use('/api/permission-profiles', authed, profilesRouter(pool));
  app.use('/api/custom-permissions', authed, customPermissionsRouter(pool));
  app.use('/api/audit-logs', authed, auditLogsRouter(pool));
  app.use('/api/database', authed, databaseRouter(pool));
  app.use('/api/extract-table', authed, ocrRouter(config));
  app.use('/api/sync', authed, syncRouter(pool));
  app.use('/api/settings', authed, systemSettingsRouter(pool));

  // Unknown API routes get JSON, never the SPA's index.html.
  app.use('/api', (_req, _res, next) => next(notFound('المسار غير موجود')));
  app.use('/api', errorHandler);

  return app;
}
