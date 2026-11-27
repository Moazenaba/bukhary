import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { can } from '../auth.ts';
import { audit } from '../audit.ts';
import type { Pool, Queryable } from '../db.ts';
import { badRequest, notFound, route } from '../http.ts';
import { optionalId } from '../schemas.ts';
import { type Principal, canViewRole, isAdminRole, seesAllCommittees, visibleCommitteeIds } from '../policy.ts';
import { busyOn } from '../staff.ts';
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

/**
 * The same notification for each of `userIds` (one row each, so each person reads it on their own), and one
 * push to all their phones. Returns the batch id.
 */
export async function notifyMany(
  db: Queryable,
  userIds: string[],
  n: { title: string; description: string; type?: NotificationType; committeeId?: string | null; data?: Record<string, unknown>; sentBy?: string | null }
) {
  const ids = [...new Set(userIds.filter(Boolean))];
  const batchId = crypto.randomUUID();
  if (ids.length === 0) return batchId;
  await db.query(
    `INSERT INTO notifications (id, title, description, type, committee_id, target_user_id, created_at, data, batch_id, sent_by)
     SELECT 'ntf_' || md5($7 || ':' || uid), $1, $2, $3, $4, uid, NOW(), $5::jsonb, $7, $6 FROM unnest($8::text[]) AS uid;`,
    [n.title, n.description, n.type ?? 'info', n.committeeId ?? null, JSON.stringify(n.data ?? {}), n.sentBy ?? null, batchId, ids]
  );
  queuePush({ title: n.title, description: n.description, type: n.type, committeeId: n.committeeId ?? null, targetUserIds: ids, data: n.data });
  return batchId;
}

const audienceInput = z.object({
  kind: z.enum(['all', 'users', 'accountRole', 'staffRole', 'committee', 'available']),
  userIds: z.array(z.string().max(255)).max(2000).optional(),
  accountRole: z.enum(['admin', 'exams_manager', 'committee_head', 'sheikh']).optional(),
  staffRole: z.enum(['owner', 'observer', 'ceremony_sheikh']).optional(),
  /** Several staff categories at once (e.g. observers and ceremony sheikhs); wins over `staffRole`. */
  staffRoles: z.array(z.enum(['owner', 'observer', 'ceremony_sheikh'])).min(1).max(3).optional(),
  committeeId: z.string().max(255).optional(),
  committeeRoles: z.array(z.enum(['owner', 'observer', 'ceremony_sheikh'])).max(3).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type Audience = z.infer<typeof audienceInput>;
const messageInput = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(2000).default(''),
  type: z.enum(['urgent', 'info', 'success']).default('info'),
  committeeId: optionalId,
  audience: audienceInput.optional(),
});

/**
 * The people a manual message reaches (docs/PLAN_ROLES_AND_FLOW.md 1.6). Super admins are never counted (unless a
 * super admin sends); admins are left out when the sender may not see admin accounts. Members of a committee are
 * reached only once the committee is active.
 */
