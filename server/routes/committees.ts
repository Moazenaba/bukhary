import { Router, type Request } from 'express';
import { z } from 'zod';
import { assertAllowed, assertCommitteeScope, can } from '../auth.ts';
import { audit } from '../audit.ts';
import type { AppConfig } from '../config.ts';
import { type Pool, type Queryable, withTransaction } from '../db.ts';
import { badRequest, conflict, notFound, route } from '../http.ts';
import { type Action, isScopedRole } from '../policy.ts';
import { STAGE_ACTION, actionPermission, applyCommitteeAction, committeeAction, mergeLegacyStages } from '../workflow.ts';
import { notify } from './notifications.ts';
import {
  STAGE_KEYS,
  type StageKey,
  aggregationDetails,
  approvalInput,
  ceremonyDetails,
  dateOnly,
  expectedUpdatedAt,
  id,
  nonNegativeInt,
  optionalId,
  optionalText,
  pageQuery,
  pagedRows,
  receptionInput,
  scoringDetails,
  stagesPartial,
} from '../schemas.ts';

const emptyStages = () => Object.fromEntries(STAGE_KEYS.map((k) => [k, { completed: false }]));

const committeeInput = z.object({
  id,
  committeeNumber: nonNegativeInt,
  committeeName: z.string().trim().min(1, 'اسم اللجنة مطلوب').max(300),
  associationName: optionalText(300),
  members: z.array(z.string().max(200)).max(50).default([]),
  branch: optionalText(200),
  competitionBook: optionalText(300),
  generalNotes: z.string().max(10_000).nullish().transform((v) => v ?? ''),
  // Every committee belongs to a course (the course sheet and the statistics depend on it).
  courseId: id,
  sheikhName: optionalText(200),
  sheikhPhone: optionalText(50),
  sheikhCountry: optionalText(200),
  studentsCount: nonNegativeInt.default(0),
  isWomenCommittee: z.boolean().default(false),
  stages: stagesPartial.optional(),
  scoringDetails: scoringDetails.nullish(),
  aggregationDetails: aggregationDetails.nullish(),
  ceremonyDetails: ceremonyDetails.nullish(),
  createdDate: dateOnly,
  createdAtTime: optionalText(100),
  expectedUpdatedAt,
});
type CommitteeInput = z.infer<typeof committeeInput>;

const patchInput = z
  .object({
    stages: stagesPartial.optional(),
    scoringDetails: scoringDetails.optional(),
    aggregationDetails: aggregationDetails.optional(),
    ceremonyDetails: ceremonyDetails.optional(),
    receivedByAssistant: receptionInput.nullable().optional(),
    examApprovedBy: approvalInput.nullable().optional(),
    expectedUpdatedAt,
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'expectedUpdatedAt'), 'لا توجد تعديلات');


export function committeeFromRow(r: any) {
  return {
    id: r.id,
    committeeNumber: r.committee_number,
    committeeName: r.committee_name,
    associationName: r.association_name ?? undefined,
    members: r.members ?? [],
    branch: r.branch ?? '',
    competitionBook: r.competition_book ?? '',
    generalNotes: r.general_notes ?? '',
    courseId: r.course_id ?? undefined,
    courseName: r.course_name ?? undefined,
    sheikhName: r.sheikh_name ?? undefined,
    sheikhPhone: r.sheikh_phone ?? undefined,
    sheikhCountry: r.sheikh_country ?? undefined,
    studentsCount: r.students_count ?? 0,
    isWomenCommittee: Boolean(r.is_women_committee),
    stages: { ...emptyStages(), ...(r.stages ?? {}) },
    scoringDetails: r.scoring_details && Object.keys(r.scoring_details).length ? r.scoring_details : undefined,
    aggregationDetails: r.aggregation_details && Object.keys(r.aggregation_details).length ? r.aggregation_details : undefined,
    ceremonyDetails: r.ceremony_details && Object.keys(r.ceremony_details).length ? r.ceremony_details : undefined,
    receivedByAssistant: r.received_by_assistant ?? undefined,
    examApprovedBy: r.exam_approved_by ?? undefined,
    createdDate: r.created_date ?? '',
    createdAtTime: r.created_at_time ?? '',
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  };
}

async function courseName(db: Queryable, courseId: string | null): Promise<string | null> {
  if (!courseId) return null;
  const { rows } = await db.query('SELECT name FROM courses WHERE id = $1;', [courseId]);
  if (rows.length === 0) throw badRequest('الدورة المحددة غير موجودة');
  return rows[0].name;
}

