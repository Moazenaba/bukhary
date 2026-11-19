import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { can } from '../auth.ts';
import { audit } from '../audit.ts';
import { type Pool, type Queryable, withTransaction } from '../db.ts';
import { badRequest, conflict, forbidden, notFound, route } from '../http.ts';
import { type Principal, isAdminRole } from '../policy.ts';
import { notify } from './notifications.ts';

/**
 * Temporary committee-head grants («رئيس لجنة مؤقت»). An admin makes an approved sheikh the head of one or more
 * committees for a date window. While it applies, the sheikh keeps the sheikh role and acts as the committee head on
 * those committees only (policy.ts: headGrants). Grants are never deleted: ending one only changes its status.
 *
 * The ceremony decision decides how long a grant lasts past its last day:
 *   - 'yes'        → it lasts until the committee's ceremony is marked done (the sweep below ends it then);
 *   - 'no'         → it ends on its last day;
 *   - 'undecided'  → it ends on its last day, and the admin who granted it is told.
 * A decision by a higher-ranked person is never overwritten by a lower one: admin > committee head > temporary head.
 */

const RANK = { admin: 3, head: 2, holder: 1 } as const;
type Decision = 'yes' | 'no' | 'undecided';

const SELECT = `
  SELECT g.id, g.user_id, u.name AS user_name, g.committee_ids, to_char(g.starts_on, 'YYYY-MM-DD') AS starts_on,
         to_char(g.ends_on, 'YYYY-MM-DD') AS ends_on, g.status, g.ceremony_decision, g.ceremony_decided_by_role,
         g.ceremony_decided_at, g.granted_by, g.granted_by_name, g.created_at, g.ended_at
  FROM committee_head_grants g
  JOIN app_users u ON u.id = g.user_id`;

function present(r: any) {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    committeeIds: Array.isArray(r.committee_ids) ? r.committee_ids.map(String) : [],
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    status: r.status,
    ceremonyDecision: r.ceremony_decision as Decision,
    decidedByRole: r.ceremony_decided_by_role ?? null,
    decidedAt: r.ceremony_decided_at instanceof Date ? r.ceremony_decided_at.toISOString() : r.ceremony_decided_at ?? null,
    grantedBy: r.granted_by_name,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    endedAt: r.ended_at instanceof Date ? r.ended_at.toISOString() : r.ended_at ?? null,
  };
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'تاريخ غير صالح');
const createInput = z.object({
  userId: z.string().min(1).max(255),
  committeeIds: z.array(z.string().min(1).max(255)).min(1).max(10),
  startsOn: day,
  endsOn: day,
});
const decisionInput = z.object({ decision: z.enum(['yes', 'no', 'undecided']) });

const DECISION_LABEL: Record<Decision, string> = {
  yes: 'سيكون هناك حفل',
  no: 'لن يكون هناك حفل',
  undecided: 'لم يتم التحديد بعد',
};

/** Who is deciding: an admin above all, the committee's permanent head, or the temporary head themselves. */
function deciderRank(user: Principal, grant: { user_id: string; committee_ids: string[] }): keyof typeof RANK | null {
  if (isAdminRole(user.role)) return 'admin';
  if (grant.committee_ids.some((c) => user.role === 'committee_head' && user.assignedCommitteeIds.includes(c))) return 'head';
  if (user.id === grant.user_id) return 'holder';
  return null;
}

/**
 * Ends the grants that are over. Run on every read of the lists and by the scheduled maintenance:
 *   - a «yes» grant ends once every committee it covers has its ceremony done;
 *   - a «no» or «undecided» grant ends on its last day (an «undecided» one tells the granting admin).
 */
