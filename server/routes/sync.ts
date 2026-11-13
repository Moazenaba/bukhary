import { Router } from 'express';
import type { Pool } from '../db.ts';
import { route } from '../http.ts';

/**
 * A short fingerprint of everything the screens show (API-26). Clients poll this — a few bytes —
 * and download the full lists only when it changes, so a phone that checks every minute uses
 * almost no data. Any insert, update or delete changes the fingerprint: each part combines the
 * newest change time with the row count.
 */
export function syncRouter(pool: Pool) {
  const r = Router();
  r.get('/state', route(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT md5(concat_ws('|',
         (SELECT concat(max(updated_at), ':', count(*)) FROM committees),
         (SELECT concat(max(updated_at), ':', count(*)) FROM schedule_tasks),
         (SELECT concat(max(updated_at), ':', count(*)) FROM courses),
         (SELECT concat(max(updated_at), ':', count(*)) FROM exams),
         (SELECT concat(max(updated_at), ':', count(*)) FROM summer_course_rows),
         (SELECT concat(max(updated_at), ':', count(*)) FROM app_users),
         (SELECT concat(max(updated_at), ':', count(*)) FROM permission_profiles),
         (SELECT concat(max(created_at), ':', count(*)) FROM books),
         (SELECT concat(max(created_at), ':', count(*)) FROM notifications WHERE target_user_id IS NULL OR target_user_id = $1),
         (SELECT concat(max(read_at), ':', count(*)) FROM notification_reads WHERE user_id = $1)
       )) AS version;`,
      [req.user!.id]
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, version: rows[0].version });
  }));
  return r;
}
