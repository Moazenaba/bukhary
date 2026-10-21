import express, { Router } from 'express';
import { z } from 'zod';
import { can } from '../auth.ts';
import { type Principal, canAccessExam, isAllowed } from '../policy.ts';
import { audit } from '../audit.ts';
import { type Pool, withTransaction } from '../db.ts';
import { badRequest, forbidden, notFound, route } from '../http.ts';
import { id, nonNegativeInt, optionalText } from '../schemas.ts';

export const MAX_EXAM_FILE_BYTES = 20 * 1024 * 1024;

const examInput = z.object({
  id,
  title: z.string().trim().min(1, 'عنوان الامتحان مطلوب').max(300),
  book: z.string().trim().min(1, 'الكتاب المقرر مطلوب').max(300),
  branch: optionalText(200),
  totalMarks: nonNegativeInt.default(100),
  durationMinutes: nonNegativeInt.default(60),
  questionsCount: nonNegativeInt.nullish(),
  sampleQuestions: z.array(z.string().max(2000)).max(100).optional(),
  // Ignored: the server records when a file is uploaded (WEB-01). Kept so older clients still validate.
  uploadedAt: z.string().max(100).nullish(),
  notes: optionalText(5000),
});

/**
 * Sample questions and notes are exam content: only people who may open the exam file see them
 * (API-13). Everyone else sees the title, book and file metadata.
 */
export function examFromRow(r: any, viewer?: Principal) {
  const content = !viewer || canAccessExam(viewer, r.id);
  return {
    id: r.id,
    title: r.title,
    book: r.book,
    branch: r.branch ?? '',
    totalMarks: r.total_marks ?? 100,
    durationMinutes: r.duration_minutes ?? 60,
    questionsCount: r.questions_count ?? undefined,
    sampleQuestions: content ? r.data?.sampleQuestions ?? [] : [],
    uploadedAt: r.uploaded_at ?? '',
    notes: content ? r.notes ?? undefined : undefined,
    canOpen: viewer ? canAccessExam(viewer, r.id) : undefined,
    // File metadata only; the content is served by GET /api/exams/:id/file to allowed roles.
    hasFile: Boolean(r.file_name),
    pdfFileName: r.file_name ?? undefined,
    pdfFileSize: r.size_bytes ? `${(r.size_bytes / (1024 * 1024)).toFixed(1)} MB` : undefined,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  };
}

const LIST_SQL = `
  SELECT e.id, e.title, e.book, e.branch, e.total_marks, e.duration_minutes, e.questions_count,
         e.uploaded_at, e.notes, e.data, e.updated_at, f.file_name, f.size_bytes
  FROM exams e LEFT JOIN exam_files f ON f.exam_id = e.id`;