function checkVersion(existing: any, expected: string | undefined, required = false) {
  if (!expected) {
    // Replacing a whole JSON document without a version would silently drop someone else's edits (API-11).
    if (required) throw conflict('أعد تحميل بيانات اللجنة ثم احفظ مرة أخرى (مطلوب رقم إصدار البيانات)');
    return;
  }
  const current = existing.updated_at instanceof Date ? existing.updated_at.toISOString() : String(existing.updated_at);
  if (new Date(current).getTime() !== new Date(expected).getTime()) {
    throw conflict('تم تعديل هذه اللجنة من مستخدم آخر، يرجى تحديث البيانات ثم المحاولة مرة أخرى');
  }
}

/** Inserts or fully updates one committee. Reception/approval are only changed via PATCH. */
async function upsertCommittee(db: Queryable, req: Request, c: CommitteeInput, existing: any | undefined) {
  const user = req.user!;
  if (existing) {
    assertAllowed(user, 'committees.update');
    assertCommitteeScope(user, existing.id);
    checkVersion(existing, c.expectedUpdatedAt, Boolean(c.scoringDetails || c.aggregationDetails || c.ceremonyDetails));
  } else {
    assertAllowed(user, 'committees.create');
  }

  const name = await courseName(db, c.courseId);
  const stages = { ...emptyStages(), ...(existing?.stages ?? {}), ...(c.stages ?? {}) };
  const { rows } = await db.query(
    `INSERT INTO committees (
       id, committee_number, committee_name, association_name, members, branch, competition_book,
       general_notes, course_id, course_name, sheikh_name, sheikh_phone, sheikh_country, students_count,
       is_women_committee, stages, scoring_details, aggregation_details, ceremony_details,
       created_date, created_at_time, data, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'{}'::jsonb,NOW())
     ON CONFLICT (id) DO UPDATE SET
       committee_number = EXCLUDED.committee_number, committee_name = EXCLUDED.committee_name,
       association_name = EXCLUDED.association_name, members = EXCLUDED.members, branch = EXCLUDED.branch,
       competition_book = EXCLUDED.competition_book, general_notes = EXCLUDED.general_notes,
       course_id = EXCLUDED.course_id, course_name = EXCLUDED.course_name, sheikh_name = EXCLUDED.sheikh_name,
       sheikh_phone = EXCLUDED.sheikh_phone, sheikh_country = EXCLUDED.sheikh_country,
       students_count = EXCLUDED.students_count, is_women_committee = EXCLUDED.is_women_committee,
       stages = EXCLUDED.stages, scoring_details = EXCLUDED.scoring_details,
       aggregation_details = EXCLUDED.aggregation_details, ceremony_details = EXCLUDED.ceremony_details,
       created_date = COALESCE(committees.created_date, EXCLUDED.created_date),
       created_at_time = COALESCE(committees.created_at_time, EXCLUDED.created_at_time),
       data = '{}'::jsonb, updated_at = NOW()
     RETURNING *;`,
    [
      c.id, c.committeeNumber, c.committeeName, c.associationName, JSON.stringify(c.members), c.branch,
      c.competitionBook, c.generalNotes, c.courseId, name, c.sheikhName, c.sheikhPhone, c.sheikhCountry,
      c.studentsCount, c.isWomenCommittee, JSON.stringify(stages),
      JSON.stringify(c.scoringDetails ?? existing?.scoring_details ?? {}),
      JSON.stringify(c.aggregationDetails ?? existing?.aggregation_details ?? {}),
      JSON.stringify(c.ceremonyDetails ?? existing?.ceremony_details ?? {}),
      c.createdDate, c.createdAtTime,
    ]
  );
  if (existing && existing.committee_number !== c.committeeNumber) {
    // Denormalised numbers follow the committee (API-19).
    await db.query('UPDATE schedule_tasks SET committee_number = $2 WHERE committee_id = $1;', [c.id, c.committeeNumber]);
    await db.query('UPDATE scoring_records SET committee_number = $2 WHERE committee_id = $1;', [c.id, c.committeeNumber]);
  }
  if (c.ceremonyDetails) await syncCeremonyTask(db, rows[0]);
  if (!existing && isScopedRole(user.role) && !user.allCommittees) {
    // A scoped manager who creates a committee is responsible for it.
    await db.query(
      `UPDATE app_users SET assigned_committee_ids = assigned_committee_ids || to_jsonb($2::text)
       WHERE id = $1 AND NOT assigned_committee_ids ? $2;`,
      [user.id, c.id]
    );
  }
  await audit(db, req, existing ? 'committee.update' : 'committee.create', 'committee', c.id,
    existing ? committeeFromRow(existing) : null, committeeFromRow(rows[0]));
  return rows[0];
}

