import { Router, type Request } from 'express';
import { z } from 'zod';
import { assertAllowed, can } from '../auth.ts';
import { audit } from '../audit.ts';
import { type Pool, type Queryable, withTransaction } from '../db.ts';
import { badRequest, forbidden, notFound, route } from '../http.ts';
import { id, nonNegativeInt, optionalId, optionalText } from '../schemas.ts';

// Field names follow the web type SummerCourseRow (snake_case sheet columns + camelCase links).
const rowInput = z.object({
  id,
  number: nonNegativeInt,
  sheikh_name: z.string().trim().max(200).default(''),
  place: optionalText(300),
  book: optionalText(300),
  students_count: nonNegativeInt.default(0),
  delivered: z.boolean().default(false),
  corrected: z.boolean().default(false),
  reviewed: z.boolean().default(false),
  announced: z.boolean().default(false),
  ceremony: z.boolean().default(false),
  struck_out: z.boolean().default(false),
  uncertain: z.boolean().default(false),
  notes: optionalText(5000),
  committeeId: optionalId,
  courseId: optionalId,
});
type RowInput = z.infer<typeof rowInput>;

function fromRow(r: any) {
  return {
    id: r.id,
    number: r.number,
    sheikh_name: r.sheikh_name ?? '',
    place: r.place ?? '',
    book: r.book ?? '',
    students_count: r.students_count ?? 0,
    delivered: Boolean(r.delivered),
    corrected: Boolean(r.corrected),
    reviewed: Boolean(r.reviewed),
    announced: Boolean(r.announced),
    ceremony: Boolean(r.ceremony),
    struck_out: Boolean(r.struck_out),
    uncertain: Boolean(r.uncertain),
    notes: r.notes ?? undefined,
    committeeId: r.committee_id ?? undefined,
    courseId: r.course_id ?? undefined,
    courseName: r.course_name ?? undefined,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  };
}

async function upsertRow(db: Queryable, req: Request, row: RowInput) {
  let courseName: string | null = null;
  if (row.courseId) {
    const { rows } = await db.query('SELECT name FROM courses WHERE id = $1;', [row.courseId]);
    if (!rows[0]) throw badRequest('الدورة المحددة غير موجودة');
    courseName = rows[0].name;
  }
  const { rows: before } = await db.query('SELECT * FROM summer_course_rows WHERE id = $1 FOR UPDATE;', [row.id]);
  const { rows } = await db.query(
    `INSERT INTO summer_course_rows (id, number, sheikh_name, place, book, students_count, delivered, corrected,
       reviewed, announced, ceremony, struck_out, uncertain, notes, committee_id, course_id, course_name, data, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'{}'::jsonb,NOW())
     ON CONFLICT (id) DO UPDATE SET
       number = EXCLUDED.number, sheikh_name = EXCLUDED.sheikh_name, place = EXCLUDED.place, book = EXCLUDED.book,
       students_count = EXCLUDED.students_count, delivered = EXCLUDED.delivered, corrected = EXCLUDED.corrected,
       reviewed = EXCLUDED.reviewed, announced = EXCLUDED.announced, ceremony = EXCLUDED.ceremony,
       struck_out = EXCLUDED.struck_out, uncertain = EXCLUDED.uncertain, notes = EXCLUDED.notes,
       committee_id = EXCLUDED.committee_id, course_id = EXCLUDED.course_id, course_name = EXCLUDED.course_name,
       data = '{}'::jsonb, updated_at = NOW()
     RETURNING *;`,
    [row.id, row.number, row.sheikh_name, row.place, row.book, row.students_count, row.delivered, row.corrected,
      row.reviewed, row.announced, row.ceremony, row.struck_out, row.uncertain, row.notes, row.committeeId,
      row.courseId, courseName]
  );
  await audit(db, req, before[0] ? 'sheet_row.update' : 'sheet_row.create', 'summer_course_row', row.id,
    before[0] ? fromRow(before[0]) : null, fromRow(rows[0]));
  return rows[0];
}

export function summerRowsRouter(pool: Pool) {
  const r = Router();

  r.get('/', can('summerRows.read'), route(async (req, res) => {
    const courseId = z.string().max(255).optional().parse(req.query.courseId);
    const { rows } = courseId
      ? await pool.query('SELECT * FROM summer_course_rows WHERE course_id = $1 ORDER BY number ASC;', [courseId])
      : await pool.query('SELECT * FROM summer_course_rows ORDER BY number ASC;');
    res.json({ success: true, rows: rows.map(fromRow) });
  }));

  r.post('/', can('summerRows.write'), route(async (req, res) => {
    const row = rowInput.parse(req.body);
    const saved = await withTransaction(pool, (db) => upsertRow(db, req, row));
    res.json({ success: true, row: fromRow(saved) });
  }));

  /**
   * Saves many rows in one transaction. With `replaceCourseId`, rows of that course that
   * are not in the request are deleted, so "replace the whole sheet" really replaces it.
   */
  r.post('/bulk', can('summerRows.write'), route(async (req, res) => {
    const { rows, replaceCourseId } = z
      .object({ rows: z.array(rowInput).max(2000), replaceCourseId: optionalId })
      .parse(req.body);
    // Replacing a sheet deletes every row that is not in the request: super admins only.
    if (replaceCourseId && req.user!.role !== 'super_admin') throw forbidden('استبدال كشف الدورة بالكامل متاح للمشرف العام فقط');
    const saved = await withTransaction(pool, async (db) => {
      const out = [];
      for (const row of rows) out.push(await upsertRow(db, req, row));
      if (replaceCourseId) {
        const { rowCount } = await db.query(
          'DELETE FROM summer_course_rows WHERE course_id = $1 AND NOT (id = ANY($2::text[]));',
          [replaceCourseId, rows.map((x) => x.id)]
        );
        await audit(db, req, 'sheet_rows.replace', 'course', replaceCourseId, null, { kept: rows.length, deleted: rowCount });
      }
      return out;
    });
    res.json({ success: true, count: saved.length, rows: saved.map(fromRow) });
  }));

  r.delete('/:id', can('summerRows.write'), route(async (req, res) => {
    await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM summer_course_rows WHERE id = $1 FOR UPDATE;', [req.params.id]);
      if (!rows[0]) throw notFound('الصف غير موجود');
      await db.query('DELETE FROM summer_course_rows WHERE id = $1;', [req.params.id]);
      await audit(db, req, 'sheet_row.delete', 'summer_course_row', req.params.id, fromRow(rows[0]), null);
    });
    res.json({ success: true });
  }));

  return r;
}
