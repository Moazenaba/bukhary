import { Router } from 'express';
import { z } from 'zod';
import { assertAllowed, assertCommitteeScope, can } from '../auth.ts';
import { audit } from '../audit.ts';
import { type Pool, type Queryable, withTransaction } from '../db.ts';
import { badRequest, forbidden, notFound, route } from '../http.ts';
import { isAllowed, isCommitteeInScope, isScopedRole, seesAllCommittees } from '../policy.ts';
import { dateOnly, id, optionalId, optionalText, pageQuery, pagedRows } from '../schemas.ts';
import { notify } from './notifications.ts';
import { syncCeremonyTask } from './committees.ts';
import { applyCommitteeAction } from '../workflow.ts';

/** The calendar task of a committee's ceremony: owned by the committee, never edited on its own. */
const isCeremonyTask = (taskId: string) => taskId.startsWith('task-ceremony-');
const CEREMONY_TASK_MSG = 'موعد الحفل يُدار من شاشة الحفلات (جدولة الحفل)، وإنجازه من «تم الحفل» في اللجنة';

const TASK_TYPES = ['delivery', 'receive', 'exam', 'scoring', 'review', 'ceremony', 'general'] as const;

const taskInput = z.object({
  id,
  title: z.string().trim().min(1, 'عنوان المهمة مطلوب').max(300),
  date: dateOnly.refine((v) => v !== null, 'التاريخ مطلوب بصيغة YYYY-MM-DD'),
  time: optionalText(50),
  committeeId: optionalId,
  assignedAssistantId: optionalId,
  type: z.enum(TASK_TYPES).catch('general'),
  priority: z.enum(['urgent', 'high', 'normal']).catch('normal'),
  completed: z.boolean().default(false),
  deliverable: optionalText(2000),
  notes: optionalText(5000),
});

export function taskFromRow(r: any) {
  return {
    id: r.id,
    title: r.title,
    date: r.date,
    time: r.time ?? undefined,
    committeeId: r.committee_id ?? undefined,
    committeeNumber: r.committee_number ?? undefined,
    assignedAssistantId: r.assigned_assistant_id ?? undefined,
    assignedAssistantName: r.assigned_assistant_name ?? undefined,
    type: r.type ?? 'general',
    priority: r.priority ?? 'normal',
    completed: Boolean(r.completed),
    completedAt: r.completed_at ?? undefined,
    deliverable: r.deliverable ?? undefined,
    notes: r.notes ?? undefined,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  };
}

/** Committee number and assistant name are derived from the referenced rows, not trusted from the client. */
async function resolveRefs(db: Queryable, committeeId: string | null, assistantId: string | null) {
  let committeeNumber: number | null = null;
  let assistantName: string | null = null;
  if (committeeId) {
    const { rows } = await db.query('SELECT committee_number FROM committees WHERE id = $1;', [committeeId]);
    if (!rows[0]) throw badRequest('اللجنة المرتبطة بالمهمة غير موجودة');
    committeeNumber = rows[0].committee_number;
  }
  if (assistantId) {
    const { rows } = await db.query('SELECT name, status FROM app_users WHERE id = $1;', [assistantId]);
    if (!rows[0]) throw badRequest('المعاون المكلف غير موجود');
    // A task given to an account that cannot log in would never be seen or done.
    if (rows[0].status !== 'approved') throw badRequest('لا يمكن إسناد مهمة لحساب غير معتمد');
    assistantName = rows[0].name;
  }
  return { committeeNumber, assistantName };
}