export async function sweepHeadGrants(db: Queryable) {
  const { rows } = await db.query(
    `SELECT g.id, g.user_id, g.committee_ids, g.ceremony_decision, g.granted_by, g.ends_on < CURRENT_DATE AS over
     FROM committee_head_grants g WHERE g.status = 'active' AND (g.ends_on < CURRENT_DATE OR g.ceremony_decision = 'yes');`
  );
  let ended = 0;
  for (const g of rows) {
    const cids: string[] = Array.isArray(g.committee_ids) ? g.committee_ids.map(String) : [];
    let finish = false;
    let note = '';
    if (g.ceremony_decision === 'yes') {
      const { rows: c } = await db.query(
        `SELECT COUNT(*) FILTER (WHERE (stages->'ceremony'->>'completed') = 'true')::int AS done, COUNT(*)::int AS total
         FROM committees WHERE id = ANY($1::text[]);`,
        [cids]
      );
      finish = c[0].total > 0 && c[0].done === c[0].total;
      note = 'انتهى الحفل، وانتهت الصلاحيات المؤقتة للشيخ.';
    } else if (g.over) {
      finish = true;
      note = g.ceremony_decision === 'no'
        ? 'انتهت المدة. القرار: لن يكون هناك حفل.'
        : 'انتهت المدة ولم يُحدد الحفل بعد. رجع الشيخ لصلاحياته العادية؛ راجع الأمر إن كان محتاج تمديد.';
    }
    if (!finish) continue;
    await db.query(
      "UPDATE committee_head_grants SET status = 'ended', ended_at = NOW() WHERE id = $1 AND status = 'active';",
      [g.id]
    );
    ended++;
    if (g.granted_by) {
      await notify(db, {
        title: 'انتهت جولة رئيس لجنة مؤقت',
        description: note,
        type: 'info',
        targetUserId: g.granted_by,
        data: { grantId: g.id },
      });
    }
  }
  return ended;
}

