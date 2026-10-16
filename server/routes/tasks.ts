import { Router } from 'express';
import { z } from 'zod';
import { assertAllowed, can } from '../auth.ts';
import { audit } from '../audit.ts';
import { type Pool, type Queryable, withTransaction } from '../db.ts';
import { badRequest, forbidden, notFound, route } from '../http.ts';
import { isAllowed } from '../policy.ts';
import { id, optionalId, optionalText, pageQuery, pagedRows } from '../schemas.ts';

const TASK_TYPES = ['delivery', 'receive', 'exam', 'scoring', 'review', 'ceremony', 'general'] as const;

const taskInput = z.object({
  id,
  title: z.string().trim().min(1, 'عنوان المهمة مطلوب').max(300),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD'),
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
    const { rows } = await db.query('SELECT name FROM app_users WHERE id = $1;', [assistantId]);
    if (!rows[0]) throw badRequest('المعاون المكلف غير موجود');
    assistantName = rows[0].name;
  }
  return { committeeNumber, assistantName };
}

export function tasksRouter(pool: Pool) {
  const r = Router();

  r.get('/', can('tasks.read'), route(async (req, res) => {
    const q = pageQuery.parse(req.query);
    const page = await pagedRows(
      pool,
      'SELECT * FROM schedule_tasks ORDER BY date ASC, time ASC NULLS LAST, id ASC',
      'SELECT count(*)::int AS n FROM schedule_tasks;',
      q
    );
    res.json({ success: true, tasks: page.rows.map(taskFromRow), total: page.total, hasMore: page.hasMore });
  }));

  r.post('/', can('tasks.write'), route(async (req, res) => {
    const t = taskInput.parse(req.body);
    const row = await withTransaction(pool, async (db) => {
      const { rows: before } = await db.query('SELECT * FROM schedule_tasks WHERE id = $1 FOR UPDATE;', [t.id]);
      const refs = await resolveRefs(db, t.committeeId, t.assignedAssistantId);
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
      const isAssignee = task.assigned_assistant_id === user.id && user.role !== 'auditor';
      if (!isAssignee && !isAllowed(user, 'tasks.write')) throw forbidden();
      const { rows: updated } = await db.query(
        `UPDATE schedule_tasks SET completed = $2, completed_at = CASE WHEN $2 THEN $3 ELSE NULL END, updated_at = NOW()
         WHERE id = $1 RETURNING *;`,
        [task.id, completed, new Date().toISOString()]
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
      await db.query('DELETE FROM schedule_tasks WHERE id = $1;', [req.params.id]);
      await audit(db, req, 'task.delete', 'task', req.params.id, taskFromRow(rows[0]), null);
    });
    res.json({ success: true });
  }));

  return r;
}