export function examsRouter(pool: Pool) {
  const r = Router();

  // People who manage exams see them all; everyone else sees only the exams chosen for them.
  const visible = (user: Principal, examId: string) => isAllowed(user, 'exams.write') || canAccessExam(user, examId);

  r.get('/', can('exams.read'), route(async (req, res) => {
    const { rows } = await pool.query(`${LIST_SQL} ORDER BY e.updated_at DESC;`);
    res.json({ success: true, exams: rows.filter((r) => visible(req.user!, r.id)).map((r) => examFromRow(r, req.user)) });
  }));

  r.get('/:id', can('exams.read'), route(async (req, res) => {
    const { rows } = await pool.query(`${LIST_SQL} WHERE e.id = $1;`, [req.params.id]);
    if (!rows[0] || !visible(req.user!, rows[0].id)) throw notFound('الامتحان غير موجود');
    res.json({ success: true, exam: examFromRow(rows[0], req.user) });
  }));

  r.post('/', can('exams.write'), route(async (req, res) => {
    const e = examInput.parse(req.body);
    const row = await withTransaction(pool, async (db) => {
      const { rows: before } = await db.query(`${LIST_SQL} WHERE e.id = $1;`, [e.id]);
      await db.query(
        `INSERT INTO exams (id, title, book, branch, total_marks, duration_minutes, questions_count, uploaded_at, notes, data, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title, book = EXCLUDED.book, branch = EXCLUDED.branch,
           total_marks = EXCLUDED.total_marks, duration_minutes = EXCLUDED.duration_minutes,
           questions_count = EXCLUDED.questions_count, notes = EXCLUDED.notes,
           data = EXCLUDED.data, updated_at = NOW();`,
        [e.id, e.title, e.book, e.branch, e.totalMarks, e.durationMinutes, e.questionsCount ?? null,
          before[0]?.uploaded_at ?? new Date().toISOString(), e.notes, JSON.stringify({ sampleQuestions: e.sampleQuestions ?? before[0]?.data?.sampleQuestions ?? [] })]
      );
      const { rows } = await db.query(`${LIST_SQL} WHERE e.id = $1;`, [e.id]);
      await audit(db, req, before[0] ? 'exam.update' : 'exam.create', 'exam', e.id, before[0] ? examFromRow(before[0]) : null, examFromRow(rows[0]));
      return rows[0];
    });
    res.json({ success: true, exam: examFromRow(row, req.user) });
  }));

  // Raw PDF upload: Content-Type application/pdf, file name in X-File-Name (URI-encoded).
  r.put(
    '/:id/file',
    can('exams.write'),
    express.raw({ type: 'application/pdf', limit: MAX_EXAM_FILE_BYTES }),
    route(async (req, res) => {
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest('يرجى إرسال ملف PDF');
      if (body.subarray(0, 5).toString('latin1') !== '%PDF-') throw badRequest('الملف المرسل ليس ملف PDF صالحاً');
      let fileName: string;
      try {
        fileName = decodeURIComponent(String(req.headers['x-file-name'] || `${req.params.id}.pdf`)).slice(0, 255);
      } catch {
        throw badRequest('اسم الملف غير صالح');
      }
      await withTransaction(pool, async (db) => {
        const { rows } = await db.query('SELECT id FROM exams WHERE id = $1 FOR UPDATE;', [req.params.id]);
        if (!rows[0]) throw notFound('الامتحان غير موجود');
        await db.query(
          `INSERT INTO exam_files (exam_id, file_name, mime_type, size_bytes, content, uploaded_by, uploaded_at)
           VALUES ($1,$2,'application/pdf',$3,$4,$5,NOW())
           ON CONFLICT (exam_id) DO UPDATE SET file_name = EXCLUDED.file_name, size_bytes = EXCLUDED.size_bytes,
             content = EXCLUDED.content, uploaded_by = EXCLUDED.uploaded_by, uploaded_at = NOW();`,
          [req.params.id, fileName, body.length, body, req.user!.id]
        );
        await db.query('UPDATE exams SET uploaded_at = NOW(), updated_at = NOW() WHERE id = $1;', [req.params.id]);
        await audit(db, req, 'exam.file_upload', 'exam', req.params.id, null, { fileName, sizeBytes: body.length });
      });
      res.json({ success: true });
    })
  );

  r.get('/:id/file', can('exams.file'), route(async (req, res) => {
    // The per-user exam allow-list is enforced here, not only in the UI (API-06).
    if (!canAccessExam(req.user!, req.params.id)) throw forbidden('هذا الامتحان غير متاح لك');
    const { rows } = await pool.query('SELECT file_name, mime_type, content FROM exam_files WHERE exam_id = $1;', [req.params.id]);
    if (!rows[0]) throw notFound('لا يوجد ملف مرفوع لهذا الامتحان');
    res.setHeader('Content-Type', rows[0].mime_type);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(rows[0].file_name)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(rows[0].content);
  }));

  r.delete('/:id/file', can('exams.write'), route(async (req, res) => {
    await withTransaction(pool, async (db) => {
      await db.query('DELETE FROM exam_files WHERE exam_id = $1;', [req.params.id]);
      await audit(db, req, 'exam.file_delete', 'exam', req.params.id, null, null);
    });
    res.json({ success: true });
  }));

  r.delete('/:id', can('exams.delete'), route(async (req, res) => {
    await withTransaction(pool, async (db) => {
      const { rows } = await db.query(`${LIST_SQL} WHERE e.id = $1;`, [req.params.id]);
      if (!rows[0]) throw notFound('الامتحان غير موجود');
      await db.query('DELETE FROM exams WHERE id = $1;', [req.params.id]);
      await audit(db, req, 'exam.delete', 'exam', req.params.id, examFromRow(rows[0]), null);
    });
    res.json({ success: true });
  }));

  return r;
}
