import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { assertAllowed, assertCommitteeScope, can } from '../auth.ts';
import { audit } from '../audit.ts';
import { type Pool, type Queryable, withTransaction } from '../db.ts';
import { badRequest, conflict, forbidden, notFound, route } from '../http.ts';
import { type Principal, isAdminRole, isAllowed, isCommitteeInScope } from '../policy.ts';
import { notifyCeremonyAttendees } from './committees.ts';
import { notify } from './notifications.ts';

/**
 * Extra assignments: a sheikh (or head) keeps their role and is sent as an «مراقب» to another committee,
 * for its exam or its ceremony. The assignment only ever ADDS read-only powers inside that committee
 * (see policy.ts: observing); it never changes the account, and ending it only changes its status.
 */

const SELECT = `
  SELECT a.id, a.user_id, u.name AS user_name, a.committee_id, c.committee_number, c.committee_name, a.kind, a.task, a.status,
         to_char(a.starts_on, 'YYYY-MM-DD') AS starts_on, to_char(a.ends_on, 'YYYY-MM-DD') AS ends_on,
         a.assigned_by, a.assigned_by_name, a.created_at, a.ended_at, a.ended_by,
         (a.status = 'active' AND (a.ends_on IS NULL OR a.ends_on + 1 >= CURRENT_DATE)) AS effective
  FROM committee_assignments a
  JOIN app_users u ON u.id = a.user_id
  JOIN committees c ON c.id = a.committee_id`;

function present(r: any) {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    committeeId: r.committee_id,
    committeeNumber: r.committee_number,
    committeeName: r.committee_name,
    kind: r.kind,
    task: r.task,
    // «active» only while it is also inside its dates; an expired one reads as «ended».
    status: r.status === 'active' && !r.effective ? 'ended' : r.status,
    startsOn: r.starts_on ?? '',
    endsOn: r.ends_on ?? '',
    assignedBy: r.assigned_by_name,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    endedAt: r.ended_at instanceof Date ? r.ended_at.toISOString() : r.ended_at ?? undefined,
  };
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'تاريخ غير صالح');
const createInput = z.object({
  userId: z.string().min(1).max(255),
  committeeId: z.string().min(1).max(255),
  task: z.enum(['exam', 'ceremony']),
  startsOn: day.optional(),
  endsOn: day.optional(),
});

const TASK_LABEL = { exam: 'مراقبة امتحان', ceremony: 'متابعة حفل' } as const;

/** Adds or removes a person on the committee's ceremony list (used by «ceremony» assignments). */
async function setCeremonyAttendee(db: Queryable, committeeId: string, person: { id: string; name: string }, present: boolean) {
  const { rows } = await db.query('SELECT * FROM committees WHERE id = $1 FOR UPDATE;', [committeeId]);
  const committee = rows[0];
  if (!committee) return;
  const before = committee.ceremony_details ?? {};
  const beforeAttendees: Array<{ id: string; name: string }> = before.attendees ?? [];
  const has = beforeAttendees.some((a) => a.id === person.id);
  if (has === present) return;
  const attendees = present ? [...beforeAttendees, { id: person.id, name: person.name }] : beforeAttendees.filter((a) => a.id !== person.id);
  const after = { ...before, attendees };
  await db.query('UPDATE committees SET ceremony_details = $2::jsonb, updated_at = NOW() WHERE id = $1;', [committeeId, JSON.stringify(after)]);
  await notifyCeremonyAttendees(db, committee, before, beforeAttendees, after);
}

/** Ends the assignments whose dates passed (the observer's powers already stop by date; this tidies up). */
async function sweepExpired(db: Queryable) {
  const { rows } = await db.query(
    `UPDATE committee_assignments SET status = 'ended', ended_at = NOW()
     WHERE status = 'active' AND ends_on IS NOT NULL AND ends_on + 1 < CURRENT_DATE
     RETURNING id, user_id, committee_id, task;`
  );
  for (const r of rows) {
    if (r.task !== 'ceremony') continue;
    const { rows: u } = await db.query('SELECT id, name FROM app_users WHERE id = $1;', [r.user_id]);
    if (u[0]) await setCeremonyAttendee(db, r.committee_id, u[0], false);
  }
}

