import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { can } from '../auth.ts';
import { audit } from '../audit.ts';
import type { Pool, Queryable } from '../db.ts';
import { notFound, route } from '../http.ts';
import { optionalId } from '../schemas.ts';
import { seesAllCommittees } from '../policy.ts';
import { queuePush } from '../push.ts';

export type NotificationType = 'urgent' | 'info' | 'success';

/** Creates a notification on the server (used by domain events). target = null means everyone. */
export async function notify(
  db: Queryable,
  n: {
    title: string;
    description: string;
    type?: NotificationType;
    committeeId?: string | null;
    targetUserId?: string | null;
    /** Server-side tags (e.g. to group join-request notifications); never shown. */
    data?: Record<string, unknown>;
  }
) {
  await db.query(
    `INSERT INTO notifications (id, title, description, type, committee_id, target_user_id, created_at, data)
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7::jsonb);`,
    [crypto.randomUUID(), n.title, n.description, n.type ?? 'info', n.committeeId ?? null, n.targetUserId ?? null, JSON.stringify(n.data ?? {})]
  );
  // The same notification reaches the phones of the people it is for (no-op without FCM credentials).
  queuePush(n);
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

  // Broadcasts about a committee reach only people who see that committee.
  r.get('/', route(async (req, res) => {
    const limit = z.coerce.number().int().min(1).max(200).default(50).parse(req.query.limit);
    const user = req.user!;
    const { rows } = await pool.query(
      `SELECT n.*, nr.read_at FROM notifications n
       LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = $1
       WHERE n.target_user_id = $1
          OR (n.target_user_id IS NULL AND (
                $3::boolean OR n.committee_id IS NULL OR n.committee_id = ANY($4::text[])
                OR EXISTS (SELECT 1 FROM committees c WHERE c.id = n.committee_id
                           AND c.ceremony_details -> 'attendees' @> jsonb_build_array(jsonb_build_object('id', $1::text)))))
       ORDER BY n.created_at DESC LIMIT $2;`,
      [user.id, limit, seesAllCommittees(user), user.assignedCommitteeIds]
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
