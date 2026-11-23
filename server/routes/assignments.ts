import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { assertAllowed, can } from '../auth.ts';
import { audit } from '../audit.ts';
import { type Pool, type Queryable, withTransaction } from '../db.ts';
import { STAFF_SELECT, addStaff, endStaff, loadCommittee } from '../staff.ts';
import { badRequest, conflict, forbidden, notFound, route } from '../http.ts';
import { LIFECYCLE, canStaffCommittee, committeeViewer, isAdminRole, isAllowed, isCommitteeInScope, isManagerRole, lifecycleIndex } from '../policy.ts';

/**
 * Extra assignments: a sheikh (or head) keeps their role and is sent as an «مراقب» to another committee,
 * for its exam or its ceremony. The assignment only ever ADDS read-only powers inside that committee
 * (see policy.ts: observing); it never changes the account, and ending it only changes its status.
 */

// Assignments are committee_staff rows (observer → task «exam», ceremony_sheikh → task «ceremony»), shown in the
// shape older clients know.
const SELECT = `
  SELECT s.id, s.user_id, u.name AS user_name, s.committee_id, c.committee_number, c.committee_name, 'observer' AS kind,
         CASE s.role WHEN 'observer' THEN 'exam' ELSE 'ceremony' END AS task, s.status, '' AS starts_on, '' AS ends_on,
         s.assigned_by, s.assigned_by_name, s.created_at, s.ended_at, s.ended_by, true AS effective, s.role
  FROM committee_staff s
  JOIN app_users u ON u.id = s.user_id
  JOIN committees c ON c.id = s.committee_id`;
const JOBS = `s.role IN ('observer', 'ceremony_sheikh')`;

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
    status: r.status === 'active' ? 'active' : r.status === 'excused' ? 'cancelled' : 'ended',
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
  note: z.string().max(1000).nullish(),
  confirmConflicts: z.boolean().optional(),
});

const TASK_LABEL = { exam: 'مراقبة امتحان', ceremony: 'متابعة حفل' } as const;

/** Kept for the maintenance job: jobs no longer expire by date (the committee lifecycle decides). */
export async function sweepExpired(_db: Queryable) {}

export function assignmentsRouter(pool: Pool) {
  const r = Router();

  // Mine by default; ?committeeId= (who may staff that committee) or ?userId= (managers; admins see all).
  r.get('/', route(async (req, res) => {
    const user = req.user!;
    const q = z.object({ committeeId: z.string().max(255).optional(), userId: z.string().max(255).optional() }).parse(req.query);
    let where = `s.user_id = $1 AND ${JOBS}`;
    let params: unknown[] = [user.id];
    if (q.committeeId) {
      assertAllowed(user, 'assignments.manage');
      if (!canStaffCommittee(user, q.committeeId) && !isCommitteeInScope(user, q.committeeId)) throw forbidden('هذه اللجنة غير مسندة إليك');
      where = `s.committee_id = $1 AND ${JOBS}`;
      params = [q.committeeId];
    } else if (q.userId && q.userId !== user.id) {
      assertAllowed(user, 'assignments.manage');
      where = `s.user_id = $1 AND ${JOBS}`;
      params = [q.userId];
    }
    const { rows } = await pool.query(`${SELECT} WHERE ${where} ORDER BY s.created_at DESC;`, params);
    const visible = rows.filter(
      (x) => x.user_id === user.id || isManagerRole(user.role) || isCommitteeInScope(user, x.committee_id)
    );
    res.json({ success: true, assignments: visible.map(present) });
  }));

  r.post('/', can('assignments.manage'), route(async (req, res) => {
    const body = createInput.parse(req.body);
    const user = req.user!;
    if (body.userId === user.id) throw forbidden('لا يمكنك تكليف نفسك');
    if (body.startsOn && body.endsOn && body.endsOn < body.startsOn) throw badRequest('تاريخ النهاية قبل تاريخ البداية');
    const created = await withTransaction(pool, async (db) => {
      const committee = await loadCommittee(db, body.committeeId, true);
      if (committeeViewer(user, committee) === 'none' && !isManagerRole(user.role)) throw forbidden('هذه اللجنة غير مسندة إليك');
      if (!canStaffCommittee(user, committee.id)) throw forbidden('لا تملك صلاحية تعيين أشخاص في هذه اللجنة');
      const { rows: u } = await db.query('SELECT role FROM app_users WHERE id = $1;', [body.userId]);
      if (u[0] && u[0].role !== 'sheikh' && u[0].role !== 'committee_head') throw badRequest('التكليف للشيوخ ورؤساء اللجان فقط');
      const role = body.task === 'exam' ? 'observer' : 'ceremony_sheikh';
      if (!isAdminRole(user.role)) {
        if (role === 'observer' && lifecycleIndex(committee.lifecycle) < LIFECYCLE.indexOf('observers_open')) {
          throw forbidden('لم يسمح الأدمن بإضافة المراقبين لهذه اللجنة بعد');
        }
        if (role === 'ceremony_sheikh' && lifecycleIndex(committee.lifecycle) < LIFECYCLE.indexOf('accredited')) {
          throw forbidden('يُعيَّن مشايخ الحفلة بعد اعتماد اللجنة');
        }
      }
      const row = await addStaff(db, req, committee, {
        userId: body.userId,
        role,
        note: body.note ?? null,
        // Older clients do not know the warning: they assign as before.
        confirmConflicts: body.confirmConflicts ?? true,
      });
      const { rows } = await db.query(`${SELECT} WHERE s.id = $1;`, [row.id]);
      await audit(db, req, 'assignment.create', 'assignment', row.id, null, present(rows[0]), `${TASK_LABEL[body.task]} — لجنة ${committee.committee_number}`);
      return rows[0];
    });
    res.status(201).json({ success: true, assignment: present(created) });
  }));

  const finish = (status: 'ended' | 'cancelled') =>
    route(async (req, res) => {
      const user = req.user!;
      const out = await withTransaction(pool, async (db) => {
        const { rows } = await db.query(`${STAFF_SELECT} WHERE s.id = $1 AND ${JOBS} FOR UPDATE OF s;`, [req.params.id]);
        const before = rows[0];
        if (!before) throw notFound('التكليف غير موجود');
        // Not being allowed to manage it looks the same as it not existing.
        if (!isAllowed(user, 'assignments.manage') || !canStaffCommittee(user, before.committee_id)) throw notFound('التكليف غير موجود');
        if (before.status !== 'active') throw conflict('هذا التكليف منتهٍ أو ملغى بالفعل');
        const committee = await loadCommittee(db, before.committee_id, true);
        await endStaff(db, req, committee, before, { status: 'removed' });
        const { rows: after } = await db.query(`${SELECT} WHERE s.id = $1;`, [before.id]);
        await audit(db, req, status === 'ended' ? 'assignment.end' : 'assignment.cancel', 'assignment', before.id, null, present(after[0]));
        return after[0];
      });
      res.json({ success: true, assignment: { ...present(out), status } });
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
    const { rows: a } = await pool.query('SELECT user_id, committee_id FROM committee_staff WHERE id = $1;', [req.params.id]);
    const asg = a[0];
    const own = asg && asg.user_id === user.id;
    const manages = asg && isAllowed(user, 'assignments.manage') && (canStaffCommittee(user, asg.committee_id) || isCommitteeInScope(user, asg.committee_id));
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