export function tasksRouter(pool: Pool) {
  const r = Router();

  // Committee heads and sheikhs see tasks of their committees, tasks assigned to them, and the
  // ceremony tasks of ceremonies they are invited to.
  r.get('/', can('tasks.read'), route(async (req, res) => {
    const q = pageQuery.parse(req.query);
    const user = req.user!;
    const all = seesAllCommittees(user);
    const where = all
      ? ''
      : `WHERE assigned_assistant_id = $2 OR committee_id = ANY($1::text[])
           OR (type = 'ceremony' AND committee_id IN (
                 SELECT id FROM committees WHERE ceremony_details -> 'attendees' @> jsonb_build_array(jsonb_build_object('id', $2::text))))`;
    const page = await pagedRows(
      pool,
      `SELECT * FROM schedule_tasks ${where} ORDER BY date ASC, time ASC NULLS LAST, id ASC`,
      `SELECT count(*)::int AS n FROM schedule_tasks ${where};`,
      q,
      all ? [] : [user.assignedCommitteeIds, user.id]
    );
    res.json({ success: true, tasks: page.rows.map(taskFromRow), total: page.total, hasMore: page.hasMore });
  }));

  r.post('/', can('tasks.write'), route(async (req, res) => {
    const t = taskInput.parse(req.body);
    const user = req.user!;
    if (isCeremonyTask(t.id)) throw badRequest(CEREMONY_TASK_MSG);
    const row = await withTransaction(pool, async (db) => {
      const { rows: before } = await db.query('SELECT * FROM schedule_tasks WHERE id = $1 FOR UPDATE;', [t.id]);
      // Committee-scoped staff work only on tasks of their committees (API-12): they cannot
      // overwrite another committee's task by reusing its id, nor create one for it.
      if (before[0]?.committee_id) assertCommitteeScope(user, before[0].committee_id);
      if (t.committeeId) assertCommitteeScope(user, t.committeeId);
      else if (isScopedRole(user.role) && !user.allCommittees && before[0] && !before[0].committee_id && before[0].assigned_assistant_id !== user.id) {
        throw forbidden('لا يمكنك تعديل مهمة عامة لم تُسند إليك');
      }
      const refs = await resolveRefs(db, t.committeeId, t.assignedAssistantId);
      if (t.assignedAssistantId && t.assignedAssistantId !== user.id && isScopedRole(user.role) && !user.allCommittees) {
        const { rows: target } = await db.query('SELECT all_committees, assigned_committee_ids FROM app_users WHERE id = $1;', [t.assignedAssistantId]);
        const theirs: string[] = Array.isArray(target[0]?.assigned_committee_ids) ? target[0].assigned_committee_ids : [];
        const shared = Boolean(target[0]?.all_committees) || theirs.some((cid) => isCommitteeInScope(user, cid));
        if (!shared) throw forbidden('لا يمكنك إسناد مهمة لشخص خارج نطاق لجانك');
      }
      const wasCompleted = Boolean(before[0]?.completed);
      const completedAt = t.completed ? (wasCompleted ? before[0].completed_at : new Date().toISOString()) : null;
      const { rows } = await db.query(
        `INSERT INTO schedule_tasks (id, title, date, time, committee_id, committee_number, assigned_assistant_id,
           assigned_assistant_name, type, priority, completed, completed_at, deliverable, notes, data, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'{}'::jsonb,NOW())
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title, date = EXCLUDED.date, time = EXCLUDED.time,
           committee_id = EXCLUDED.committee_id, committee_number = EXCLUDED.committee_number,
           assigned_assistant_id = EXCLUDED.assigned_assistant_id, assigned_assistant_name = EXCLUDED.assigned_assistant_name,
           type = EXCLUDED.type, priority = EXCLUDED.priority, completed = EXCLUDED.completed,
           completed_at = EXCLUDED.completed_at, deliverable = EXCLUDED.deliverable, notes = EXCLUDED.notes,
           data = '{}'::jsonb, updated_at = NOW()
         RETURNING *;`,
        [t.id, t.title, t.date, t.time, t.committeeId, refs.committeeNumber, t.assignedAssistantId, refs.assistantName,
          t.type, t.priority, t.completed, completedAt, t.deliverable, t.notes]
      );
      await audit(db, req, before[0] ? 'task.update' : 'task.create', 'task', t.id, before[0] ? taskFromRow(before[0]) : null, taskFromRow(rows[0]));
      if (t.assignedAssistantId && t.assignedAssistantId !== before[0]?.assigned_assistant_id && t.assignedAssistantId !== user.id) {
        await notify(db, { title: 'مهمة جديدة مسندة إليك', description: `${t.title} — ${t.date}`, type: 'info', committeeId: t.committeeId, targetUserId: t.assignedAssistantId });
      }
      return rows[0];
    });
    res.json({ success: true, task: taskFromRow(row) });
  }));

  // Anyone allowed to manage tasks may toggle; an assistant may also toggle tasks assigned to them.
  r.patch('/:id/toggle', route(async (req, res) => {
    const { completed } = z.object({ completed: z.boolean() }).parse(req.body);
    const row = await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM schedule_tasks WHERE id = $1 FOR UPDATE;', [req.params.id]);
      const task = rows[0];
      if (!task) throw notFound('المهمة غير موجودة');
      const user = req.user!;
      if (isCeremonyTask(task.id) && task.committee_id) {
        // Ticking a ceremony in the calendar records «تم الحفل» on the committee (same rules as the
        // stage action: order, permission, not before its date), and the task follows it.
        assertAllowed(user, 'committees.finalize');
        assertCommitteeScope(user, task.committee_id);
        const { rows: cs } = await db.query('SELECT * FROM committees WHERE id = $1 FOR UPDATE;', [task.committee_id]);
        const c = cs[0];
        if (!c) throw notFound('اللجنة غير موجودة');
        const next = applyCommitteeAction(
          { stages: c.stages ?? {}, receivedByAssistant: c.received_by_assistant, examApprovedBy: c.exam_approved_by,
            scoringDetails: c.scoring_details, aggregationDetails: c.aggregation_details, ceremonyDetails: c.ceremony_details },
          completed ? { type: 'completeStage', stage: 'ceremony' } : { type: 'reopenStage', stage: 'ceremony' },
          user,
          new Date().toISOString()
        );
        const { rows: upd } = await db.query('UPDATE committees SET stages = $2::jsonb, updated_at = NOW() WHERE id = $1 RETURNING *;', [c.id, JSON.stringify(next.stages)]);
        await syncCeremonyTask(db, upd[0], { detailsChanged: false });
        await audit(db, req, completed ? 'committee.completeStage' : 'committee.reopenStage', 'committee', c.id, null, null, 'ceremony');
        const { rows: after } = await db.query('SELECT * FROM schedule_tasks WHERE id = $1;', [task.id]);
        return after[0];
      }
      const isAssignee = task.assigned_assistant_id === user.id;
      if (!isAssignee && !isAllowed(user, 'tasks.write')) throw forbidden();
      if (!isAssignee && task.committee_id) assertCommitteeScope(user, task.committee_id);
      const { rows: updated } = await db.query(
        // completed_at is timestamptz (migration 006); a text parameter here made every toggle fail (NEW-06).
        `UPDATE schedule_tasks SET completed = $2,
           completed_at = CASE WHEN $2 THEN COALESCE(completed_at, NOW()) ELSE NULL END, updated_at = NOW()
         WHERE id = $1 RETURNING *;`,
        [task.id, completed]
      );
      await audit(db, req, 'task.toggle', 'task', task.id, { completed: task.completed }, { completed });
      return updated[0];
    });
    res.json({ success: true, task: taskFromRow(row) });
  }));

  r.delete('/:id', route(async (req, res) => {
    assertAllowed(req.user!, 'tasks.delete');
    await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM schedule_tasks WHERE id = $1 FOR UPDATE;', [req.params.id]);
      if (!rows[0]) throw notFound('المهمة غير موجودة');
      if (isCeremonyTask(rows[0].id) && rows[0].committee_id) throw badRequest(CEREMONY_TASK_MSG);
      if (rows[0].committee_id) assertCommitteeScope(req.user!, rows[0].committee_id);
      await db.query('DELETE FROM schedule_tasks WHERE id = $1;', [req.params.id]);
      await audit(db, req, 'task.delete', 'task', req.params.id, taskFromRow(rows[0]), null);
    });
    res.json({ success: true });
  }));

  return r;
}