export function grantsRouter(pool: Pool) {
  const r = Router();

  // Admins (any admin account) grant, decide, see every grant and end one. The super admin sits above them.
  r.post('/', can('users.grant'), route(async (req, res) => {
    const body = createInput.parse(req.body);
    const user = req.user!;
    if (body.endsOn < body.startsOn) throw badRequest('تاريخ النهاية قبل تاريخ البداية');
    const created = await withTransaction(pool, async (db) => {
      const { rows: target } = await db.query('SELECT id, name, role, status FROM app_users WHERE id = $1 FOR UPDATE;', [body.userId]);
      const t = target[0];
      if (!t || t.status !== 'approved') throw badRequest('الشخص المختار غير موجود أو غير معتمد');
      if (t.role !== 'sheikh') throw badRequest('الرئيس المؤقت يُسند لشيخ عادي فقط');
      if (t.id === user.id) throw forbidden('لا يمكنك إسناد دور لنفسك');
      const { rows: cs } = await db.query('SELECT id, committee_number, committee_name FROM committees WHERE id = ANY($1::text[]);', [body.committeeIds]);
      if (cs.length !== new Set(body.committeeIds).size) throw notFound('إحدى اللجان غير موجودة');
      // One overlapping grant per committee and person.
      const { rows: overlap } = await db.query(
        `SELECT id FROM committee_head_grants g WHERE g.user_id = $1 AND g.status = 'active'
           AND g.starts_on <= $3::date AND g.ends_on >= $2::date
           AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(g.committee_ids) x WHERE x = ANY($4::text[]));`,
        [body.userId, body.startsOn, body.endsOn, body.committeeIds]
      );
      if (overlap.length) throw conflict('لهذا الشخص جولة رئيس لجنة متداخلة على إحدى هذه اللجان في نفس الفترة');
      const id = crypto.randomUUID();
      await db.query(
        `INSERT INTO committee_head_grants (id, user_id, committee_ids, starts_on, ends_on, granted_by, granted_by_name)
         VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7);`,
        [id, body.userId, JSON.stringify(body.committeeIds), body.startsOn, body.endsOn, user.id, user.name]
      );
      const names = cs.map((c: any) => `لجنة ${c.committee_number}`).join('، ');
      await notify(db, {
        title: 'تم إسنادك رئيس لجنة مؤقتًا',
        description: `${names} من ${body.startsOn} إلى ${body.endsOn}`,
        type: 'info',
        targetUserId: body.userId,
        data: { grantId: id },
      });
      const { rows } = await db.query(`${SELECT} WHERE g.id = $1;`, [id]);
      await audit(db, req, 'grant.create', 'grant', id, null, present(rows[0]), `رئيس لجنة مؤقت: ${names}`);
      return rows[0];
    });
    res.status(201).json({ success: true, grant: present(created) });
  }));

  // Mine by default; admins see all. Also sweeps the grants that are over.
  r.get('/', route(async (req, res) => {
    const user = req.user!;
    await sweepHeadGrants(pool);
    const admin = isAdminRole(user.role);
    const { rows } = await pool.query(
      `${SELECT} WHERE ($1::boolean OR g.user_id = $2) ORDER BY g.created_at DESC LIMIT 200;`,
      [admin, user.id]
    );
    res.json({ success: true, grants: rows.map(present), canGrant: admin });
  }));

  // The ceremony decision: the temporary head, the committee's permanent head, or an admin. A higher-ranked decision
  // is not overwritten by a lower one. When the two disagree, the granting admin is told.
  r.post('/:id/decision', route(async (req, res) => {
    const { decision } = decisionInput.parse(req.body);
    const user = req.user!;
    const updated = await withTransaction(pool, async (db) => {
      const { rows: g } = await db.query(`SELECT * FROM committee_head_grants WHERE id = $1 FOR UPDATE;`, [req.params.id]);
      const grant = g[0];
      if (!grant || grant.status !== 'active') throw notFound('الجولة غير موجودة أو انتهت');
      const cids: string[] = Array.isArray(grant.committee_ids) ? grant.committee_ids.map(String) : [];
      const rank = deciderRank(user, { user_id: grant.user_id, committee_ids: cids });
      if (!rank) throw forbidden('القرار في الحفل للرئيس المؤقت أو رئيس اللجنة أو الأدمن فقط');
      const prevRank = grant.ceremony_decided_by_role ? RANK[grant.ceremony_decided_by_role as keyof typeof RANK] ?? 0 : 0;
      if (grant.ceremony_decided_by_role && RANK[rank] < prevRank) {
        throw forbidden('قرار أعلى منك مسجّل بالفعل، ولا يمكن تغييره من هنا');
      }
      const disagreed = Boolean(grant.ceremony_decided_by && grant.ceremony_decision !== decision && grant.ceremony_decision !== 'undecided');
      await db.query(
        `UPDATE committee_head_grants SET ceremony_decision = $2, ceremony_decided_by = $3, ceremony_decided_by_role = $4,
           ceremony_decided_at = NOW() WHERE id = $1;`,
        [grant.id, decision, user.id, rank]
      );
      const { rows } = await db.query(`${SELECT} WHERE g.id = $1;`, [grant.id]);
      if (grant.granted_by) {
        await notify(db, {
          title: disagreed ? 'تعارض في قرار الحفل' : 'قرار الحفل في جولة رئيس لجنة مؤقت',
          description: `${DECISION_LABEL[decision]}${disagreed ? ' — القرار السابق كان مختلفًا' : ''}`,
          type: disagreed ? 'urgent' : 'info',
          targetUserId: grant.granted_by,
          data: { grantId: grant.id },
        });
      }
      await audit(db, req, 'grant.decision', 'grant', grant.id, null, { decision, by: rank }, DECISION_LABEL[decision]);
      return rows[0];
    });
    res.json({ success: true, grant: present(updated) });
  }));

  // End a grant early: an admin (the one above the temporary head). Rows are kept.
  r.post('/:id/end', can('users.grant'), route(async (req, res) => {
    const user: Principal = req.user!;
    const ended = await withTransaction(pool, async (db) => {
      const { rows: g } = await db.query('SELECT * FROM committee_head_grants WHERE id = $1 FOR UPDATE;', [req.params.id]);
      const grant = g[0];
      if (!grant) throw notFound('الجولة غير موجودة');
      if (grant.status !== 'active') throw badRequest('الجولة منتهية بالفعل');
      await db.query("UPDATE committee_head_grants SET status = 'ended', ended_at = NOW(), ended_by = $2 WHERE id = $1;", [grant.id, user.id]);
      await notify(db, {
        title: 'انتهت جولة رئيس لجنة مؤقت',
        description: 'أنهى الأدمن الجولة. رجعت لصلاحياتك العادية.',
        type: 'info',
        targetUserId: grant.user_id,
        data: { grantId: grant.id },
      });
      const { rows } = await db.query(`${SELECT} WHERE g.id = $1;`, [grant.id]);
      await audit(db, req, 'grant.end', 'grant', grant.id, null, present(rows[0]), 'إنهاء رئيس لجنة مؤقت');
      return rows[0];
    });
    res.json({ success: true, grant: present(ended) });
  }));

  return r;
}
