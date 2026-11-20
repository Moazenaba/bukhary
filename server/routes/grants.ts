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
 * «شيخ اللجنة»: temporary committee-head grants. An admin makes an approved sheikh the head of one or more
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
 * The line a notification carries about a committee: its number, place and the committee head to call.
 * The head is the permanent committee head (role committee_head on this committee), by name and phone.
 */
export async function committeeLine(db: Queryable, committeeId: string) {
  const { rows } = await db.query(
    'SELECT committee_number, committee_name, COALESCE(sheikh_country, \'\') AS place FROM committees WHERE id = $1;',
    [committeeId]
  );
  const c = rows[0];
  if (!c) return null;
  const { rows: heads } = await db.query(
    `SELECT name, COALESCE(phone, '') AS phone FROM app_users
     WHERE role = 'committee_head' AND assigned_committee_ids ? $1 ORDER BY name LIMIT 1;`,
    [committeeId]
  );
  const head = heads[0] ? `رئيس اللجنة: ${heads[0].name}${heads[0].phone ? ` (${heads[0].phone})` : ''}` : 'رئيس اللجنة: لم يُسند بعد';
  return {
    number: c.committee_number as number,
    title: `لجنة ${c.committee_number}`,
    text: [c.place || 'المكان لم يُحدد بعد', head].join(' · '),
  };
}

/**
 * Ends what is over. Run on every read of the lists and by the scheduled maintenance:
 *   - a committee whose ceremony is done leaves every «شيخ اللجنة» grant on it (the grant ends when no committee is left),
 *     and every observer on it ends too; each person is told;
 *   - a grant with «no» or «undecided» ends on its last day (the granting admin is told if undecided).
 */
/**
 * Runs once, the moment a committee's ceremony is marked done for the first time (the committee screens call it).
 * Every «شيخ اللجنة» grant on that committee loses it, and every observer on it ends; each person is told.
 * It is not run on a timer: an observer assigned after the ceremony is over keeps the assignment.
 */
export async function onCeremonyDone(db: Queryable, committeeId: string) {
  let ended = 0;
  const line = await committeeLine(db, committeeId);
  const { rows: grants } = await db.query(
    `SELECT id, user_id FROM committee_head_grants WHERE status = 'active' AND committee_ids ? $1;`,
    [committeeId]
  );
  for (const g of grants) {
    await db.query(
      `UPDATE committee_head_grants
       SET committee_ids = committee_ids - $2::text,
           status = CASE WHEN jsonb_array_length(committee_ids - $2::text) = 0 THEN 'ended' ELSE status END,
           ended_at = CASE WHEN jsonb_array_length(committee_ids - $2::text) = 0 THEN NOW() ELSE ended_at END
       WHERE id = $1;`,
      [g.id, committeeId]
    );
    ended++;
    await notify(db, {
      title: `انتهى حفل ${line?.title ?? 'اللجنة'}`,
      description: `انتهت صلاحية «شيخ اللجنة» لك في هذه اللجنة. ${line?.text ?? ''}`,
      type: 'info',
      committeeId,
      targetUserId: g.user_id,
      data: { grantId: g.id },
    });
  }
  const { rows: observers } = await db.query(
    `UPDATE committee_assignments SET status = 'ended', ended_at = NOW()
     WHERE committee_id = $1 AND status = 'active' RETURNING user_id;`,
    [committeeId]
  );
  for (const o of observers) {
    await notify(db, {
      title: `انتهى التكليف في ${line?.title ?? 'اللجنة'}`,
      description: `انتهى حفل اللجنة وانتهت المراقبة. ${line?.text ?? ''}`,
      type: 'info',
      committeeId,
      targetUserId: o.user_id,
    });
  }
  return ended + observers.length;
}

export async function sweepHeadGrants(db: Queryable) {
  let ended = 0;
  // 2. Grants over their window that are not «yes»: end them, and tell the granting admin when nothing was decided.
  const { rows } = await db.query(
    `SELECT g.id, g.user_id, g.ceremony_decision, g.granted_by FROM committee_head_grants g
     WHERE g.status = 'active' AND g.ends_on < CURRENT_DATE AND g.ceremony_decision <> 'yes';`
  );
  for (const g of rows) {
    await db.query("UPDATE committee_head_grants SET status = 'ended', ended_at = NOW() WHERE id = $1 AND status = 'active';", [g.id]);
    ended++;
    if (g.granted_by) {
      await notify(db, {
        title: 'انتهت مدة «شيخ اللجنة»',
        description:
          g.ceremony_decision === 'no'
            ? 'انتهت المدة، والقرار: لن يكون هناك حفل.'
            : 'انتهت المدة ولم يُحدد الحفل بعد. رجع الشيخ لصلاحياته العادية؛ راجع الأمر إن كان محتاج تمديد.',
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
      // One notification per committee, each with its place and the committee head to call.
      for (const committeeId of body.committeeIds) {
        const line = await committeeLine(db, committeeId);
        await notify(db, {
          title: `تم إسنادك «شيخ اللجنة» في ${line?.title ?? 'لجنة'}`,
          description: `من ${body.startsOn} حتى ${body.endsOn} · ${line?.text ?? ''}`,
          type: 'info',
          committeeId,
          targetUserId: body.userId,
          data: { grantId: id },
        });
      }
      const { rows } = await db.query(`${SELECT} WHERE g.id = $1;`, [id]);
      await audit(db, req, 'grant.create', 'grant', id, null, present(rows[0]), `شيخ اللجنة: ${names}`);
      return rows[0];
    });
    res.status(201).json({ success: true, grant: present(created) });
  }));

  // Mine by default; admins see all. Also sweeps the grants that are over.
  r.get('/', route(async (req, res) => {
    const user = req.user!;
    await sweepHeadGrants(pool);
    const admin = isAdminRole(user.role);
    // Admins see every grant; a committee head sees the grants on their own committees (to decide the ceremony);
    // everyone else sees only their own.
    const { rows } = await pool.query(
      `${SELECT} WHERE ($1::boolean OR g.user_id = $2
          OR ($3::boolean AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(g.committee_ids) x WHERE x = ANY($4::text[]))))
        ORDER BY g.created_at DESC LIMIT 200;`,
      [admin, user.id, user.role === 'committee_head', user.assignedCommitteeIds]
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
          title: disagreed ? 'تعارض في قرار الحفل' : 'قرار الحفل في «شيخ اللجنة»',
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
        title: 'انتهت مدة «شيخ اللجنة»',
        description: 'أنهى الأدمن الجولة. رجعت لصلاحياتك العادية.',
        type: 'info',
        targetUserId: grant.user_id,
        data: { grantId: grant.id },
      });
      const { rows } = await db.query(`${SELECT} WHERE g.id = $1;`, [grant.id]);
      await audit(db, req, 'grant.end', 'grant', grant.id, null, present(rows[0]), 'إنهاء «شيخ اللجنة»');
      return rows[0];
    });
    res.json({ success: true, grant: present(ended) });
  }));

  return r;
}
