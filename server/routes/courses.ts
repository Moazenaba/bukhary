import { Router } from 'express';
import { z } from 'zod';
import { can } from '../auth.ts';
import { audit } from '../audit.ts';
import { type Pool, withTransaction } from '../db.ts';
import { conflict, notFound, route } from '../http.ts';
import { dateOnly, id, nonNegativeInt, optionalText } from '../schemas.ts';

const courseInput = z.object({
  id,
  name: z.string().trim().min(1, 'اسم الدورة مطلوب').max(300),
  season: optionalText(100),
  year: optionalText(100),
  startDate: dateOnly,
  endDate: dateOnly,
  status: z.enum(['active', 'completed', 'upcoming']).default('active'),
  description: optionalText(5000),
  targetCommitteesCount: nonNegativeInt.nullish(),
  isDefault: z.boolean().default(false),
});

export function courseFromRow(r: any) {
  return {
    id: r.id,
    name: r.name,
    season: r.season ?? undefined,
    year: r.year ?? '',
    startDate: r.start_date ?? '',
    endDate: r.end_date ?? '',
    status: r.status ?? 'active',
    description: r.description ?? undefined,
    targetCommitteesCount: r.target_committees_count ?? undefined,
    isDefault: Boolean(r.is_default),
    createdAt: r.created_at ?? '',
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  };
}

export function coursesRouter(pool: Pool) {
  const r = Router();

  r.get('/', can('courses.read'), route(async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM courses ORDER BY is_default DESC, start_date DESC NULLS LAST, name ASC;');
    res.json({ success: true, courses: rows.map(courseFromRow) });
  }));

  r.post('/', can('courses.write'), route(async (req, res) => {
    const c = courseInput.parse(req.body);
    const row = await withTransaction(pool, async (db) => {
      const { rows: before } = await db.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE;', [c.id]);
      // Exactly one default course: clearing and setting happen in the same transaction.
      if (c.isDefault) await db.query('UPDATE courses SET is_default = false WHERE is_default AND id <> $1;', [c.id]);
      const { rows } = await db.query(
        `INSERT INTO courses (id, name, season, year, start_date, end_date, status, description,
           target_committees_count, is_default, created_at, data, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'{}'::jsonb,NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, season = EXCLUDED.season, year = EXCLUDED.year,
           start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, status = EXCLUDED.status,
           description = EXCLUDED.description, target_committees_count = EXCLUDED.target_committees_count,
           is_default = EXCLUDED.is_default, data = '{}'::jsonb, updated_at = NOW()
         RETURNING *;`,
        [c.id, c.name, c.season, c.year, c.startDate, c.endDate, c.status, c.description,
          c.targetCommitteesCount ?? null, c.isDefault, new Date().toISOString()]
      );
      // Keep the denormalized course name on committees and sheet rows in step.
      if (before[0] && before[0].name !== c.name) {
        await db.query('UPDATE committees SET course_name = $2 WHERE course_id = $1;', [c.id, c.name]);
        await db.query('UPDATE summer_course_rows SET course_name = $2 WHERE course_id = $1;', [c.id, c.name]);
      }
      await audit(db, req, before[0] ? 'course.update' : 'course.create', 'course', c.id,
        before[0] ? courseFromRow(before[0]) : null, courseFromRow(rows[0]));
      return rows[0];
    });
    res.json({ success: true, course: courseFromRow(row) });
  }));

  r.delete('/:id', can('courses.write'), route(async (req, res) => {
    await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE;', [req.params.id]);
      if (!rows[0]) throw notFound('الدورة غير موجودة');
      const { rows: used } = await db.query('SELECT count(*)::int AS n FROM committees WHERE course_id = $1;', [req.params.id]);
      if (used[0].n > 0) throw conflict(`لا يمكن حذف الدورة لأنها مرتبطة بعدد ${used[0].n} لجنة. انقل اللجان أو احذفها أولاً.`);
      await db.query('DELETE FROM courses WHERE id = $1;', [req.params.id]);
      await audit(db, req, 'course.delete', 'course', req.params.id, courseFromRow(rows[0]), null);
    });
    res.json({ success: true });
  }));

  return r;
}