export async function resolveAudience(db: Queryable, sender: Principal, a: Audience): Promise<string[]> {
  const hidden = sender.role === 'super_admin' ? ['__none__'] : canViewRole(sender, 'admin') ? ['super_admin'] : ['super_admin', 'admin'];
  const base = `SELECT u.id FROM app_users u WHERE u.status = 'approved' AND NOT (u.role = ANY($1::text[])) AND u.id <> $2`;
  const live = `c.lifecycle IN ('active', 'observed', 'accredited', 'ceremony_done')`;
  let rows: Array<{ id: string }> = [];
  switch (a.kind) {
    case 'all':
      ({ rows } = await db.query(`${base};`, [hidden, sender.id]));
      break;
    case 'users':
      if (!a.userIds?.length) throw badRequest('اختر شخصًا واحدًا على الأقل');
      ({ rows } = await db.query(`${base} AND u.id = ANY($3::text[]);`, [hidden, sender.id, a.userIds]));
      break;
    case 'accountRole':
      if (!a.accountRole) throw badRequest('اختر الدور');
      ({ rows } = await db.query(`${base} AND u.role = $3;`, [hidden, sender.id, a.accountRole]));
      break;
    case 'staffRole':
      const staffRoles = a.staffRoles?.length ? a.staffRoles : a.staffRole ? [a.staffRole] : [];
      if (staffRoles.length === 0) throw badRequest('اختر الدور');
      ({ rows } = await db.query(
        `${base} AND EXISTS (SELECT 1 FROM committee_staff s JOIN committees c ON c.id = s.committee_id
                             WHERE s.user_id = u.id AND s.status = 'active' AND s.role = ANY($3::text[]) AND ${live} AND c.lifecycle <> 'ceremony_done');`,
        [hidden, sender.id, staffRoles]
      ));
      break;
    case 'committee': {
      if (!a.committeeId) throw badRequest('اختر اللجنة');
      const roles = a.committeeRoles?.length ? a.committeeRoles : ['owner', 'observer', 'ceremony_sheikh'];
      ({ rows } = await db.query(
        `${base} AND EXISTS (SELECT 1 FROM committee_staff s JOIN committees c ON c.id = s.committee_id
                             WHERE s.user_id = u.id AND s.status = 'active' AND s.committee_id = $3 AND s.role = ANY($4::text[]) AND ${live});`,
        [hidden, sender.id, a.committeeId, roles]
      ));
      break;
    }
    case 'available': {
      if (!a.date) throw badRequest('اختر اليوم');
      const { rows: people } = await db.query(`${base} AND u.role IN ('committee_head', 'sheikh');`, [hidden, sender.id]);
      const busy = new Set((await busyOn(db, people.map((p) => p.id), a.date)).map((b) => b.userId));
      rows = people.filter((p) => !busy.has(p.id));
      break;
    }
  }
  return [...new Set(rows.map((r) => r.id))];
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
      [user.id, limit, seesAllCommittees(user), visibleCommitteeIds(user)]
    );
    res.json({ success: true, notifications: rows.map(fromRow) });
  }));

  // Without an audience: the older broadcast (everyone, or the people who see one committee).
  r.post('/', can('notifications.create'), route(async (req, res) => {
    const n = messageInput.parse(req.body);
    if (!n.audience) {
      const { audience: _a, ...plain } = n;
      await notify(pool, { ...plain, data: { kind: 'manual' } });
      await audit(pool, req, 'notification.create', 'notification', null, null, plain);
      return res.status(201).json({ success: true });
    }
    const ids = await resolveAudience(pool, req.user!, n.audience);
    if (ids.length === 0) throw badRequest('لا يوجد مستلمون لهذا الاختيار');
    const batchId = await notifyMany(pool, ids, {
      title: n.title,
      description: n.description,
      type: n.type,
      committeeId: n.committeeId ?? n.audience.committeeId ?? null,
      data: { kind: 'manual' },
      sentBy: req.user!.id,
    });
    await audit(pool, req, 'notification.send', 'notification', batchId, null, { ...n, recipients: ids.length }, `${ids.length} مستلم`);
    res.status(201).json({ success: true, batchId, recipients: ids.length });
  }));

  // How many people a choice reaches, before sending.
  r.post('/preview', can('notifications.create'), route(async (req, res) => {
    const audience = audienceInput.parse(req.body?.audience ?? req.body);
    const ids = await resolveAudience(pool, req.user!, audience);
    const { rows } = await pool.query('SELECT id, name FROM app_users WHERE id = ANY($1::text[]) ORDER BY name LIMIT 50;', [ids]);
    res.json({ success: true, recipients: ids.length, sample: rows });
  }));

  // Messages sent by hand: admins see all of them, the exams manager their own.
  r.get('/sent', can('notifications.create'), route(async (req, res) => {
    const user = req.user!;
    const { rows } = await pool.query(
      `SELECT n.batch_id, min(n.title) AS title, min(n.description) AS description, min(n.type) AS type, min(n.created_at) AS created_at,
              count(*)::int AS recipients, count(nr.user_id)::int AS read, min(u.name) AS sent_by_name, min(u.role) AS sent_by_role
       FROM notifications n
       LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = n.target_user_id
       LEFT JOIN app_users u ON u.id = n.sent_by
       WHERE n.batch_id IS NOT NULL AND n.sent_by IS NOT NULL AND ($1::boolean OR n.sent_by = $2)
       GROUP BY n.batch_id ORDER BY min(n.created_at) DESC LIMIT 100;`,
      [isAdminRole(user.role), user.id]
    );
    const showAdmins = user.role === 'super_admin';
    res.json({
      success: true,
      sent: rows.map((x) => ({
        batchId: x.batch_id,
        title: x.title,
        description: x.description ?? '',
        type: x.type,
        createdAt: x.created_at instanceof Date ? x.created_at.toISOString() : x.created_at,
        recipients: x.recipients,
        read: x.read,
        sentBy: !showAdmins && (x.sent_by_role === 'super_admin' || x.sent_by_role === 'admin') ? 'الإدارة' : x.sent_by_name ?? '',
      })),
    });
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
