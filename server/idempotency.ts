import type { NextFunction, Request, Response } from 'express';
import type { Pool } from './db.ts';
import { badRequest, conflict } from './http.ts';
import { logger } from './logger.ts';

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Makes writes that carry an `Idempotency-Key` header safe to retry (MOB-04): the first response
 * (2xx or 4xx) is stored per user and key, and a repeat of the same request gets that response
 * again without running the handler. Must run after authenticate().
 */
export function idempotency(pool: Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.get('Idempotency-Key');
    if (!key || !WRITE_METHODS.has(req.method) || !req.user) return next();
    try {
      if (!KEY_PATTERN.test(key)) throw badRequest('Idempotency-Key غير صالح');
      const path = `${req.baseUrl}${req.path}`;
      // A reservation left behind by a crashed request is released after two minutes.
      await pool.query(
        "DELETE FROM idempotency_keys WHERE user_id = $1 AND key = $2 AND status = 0 AND created_at < NOW() - interval '2 minutes';",
        [req.user.id, key]
      );
      // Reserve the key first (status 0 = in progress), so two concurrent sends cannot both run.
      const { rowCount } = await pool.query(
        `INSERT INTO idempotency_keys (user_id, key, method, path, status, response)
         VALUES ($1,$2,$3,$4,0,'null'::jsonb) ON CONFLICT DO NOTHING;`,
        [req.user.id, key, req.method, path]
      );
      if (rowCount === 0) {
        const { rows } = await pool.query(
          'SELECT method, path, status, response FROM idempotency_keys WHERE user_id = $1 AND key = $2;',
          [req.user.id, key]
        );
        const prev = rows[0];
        if (!prev || prev.method !== req.method || prev.path !== path) throw badRequest('Idempotency-Key مستخدم لطلب آخر');
        if (prev.status === 0) throw conflict('هذا الطلب قيد التنفيذ بالفعل');
        res.setHeader('Idempotent-Replay', 'true');
        return res.status(prev.status).json(prev.response);
      }
      const json = res.json.bind(res);
      res.json = (body: unknown) => {
        const done =
          res.statusCode < 500
            ? pool.query('UPDATE idempotency_keys SET status = $3, response = $4 WHERE user_id = $1 AND key = $2;',
                [req.user!.id, key, res.statusCode, JSON.stringify(body ?? null)])
            : pool.query('DELETE FROM idempotency_keys WHERE user_id = $1 AND key = $2;', [req.user!.id, key]);
        done.catch((err) => logger.warn('idempotency.store_failed', { message: err.message }));
        return json(body);
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}
