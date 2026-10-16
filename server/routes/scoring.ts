import { Router } from 'express';
import { z } from 'zod';
import { assertCommitteeScope, can } from '../auth.ts';
import { audit } from '../audit.ts';
import { type Pool, withTransaction } from '../db.ts';
import { badRequest, notFound, route } from '../http.ts';
import { id, optionalText } from '../schemas.ts';

const recordInput = z
  .object({
    id,
    committeeId: id,
    studentName: z.string().trim().min(1, 'اسم الطالب مطلوب').max(200),
    questionNumber: z.coerce.number().int().min(1).max(1000),
    score: z.coerce.number().min(0).max(1000),
    maxScore: z.coerce.number().positive().max(1000).default(10),
    notes: optionalText(2000),
  })
  .refine((r) => r.score <= r.maxScore, { message: 'الدرجة أكبر من الدرجة القصوى', path: ['score'] });

function fromRow(r: any) {
  return {
    id: r.id,
    committeeId: r.committee_id,
    committeeNumber: r.committee_number ?? undefined,
    studentName: r.student_name,
    questionNumber: r.question_number,
    score: r.score === null ? null : Number(r.score),
    maxScore: r.max_score === null ? null : Number(r.max_score),
    scorerName: r.scorer_name ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  };
}

export function scoringRouter(pool: Pool) {
  const r = Router();

  r.get('/', can('scoring.read'), route(async (req, res) => {
    const committeeId = z.string().max(255).optional().parse(req.query.committeeId);
    const { rows } = committeeId
      ? await pool.query('SELECT * FROM scoring_records WHERE committee_id = $1 ORDER BY question_number, student_name;', [committeeId])
      : await pool.query('SELECT * FROM scoring_records ORDER BY committee_number, question_number, student_name LIMIT 5000;');
    res.json({ success: true, records: rows.map(fromRow) });
  }));

  r.post('/', can('scoring.write'), route(async (req, res) => {
    const s = recordInput.parse(req.body);
    const row = await withTransaction(pool, async (db) => {
      const { rows: comm } = await db.query('SELECT committee_number FROM committees WHERE id = $1;', [s.committeeId]);
      if (!comm[0]) throw badRequest('اللجنة غير موجودة');
      assertCommitteeScope(req.user!, comm[0].committee_number);
      const { rows: before } = await db.query('SELECT * FROM scoring_records WHERE id = $1 FOR UPDATE;', [s.id]);
      if (before[0] && before[0].committee_id !== s.committeeId) throw badRequest('لا يمكن نقل الدرجة إلى لجنة أخرى');
      const { rows } = await db.query(
        `INSERT INTO scoring_records (id, committee_id, committee_number, student_name, question_number, score, max_score, scorer_name, notes, data, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'{}'::jsonb,NOW())
         ON CONFLICT (id) DO UPDATE SET
           student_name = EXCLUDED.student_name, question_number = EXCLUDED.question_number,
           score = EXCLUDED.score, max_score = EXCLUDED.max_score, scorer_name = EXCLUDED.scorer_name,
           notes = EXCLUDED.notes, updated_at = NOW()
         RETURNING *;`,
        // The scorer is always the logged-in user.
        [s.id, s.committeeId, comm[0].committee_number, s.studentName, s.questionNumber, s.score, s.maxScore, req.user!.name, s.notes]
      );
      await audit(db, req, before[0] ? 'score.update' : 'score.create', 'scoring_record', s.id, before[0] ? fromRow(before[0]) : null, fromRow(rows[0]));
      return rows[0];
    });
    res.json({ success: true, record: fromRow(row) });
  }));

  r.delete('/:id', can('scoring.write'), route(async (req, res) => {
    await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM scoring_records WHERE id = $1 FOR UPDATE;', [req.params.id]);
      if (!rows[0]) throw notFound('الدرجة غير موجودة');
      assertCommitteeScope(req.user!, rows[0].committee_number);
      await db.query('DELETE FROM scoring_records WHERE id = $1;', [req.params.id]);
      await audit(db, req, 'score.delete', 'scoring_record', req.params.id, fromRow(rows[0]), null);
    });
    res.json({ success: true });
  }));

  return r;
}