export function assignmentsRouter(pool: Pool) {
  const r = Router();

  /** May `user` manage assignments on this committee: the right plus the committee in scope. */
  const assertManage = (user: Principal, committeeId: string) => {
    assertAllowed(user, 'assignments.manage');
    assertCommitteeScope(user, committeeId);
  };

  // Mine by default; ?committeeId= (managers of that committee) or ?userId= (managers; admins see all).
  r.get('/', route(async (req, res) => {
    const user = req.user!;
    await sweepExpired(pool);
    const q = z.object({ committeeId: z.string().max(255).optional(), userId: z.string().max(255).optional() }).parse(req.query);
    let where = 'a.user_id = $1';
    let params: unknown[] = [user.id];
    if (q.committeeId) {
      assertManage(user, q.committeeId);
      where = 'a.committee_id = $1';
      params = [q.committeeId];
    } else if (q.userId && q.userId !== user.id) {
      assertAllowed(user, 'assignments.manage');
      where = 'a.user_id = $1';
      params = [q.userId];
    }
    const { rows } = await pool.query(`${SELECT} WHERE ${where} ORDER BY a.created_at DESC;`, params);
    // A head sees only assignments on committees they head.
    const visible = rows.filter((x) => x.user_id === user.id || isAdminRole(user.role) || isCommitteeInScope(user, x.committee_id));
    res.json({ success: true, assignments: visible.map(present) });
  }));

  r.post('/', can('assignments.manage'), route(async (req, res) => {
    const body = createInput.parse(req.body);
    const user = req.user!;
    assertManage(user, body.committeeId);
    if (body.userId === user.id) throw forbidden('لا يمكنك تكليف نفسك');
    if (body.startsOn && body.endsOn && body.endsOn < body.startsOn) throw badRequest('تاريخ النهاية قبل تاريخ البداية');
    const created = await withTransaction(pool, async (db) => {
      const { rows: c } = await db.query('SELECT id, committee_number, committee_name FROM committees WHERE id = $1;', [body.committeeId]);
      if (!c[0]) throw notFound('اللجنة غير موجودة');
      const { rows: u } = await db.query(
        'SELECT id, name, role, status, assigned_committee_ids FROM app_users WHERE id = $1 FOR UPDATE;',
        [body.userId]
      );
      const target = u[0];
      if (!target || target.status !== 'approved') throw badRequest('الشخص المختار غير موجود أو غير معتمد');
      if (target.role !== 'sheikh' && target.role !== 'committee_head') throw badRequest('التكليف للشيوخ ورؤساء اللجان فقط');
      if ((target.assigned_committee_ids ?? []).includes(body.committeeId)) throw badRequest('هذا الشخص مسند لهذه اللجنة أصلًا');
      const id = crypto.randomUUID();
      try {
        await db.query(
          `INSERT INTO committee_assignments (id, user_id, committee_id, kind, task, status, starts_on, ends_on, assigned_by, assigned_by_name)
           VALUES ($1,$2,$3,'observer',$4,'active',$5,$6,$7,$8);`,
          [id, body.userId, body.committeeId, body.task, body.startsOn ?? null, body.endsOn ?? null, user.id, user.name]
        );
      } catch (e: any) {
        if (e?.code === '23505') throw conflict('هذا الشخص مكلّف بالفعل بنفس المهمة على هذه اللجنة');
        throw e;
      }
      if (body.task === 'ceremony') await setCeremonyAttendee(db, body.committeeId, target, true);
      await notify(db, {
        title: `تم تكليفك بـ${TASK_LABEL[body.task]} في لجنة ${c[0].committee_number}`,
        description: c[0].committee_name,
        type: 'info',
        committeeId: body.committeeId,
        targetUserId: body.userId,
      });
      const { rows } = await db.query(`${SELECT} WHERE a.id = $1;`, [id]);
      await audit(db, req, 'assignment.create', 'assignment', id, null, present(rows[0]), `${TASK_LABEL[body.task]} — لجنة ${c[0].committee_number}`);
      return rows[0];
    });
    res.status(201).json({ success: true, assignment: present(created) });
  }));

  const finish = (status: 'ended' | 'cancelled') =>
    route(async (req, res) => {
      const user = req.user!;
      const out = await withTransaction(pool, async (db) => {
        const { rows } = await db.query(`${SELECT} WHERE a.id = $1 FOR UPDATE OF a;`, [req.params.id]);
        const before = rows[0];
        if (!before) throw notFound('التكليف غير موجود');
        // Not being allowed to manage it looks the same as it not existing.
        if (!isAllowed(user, 'assignments.manage') || !isCommitteeInScope(user, before.committee_id)) throw notFound('التكليف غير موجود');
        if (before.status !== 'active') throw conflict('هذا التكليف منتهٍ أو ملغى بالفعل');
        await db.query(
          'UPDATE committee_assignments SET status = $2, ended_at = NOW(), ended_by = $3 WHERE id = $1;',
          [before.id, status, user.id]
        );
        if (before.task === 'ceremony') await setCeremonyAttendee(db, before.committee_id, { id: before.user_id, name: before.user_name }, false);
        const { rows: after } = await db.query(`${SELECT} WHERE a.id = $1;`, [before.id]);
        await audit(db, req, status === 'ended' ? 'assignment.end' : 'assignment.cancel', 'assignment', before.id, present(before), present(after[0]));
        return after[0];
      });
      res.json({ success: true, assignment: present(out) });
    });
  r.post('/:id/end', finish('ended'));
  r.post('/:id/cancel', finish('cancelled'));

  // The observer's notes: written by the assignee while the assignment is in force.
  r.post('/:id/observations', route(async (req, res) => {
    const user = req.user!;
    const body = z.object({ note: z.string().trim().min(1, 'اكتب الملاحظة').max(4000) }).parse(req.body);
    const mine = (user.observing ?? []).find((o) => o.id === req.params.id);
    if (!mine) throw forbidden('هذا التكليف غير نشط أو ليس لك');
    const id = crypto.randomUUID();
    await withTransaction(pool, async (db) => {
      await db.query(
        'INSERT INTO committee_observations (id, assignment_id, committee_id, user_id, note) VALUES ($1,$2,$3,$4,$5);',
        [id, mine.id, mine.committeeId, user.id, body.note]
      );
      await audit(db, req, 'observation.create', 'committee', mine.committeeId, null, { note: body.note }, `ملاحظة مراقبة (${TASK_LABEL[mine.task]})`);
    });
    res.status(201).json({ success: true, id });
  }));

  r.get('/:id/observations', route(async (req, res) => {
    const user = req.user!;
    const { rows: a } = await pool.query('SELECT user_id, committee_id FROM committee_assignments WHERE id = $1;', [req.params.id]);
    const asg = a[0];
    const own = asg && asg.user_id === user.id;
    const manages = asg && isAllowed(user, 'assignments.manage') && isCommitteeInScope(user, asg.committee_id);
    if (!asg || !(own || manages)) throw notFound('التكليف غير موجود');
    const { rows } = await pool.query(
      `SELECT o.id, o.note, o.created_at, u.name AS user_name FROM committee_observations o JOIN app_users u ON u.id = o.user_id
       WHERE o.assignment_id = $1 ORDER BY o.created_at ASC;`,
      [req.params.id]
    );
    res.json({
      success: true,
      observations: rows.map((x) => ({ id: x.id, note: x.note, by: x.user_name, at: x.created_at instanceof Date ? x.created_at.toISOString() : x.created_at })),
    });
  }));

  return r;
}
