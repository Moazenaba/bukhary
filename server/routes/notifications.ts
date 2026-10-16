import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { can } from '../auth.ts';
import { audit } from '../audit.ts';
import type { Pool, Queryable } from '../db.ts';
import { notFound, route } from '../http.ts';
import { optionalId } from '../schemas.ts';

export type NotificationType = 'urgent' | 'info' | 'success';

/** Creates a notification on the server (used by domain events). target = null means everyone. */
export async function notify(
  db: Queryable,
  n: { title: string; description: string; type?: NotificationType; committeeId?: string | null; targetUserId?: string | null }
) {
  await db.query(
    `INSERT INTO notifications (id, title, description, type, committee_id, target_user_id, created_at, data)
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),'{}'::jsonb);`,
    [crypto.randomUUID(), n.title, n.description, n.type ?? 'info', n.committeeId ?? null, n.targetUserId ?? null]
  );
}

function fromRow(r: any) {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    type: r.type ?? 'info',
    read: Boolean(r.read_at),
    committeeId: r.committee_id ?? undefined,
    time: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

export function notificationsRouter(pool: Pool) {
  const r = Router();

  r.get('/', route(async (req, res) => {
    const limit = z.coerce.number().int().min(1).max(200).default(50).parse(req.query.limit);
    const { rows } = await pool.query(
      `SELECT n.*, nr.read_at FROM notifications n
       LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = $1
       WHERE n.target_user_id IS NULL OR n.target_user_id = $1
       ORDER BY n.created_at DESC LIMIT $2;`,
      [req.user!.id, limit]
    );
    res.json({ success: true, notifications: rows.map(fromRow) });
  }));

  r.post('/', can('notifications.create'), route(async (req, res) => {
    const n = z
      .object({
        title: z.string().trim().min(1).max(300),
        description: z.string().max(2000).default(''),
        type: z.enum(['urgent', 'info', 'success']).default('info'),
        committeeId: optionalId,
      })
      .parse(req.body);
    await notify(pool, n);
    await audit(pool, req, 'notification.create', 'notification', null, null, n);
    res.status(201).json({ success: true });
  }));

  r.patch('/:id/read', route(async (req, res) => {
    const { rowCount } = await pool.query(
      `INSERT INTO notification_reads (user_id, notification_id)
       SELECT $1::varchar, id FROM notifications WHERE id = $2 AND (target_user_id IS NULL OR target_user_id = $1::varchar)
       ON CONFLICT DO NOTHING;`,
      [req.user!.id, req.params.id]
    );
    if (rowCount === 0) {
      const { rows } = await pool.query('SELECT 1 FROM notifications WHERE id = $1;', [req.params.id]);
      if (!rows[0]) throw notFound('التنبيه غير موجود');
    }
    res.json({ success: true });
  }));

  r.post('/read-all', route(async (req, res) => {
    await pool.query(
      `INSERT INTO notification_reads (user_id, notification_id)
       SELECT $1::varchar, id FROM notifications WHERE target_user_id IS NULL OR target_user_id = $1::varchar
       ON CONFLICT DO NOTHING;`,
      [req.user!.id]
    );
    res.json({ success: true });
  }));

  return r;
}
