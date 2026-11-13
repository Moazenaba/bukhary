import type { Queryable } from './db.ts';
import { HttpError } from './http.ts';

// Attempt limits per caller address, kept in the database (several server instances share them).
// After `max` failures inside `windowMs`, the address waits `blockMs`, then starts afresh.
// Nothing is tied to an account, so the account owner on another device is never locked out.

export interface Limit {
  max: number;
  windowMs: number;
  blockMs: number;
  message: string;
}

export const LOGIN_LIMIT: Limit = {
  max: 10,
  windowMs: 10 * 60_000,
  blockMs: 2 * 60_000,
  message: 'محاولات دخول كثيرة غير صحيحة من هذا الجهاز. استنى دقيقتين وجرّب تاني.',
};

export const JOIN_LIMIT: Limit = {
  max: 5,
  windowMs: 60 * 60_000,
  blockMs: 60 * 60_000,
  message: 'تم إرسال طلبات انضمام كثيرة من هذا الجهاز. حاول مرة أخرى بعد ساعة.',
};

/** Refuses with 429 (and Retry-After) while the address is waiting. */
export async function assertNotBlocked(db: Queryable, key: string, limit: Limit, res?: { setHeader: (k: string, v: string) => void }) {
  const { rows } = await db.query('SELECT blocked_until FROM rate_limits WHERE key = $1 AND blocked_until > NOW();', [key]);
  if (!rows[0]) return;
  const seconds = Math.max(1, Math.ceil((new Date(rows[0].blocked_until).getTime() - Date.now()) / 1000));
  res?.setHeader('Retry-After', String(seconds));
  throw new HttpError(429, limit.message, 'too_many_attempts');
}

/** Counts one attempt; the one that reaches the limit starts the wait. */
export async function countAttempt(db: Queryable, key: string, limit: Limit) {
  await db.query(
    `INSERT INTO rate_limits (key, count, window_start, blocked_until, updated_at)
     VALUES ($1, 1, NOW(), CASE WHEN 1 >= $2 THEN NOW() + ($4 || ' milliseconds')::interval END, NOW())
     ON CONFLICT (key) DO UPDATE SET
       count = CASE
         WHEN rate_limits.window_start < NOW() - ($3 || ' milliseconds')::interval OR rate_limits.blocked_until IS NOT NULL THEN 1
         ELSE rate_limits.count + 1 END,
       window_start = CASE
         WHEN rate_limits.window_start < NOW() - ($3 || ' milliseconds')::interval OR rate_limits.blocked_until IS NOT NULL THEN NOW()
         ELSE rate_limits.window_start END,
       blocked_until = CASE
         WHEN (CASE WHEN rate_limits.window_start < NOW() - ($3 || ' milliseconds')::interval OR rate_limits.blocked_until IS NOT NULL
                    THEN 1 ELSE rate_limits.count + 1 END) >= $2
           THEN NOW() + ($4 || ' milliseconds')::interval
         ELSE NULL END,
       updated_at = NOW();`,
    [key, limit.max, String(limit.windowMs), String(limit.blockMs)]
  );
}

/** A successful login clears its address's failures. */
export async function clearAttempts(db: Queryable, key: string) {
  await db.query('DELETE FROM rate_limits WHERE key = $1;', [key]);
}
