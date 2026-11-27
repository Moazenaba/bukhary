import crypto from 'crypto';
import { Router } from 'express';
import type { Pool } from '../db.ts';
import { route } from '../http.ts';

/** The parts of the fingerprint, one per list a client downloads (see SYNC_PARTS_SQL). */
export const SYNC_PARTS = ['me', 'committees', 'tasks', 'courses', 'exams', 'sheet', 'users', 'notifications', 'books', 'settings', 'permissions'] as const;
export type SyncPart = (typeof SYNC_PARTS)[number];

// Big tables: newest change time and row count (an insert, update or delete changes one of them).
const changes = (table: string, column = 'updated_at') => `(SELECT concat(max(${column}), ':', count(*)) FROM ${table})`;
// Small tables without a reliable change time: a hash of every row, exact.
const rowsHash = (table: string) => `(SELECT md5(coalesce(string_agg(t::text, ',' ORDER BY t::text), '')) FROM ${table} t)`;

/**
 * What each part is made of. Every part also carries `me` (the caller's own account: role, scope and
 * permissions), so a change of rights reloads everything that person sees.
 * - committees: the committees and everything their presenter joins in (staff, people's names and phones,
 *   observer assignments, temporary head grants).
 */
const SYNC_PARTS_SQL: Record<SyncPart, string> = {
  me: `(SELECT md5(u::text) FROM app_users u WHERE u.id = $1)`,
  committees: `concat_ws('|', ${changes('committees')}, ${rowsHash('committee_staff')}, ${changes('app_users')},
    (SELECT concat(max(created_at), ':', count(*)) FROM committee_assignments WHERE user_id = $1 OR status = 'active'),
    (SELECT concat(max(created_at), ':', count(*)) FROM committee_head_grants WHERE user_id = $1 OR status = 'active'))`,
  tasks: changes('schedule_tasks'),
  courses: changes('courses'),
  exams: changes('exams'),
  sheet: changes('summer_course_rows'),
  users: `concat_ws('|', ${changes('app_users')}, ${changes('permission_profiles')})`,
  notifications: `concat_ws('|',
    (SELECT concat(max(created_at), ':', count(*)) FROM notifications WHERE target_user_id IS NULL OR target_user_id = $1),
    (SELECT concat(max(read_at), ':', count(*)) FROM notification_reads WHERE user_id = $1))`,
  books: changes('books', 'created_at'),
  settings: changes('system_settings'),
  permissions: rowsHash('custom_permissions'),
};

/**
 * A short fingerprint of everything the screens show (API-26), whole (`version`) and per list (`parts`).
 * Clients poll this — a few hundred bytes — and download again only the lists whose part changed, so a
 * phone that checks every minute uses almost no data, and a change to one task does not reload every
 * committee. Older clients compare `version` only.
 */
export function syncRouter(pool: Pool) {
  const r = Router();
  r.get('/state', route(async (req, res) => {
    const select = SYNC_PARTS.map((p) => `md5(concat_ws('#', ${SYNC_PARTS_SQL[p]}, ${p === 'me' ? "''" : SYNC_PARTS_SQL.me})) AS "${p}"`).join(',\n');
    const { rows } = await pool.query(`SELECT ${select};`, [req.user!.id]);
    const parts = Object.fromEntries(SYNC_PARTS.map((p) => [p, String(rows[0][p]).slice(0, 12)])) as Record<SyncPart, string>;
    const version = crypto.createHash('md5').update(SYNC_PARTS.map((p) => parts[p]).join('')).digest('hex');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, version, parts });
  }));
  return r;
}