/** The ceremony's calendar task has one owner: the server (WEB-08). No date means no task. */
async function syncCeremonyTask(db: Queryable, committee: any) {
  const taskId = `task-ceremony-${committee.id}`;
  const details = committee.ceremony_details ?? {};
  const raw = typeof details.ceremonyDate === 'string' ? details.ceremonyDate.trim().replace(/\//g, '-') : '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(`${raw}T00:00:00Z`)) ? raw : null;
  if (!date) {
    await db.query('DELETE FROM schedule_tasks WHERE id = $1;', [taskId]);
    return;
  }
  await db.query(
    `INSERT INTO schedule_tasks (id, title, date, time, committee_id, committee_number, type, priority, completed, notes, data, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'ceremony','high',false,$7,'{}'::jsonb,NOW())
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, date = EXCLUDED.date, time = EXCLUDED.time,
       committee_id = EXCLUDED.committee_id, committee_number = EXCLUDED.committee_number, notes = EXCLUDED.notes, updated_at = NOW();`,
    [taskId, `حفل تكريم لجنة ${committee.committee_number} - ${committee.committee_name}`, date,
      details.ceremonyTime ?? null, committee.id, committee.committee_number, details.ceremonyPlace ?? null]
  );
}

export function committeesRouter(pool: Pool, config: Pick<AppConfig, 'legacyStagePatch'>) {
  const r = Router();

  r.get('/', can('committees.read'), route(async (req, res) => {
    const q = pageQuery.parse(req.query);
    const page = await pagedRows(
      pool,
      'SELECT * FROM committees ORDER BY committee_number ASC, id ASC',
      'SELECT count(*)::int AS n FROM committees;',
      q
    );
    res.json({ success: true, committees: page.rows.map(committeeFromRow), total: page.total, hasMore: page.hasMore });
  }));

  r.post('/', route(async (req, res) => {
    const c = committeeInput.parse(req.body);
    const row = await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM committees WHERE id = $1 FOR UPDATE;', [c.id]);
      return upsertCommittee(db, req, c, rows[0]);
    });
    res.json({ success: true, committee: committeeFromRow(row) });
  }));

  // All rows are saved in one transaction: either every committee is stored or none.
  r.post('/bulk', route(async (req, res) => {
    const { committees } = z.object({ committees: z.array(committeeInput).min(1).max(500) }).parse(req.body);
    const saved = await withTransaction(pool, async (db) => {
      const out = [];
      for (const c of committees) {
        const { rows } = await db.query('SELECT * FROM committees WHERE id = $1 FOR UPDATE;', [c.id]);
        out.push(await upsertCommittee(db, req, c, rows[0]));
      }
      return out;
    });
    res.json({ success: true, count: saved.length, committees: saved.map(committeeFromRow) });
  }));

  // Partial update from older clients. Stages are merged per key, so two people ticking different
  // stages at the same time do not overwrite each other; timestamps are the server's. New clients
  // use POST /:id/actions. Replacing a JSON document requires the version the client saw (API-11).
  r.patch('/:id', route(async (req, res) => {
    const body = patchInput.parse(req.body);
    const user = req.user!;
    if (body.stages && !config.legacyStagePatch) throw badRequest('استخدم POST /api/committees/:id/actions لتغيير المراحل');
    const row = await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM committees WHERE id = $1 FOR UPDATE;', [req.params.id]);
      const existing = rows[0];
      if (!existing) throw notFound('اللجنة غير موجودة');
      checkVersion(existing, body.expectedUpdatedAt, Boolean(body.scoringDetails || body.aggregationDetails || body.ceremonyDetails));

      const needed = new Set<Action>();
      for (const k of Object.keys(body.stages ?? {}) as StageKey[]) needed.add(STAGE_ACTION[k]);
      if (body.scoringDetails || body.aggregationDetails) needed.add('committees.scoring');
      if (body.ceremonyDetails) needed.add('committees.finalize');
      if (body.receivedByAssistant !== undefined || body.examApprovedBy !== undefined) needed.add('committees.reception');
      for (const a of needed) assertAllowed(user, a);
      assertCommitteeScope(user, existing.id);

      const now = new Date().toISOString();
      const stages = body.stages ? mergeLegacyStages(existing.stages ?? {}, body.stages, user, now) : {};
      const reception =
        body.receivedByAssistant === undefined
          ? existing.received_by_assistant
          : body.receivedByAssistant === null
            ? null
            : { ...body.receivedByAssistant, assistantId: user.id, assistantName: user.name, receivedAt: now };
      const approval =
        body.examApprovedBy === undefined
          ? existing.exam_approved_by
          : body.examApprovedBy === null
            ? null
            : { ...body.examApprovedBy, assistantId: user.id, assistantName: user.name, approvedAt: now };

      const { rows: updated } = await db.query(
        `UPDATE committees SET
           stages = COALESCE(stages, '{}'::jsonb) || $2::jsonb,
           scoring_details = COALESCE($3::jsonb, scoring_details),
           aggregation_details = COALESCE($4::jsonb, aggregation_details),
           ceremony_details = COALESCE($5::jsonb, ceremony_details),
           received_by_assistant = $6::jsonb,
           exam_approved_by = $7::jsonb,
           updated_at = NOW()
         WHERE id = $1 RETURNING *;`,
        [
          req.params.id,
          JSON.stringify(stages),
          body.scoringDetails ? JSON.stringify(body.scoringDetails) : null,
          body.aggregationDetails ? JSON.stringify(body.aggregationDetails) : null,
          body.ceremonyDetails ? JSON.stringify(body.ceremonyDetails) : null,
          reception ? JSON.stringify(reception) : null,
          approval ? JSON.stringify(approval) : null,
        ]
      );
      if (body.ceremonyDetails) await syncCeremonyTask(db, updated[0]);
      await audit(db, req, 'committee.patch', 'committee', req.params.id, committeeFromRow(existing), committeeFromRow(updated[0]),
        Object.keys(body).filter((k) => k !== 'expectedUpdatedAt').join(','));
      return updated[0];
    });
    res.json({ success: true, committeeId: row.id, committee: committeeFromRow(row) });
  }));

  // Workflow intents (API-10): the server applies the rule, stamps who and when, and keeps the
  // ceremony task in step. The version is optional because each intent changes one thing.
  r.post('/:id/actions', route(async (req, res) => {
    const { action, expectedUpdatedAt: expected } = z
      .object({ action: committeeAction, expectedUpdatedAt })
      .parse(req.body);
    const user = req.user!;
    const row = await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM committees WHERE id = $1 FOR UPDATE;', [req.params.id]);
      const existing = rows[0];
      if (!existing) throw notFound('اللجنة غير موجودة');
      checkVersion(existing, expected);
      assertAllowed(user, actionPermission(action));
      assertCommitteeScope(user, existing.id);
      const next = applyCommitteeAction(
        {
          stages: existing.stages ?? {},
          receivedByAssistant: existing.received_by_assistant,
          examApprovedBy: existing.exam_approved_by,
          scoringDetails: existing.scoring_details,
          aggregationDetails: existing.aggregation_details,
          ceremonyDetails: existing.ceremony_details,
        },
        action,
        user,
        new Date().toISOString()
      );
      const { rows: updated } = await db.query(
        `UPDATE committees SET stages = $2::jsonb, received_by_assistant = $3::jsonb, exam_approved_by = $4::jsonb,
           scoring_details = $5::jsonb, aggregation_details = $6::jsonb, ceremony_details = $7::jsonb, updated_at = NOW()
         WHERE id = $1 RETURNING *;`,
        [
          existing.id,
          JSON.stringify(next.stages),
          next.receivedByAssistant ? JSON.stringify(next.receivedByAssistant) : null,
          next.examApprovedBy ? JSON.stringify(next.examApprovedBy) : null,
          JSON.stringify(next.scoringDetails ?? {}),
          JSON.stringify(next.aggregationDetails ?? {}),
          JSON.stringify(next.ceremonyDetails ?? {}),
        ]
      );
      if (action.type === 'scheduleCeremony') {
        await syncCeremonyTask(db, updated[0]);
        if (action.ceremonyDate) {
          await notify(db, {
            title: `تم تحديد موعد حفل لجنة ${existing.committee_number}`,
            description: `${existing.committee_name} — ${action.ceremonyDate}${action.ceremonyTime ? ` ${action.ceremonyTime}` : ''}`,
            type: 'info',
            committeeId: existing.id,
          });
        }
      }
      await audit(db, req, `committee.${action.type}`, 'committee', existing.id, committeeFromRow(existing), committeeFromRow(updated[0]),
        'stage' in action ? action.stage : '');
      return updated[0];
    });
    res.json({ success: true, committeeId: row.id, committee: committeeFromRow(row) });
  }));

  r.delete('/:id', route(async (req, res) => {
    await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM committees WHERE id = $1 FOR UPDATE;', [req.params.id]);
      if (!rows[0]) throw notFound('اللجنة غير موجودة');
      assertAllowed(req.user!, 'committees.delete');
      assertCommitteeScope(req.user!, rows[0].id);
      await db.query('DELETE FROM schedule_tasks WHERE id = $1;', [`task-ceremony-${req.params.id}`]);
      await db.query('DELETE FROM committees WHERE id = $1;', [req.params.id]);
      await audit(db, req, 'committee.delete', 'committee', req.params.id, committeeFromRow(rows[0]), null);
    });
    res.json({ success: true });
  }));

  return r;
}
