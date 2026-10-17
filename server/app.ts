import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { authenticate } from './auth.ts';
import type { AppConfig } from './config.ts';
import type { Pool } from './db.ts';
import { errorHandler, notFound, requestId, route } from './http.ts';
import { idempotency } from './idempotency.ts';
import { logger } from './logger.ts';
import { pendingMigrations } from './migrate.ts';
import { auditLogsRouter, databaseRouter, ocrRouter } from './routes/admin.ts';
import { authRouter } from './routes/authRoutes.ts';
import { committeesRouter } from './routes/committees.ts';
import { coursesRouter } from './routes/courses.ts';
import { examsRouter } from './routes/exams.ts';
import { notificationsRouter } from './routes/notifications.ts';
import { scoringRouter } from './routes/scoring.ts';
import { booksRouter, customPermissionsRouter, profilesRouter } from './routes/settings.ts';
import { summerRowsRouter } from './routes/summerRows.ts';
import { tasksRouter } from './routes/tasks.ts';
import { usersRouter } from './routes/users.ts';

/** Builds the API. Static files / Vite are attached by the entry point (server.ts). */
export function createApp(config: AppConfig, pool: Pool) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  if (config.isProduction) {
    app.use(requestId);
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            fontSrc: ["'self'", 'data:'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'"],
            frameSrc: ["'self'", 'blob:'],
            objectSrc: ["'self'", 'blob:'],
          },
        },
        hsts: { maxAge: 31_536_000, includeSubDomains: true },
      })
    );
  }
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      if (req.path.startsWith('/api/')) {
        logger.info('request', { requestId: (req as any).id, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start, userId: req.user?.id });
      }
    });
    next();
  });
  // OCR images are the only large JSON bodies; everything else stays small.
  app.use('/api/extract-table', express.json({ limit: '15mb' }));
  app.use(express.json({ limit: '1mb' }));

  // A ceiling for every API route per IP (API-26); login, registration and OCR have tighter ones.
  // The store is in memory, so with several instances the effective limit multiplies (API-28).
  if (config.apiRateLimitPerMinute > 0 && config.nodeEnv !== 'test') {
    app.use('/api/', rateLimit({ windowMs: 60_000, limit: config.apiRateLimitPerMinute, standardHeaders: true, legacyHeaders: false,
      message: { success: false, message: 'طلبات كثيرة، يرجى المحاولة بعد قليل' } }));
  }

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
  app.use('/api/users', authed, usersRouter(pool, { strictPermissionIds: config.strictPermissionIds }));
  app.use('/api/exams', authed, examsRouter(pool));
  app.use('/api/tasks', authed, tasksRouter(pool));
  app.use('/api/notifications', authed, notificationsRouter(pool));
  app.use('/api/scoring', authed, scoringRouter(pool));
  app.use('/api/summer-course-rows', authed, summerRowsRouter(pool));
  app.use('/api/books', authed, booksRouter(pool));
  app.use('/api/permission-profiles', authed, profilesRouter(pool));
  app.use('/api/custom-permissions', authed, customPermissionsRouter(pool));
  app.use('/api/audit-logs', authed, auditLogsRouter(pool));
  app.use('/api/database', authed, databaseRouter(pool));
  app.use('/api/extract-table', authed, ocrRouter(config));

  // Unknown API routes get JSON, never the SPA's index.html.
  app.use('/api', (_req, _res, next) => next(notFound('المسار غير موجود')));
  app.use('/api', errorHandler);

  return app;
}
