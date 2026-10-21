import { Router, type Request } from 'express';
import { z } from 'zod';
import { assertAllowed, assertCommitteeScope, can } from '../auth.ts';
import { audit } from '../audit.ts';
import type { AppConfig } from '../config.ts';
import { type Pool, type Queryable, withTransaction } from '../db.ts';
import { badRequest, conflict, notFound, route } from '../http.ts';
import { type Action, type Principal, isAdminRole, isAllowed, isCommitteeInScope, isScopedRole, seesAllCommittees } from '../policy.ts';
import { staffableUsers } from './users.ts';
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
  excelUrl: optionalText(2000),
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
    excelUrl: optionalText(2000),
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
    excelUrl: r.stages?.sheet?.excelUrl ?? r.data?.excelUrl ?? undefined,
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

interface Person {
  id: string;
  name: string;
  role?: string;
}

/**
 * Committees as `user` may see them: each lists its staff (committee heads and sheikhs assigned to
 * it), and admin accounts are hidden from everyone but super admins, also among ceremony attendees.
 */
async function presenterFor(db: Queryable, user: Principal) {
  const { rows } = await db.query(
    `SELECT id, name, role, assigned_committee_ids FROM app_users
     WHERE status = 'approved' AND (role IN ('super_admin', 'admin') OR jsonb_array_length(assigned_committee_ids) > 0)
     ORDER BY name ASC;`
  );
  const hidden = new Set<string>(isAllowed(user, 'users.admins') ? [] : rows.filter((r) => isAdminRole(r.role)).map((r) => r.id));
  const staffBy = new Map<string, Person[]>();
  for (const r of rows) {
    if (!isScopedRole(r.role)) continue;
    for (const cid of Array.isArray(r.assigned_committee_ids) ? r.assigned_committee_ids : []) {
      const list = staffBy.get(cid) ?? [];
      list.push({ id: r.id, name: r.name, role: r.role });
      staffBy.set(cid, list);
    }
  }
  return {
    hidden,
    present(row: any) {
      const c = committeeFromRow(row);
      const attendees: Person[] | undefined = c.ceremonyDetails?.attendees;
      return {
        ...c,
        ceremonyDetails: attendees ? { ...c.ceremonyDetails, attendees: attendees.filter((a) => !hidden.has(a.id)) } : c.ceremonyDetails,
        staff: staffBy.get(row.id) ?? [],
      };
    },
  };
}

/** Whether `user` may see the committee: in scope, or invited to its ceremony. */
function canSeeCommittee(user: Principal, row: any) {
  if (isCommitteeInScope(user, row.id)) return true;
  const attendees: Person[] = row.ceremony_details?.attendees ?? [];
  return attendees.some((a) => a.id === user.id);
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
  // Stage flags from a full save get server timestamps, as with PATCH (WEB-18, MOB-15).
  const stages = {
    ...emptyStages(),
    ...(existing?.stages ?? {}),
    ...mergeLegacyStages(existing?.stages ?? {}, c.stages ?? {}, user, new Date().toISOString()),
  };
  const sheetExcel = c.excelUrl ?? c.stages?.sheet?.excelUrl ?? existing?.stages?.sheet?.excelUrl ?? existing?.data?.excelUrl ?? null;
  if (sheetExcel !== null && sheetExcel !== undefined) {
    stages.sheet = { ...(stages.sheet ?? { completed: false }), excelUrl: sheetExcel };
  }
  const committeeData = { ...(existing?.data ?? {}), ...(sheetExcel ? { excelUrl: sheetExcel } : {}) };
  const { rows } = await db.query(
    `INSERT INTO committees (
       id, committee_number, committee_name, association_name, members, branch, competition_book,
       general_notes, course_id, course_name, sheikh_name, sheikh_phone, sheikh_country, students_count,
       is_women_committee, stages, scoring_details, aggregation_details, ceremony_details,
       created_date, created_at_time, data, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW())
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
       data = EXCLUDED.data, updated_at = NOW()
     RETURNING *;`,
    [
      c.id, c.committeeNumber, c.committeeName, c.associationName, JSON.stringify(c.members), c.branch,
      c.competitionBook, c.generalNotes, c.courseId, name, c.sheikhName, c.sheikhPhone, c.sheikhCountry,
      c.studentsCount, c.isWomenCommittee, JSON.stringify(stages),
      JSON.stringify(c.scoringDetails ?? existing?.scoring_details ?? {}),
      JSON.stringify(c.aggregationDetails ?? existing?.aggregation_details ?? {}),
      JSON.stringify(
        c.ceremonyDetails
          ? { ...c.ceremonyDetails, attendees: existing?.ceremony_details?.attendees ?? [] }
          : existing?.ceremony_details ?? {}
      ),
      c.createdDate, c.createdAtTime, JSON.stringify(committeeData),
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

/**
 * Tells each person what changed for them: added to the ceremony (with its details), removed from
 * it, or — for those still invited — a new date, time or place.
 */
async function notifyCeremonyAttendees(
  db: Queryable,
  committee: any,
  before: any,
  beforeAttendees: Array<{ id: string; name: string }>,
  after: any
) {
  const afterAttendees: Array<{ id: string; name: string }> = after.attendees ?? [];
  const had = new Set(beforeAttendees.map((a) => a.id));
  const has = new Set(afterAttendees.map((a) => a.id));
  const when = [after.ceremonyDate, after.ceremonyTime].filter(Boolean).join(' ') || 'لم يحدد الموعد بعد';
  const where = after.ceremonyPlace ? ` — ${after.ceremonyPlace}` : '';
  const label = `لجنة ${committee.committee_number} (${committee.committee_name})`;
  const moved =
    (before.ceremonyDate ?? null) !== (after.ceremonyDate ?? null) ||
    (before.ceremonyTime ?? null) !== (after.ceremonyTime ?? null) ||
    (before.ceremonyPlace ?? null) !== (after.ceremonyPlace ?? null);
  for (const a of afterAttendees) {
    if (!had.has(a.id)) {
      await notify(db, { title: `تمت إضافتك لحفل تكريم ${label}`, description: `${when}${where}`, type: 'info', committeeId: committee.id, targetUserId: a.id });
    } else if (moved) {
      await notify(db, { title: `تغيّر موعد حفل تكريم ${label}`, description: `${when}${where}`, type: 'urgent', committeeId: committee.id, targetUserId: a.id });
    }
  }
  for (const a of beforeAttendees) {
    if (!has.has(a.id)) {
      await notify(db, { title: `تم إلغاء إضافتك لحفل تكريم ${label}`, description: '', type: 'info', committeeId: committee.id, targetUserId: a.id });
    }
  }
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

  // Committee heads and sheikhs see only their committees and the ceremonies they are invited to.
  r.get('/', can('committees.read'), route(async (req, res) => {
    const q = pageQuery.parse(req.query);
    const user = req.user!;
    const where = seesAllCommittees(user)
      ? ''
      : `WHERE id = ANY($1::text[]) OR ceremony_details -> 'attendees' @> jsonb_build_array(jsonb_build_object('id', $2::text))`;
    const params = seesAllCommittees(user) ? [] : [user.assignedCommitteeIds, user.id];
    const page = await pagedRows(
      pool,
      `SELECT * FROM committees ${where} ORDER BY committee_number ASC, id ASC`,
      `SELECT count(*)::int AS n FROM committees ${where};`,
      q,
      params
    );
    const { present } = await presenterFor(pool, user);
    res.json({ success: true, committees: page.rows.map(present), total: page.total, hasMore: page.hasMore });
  }));

  r.get('/:id', can('committees.read'), route(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM committees WHERE id = $1;', [req.params.id]);
    if (!rows[0] || !canSeeCommittee(req.user!, rows[0])) throw notFound('اللجنة غير موجودة');
    const { present } = await presenterFor(pool, req.user!);
    res.json({ success: true, committee: present(rows[0]) });
  }));

  /**
   * Staffs a committee: `userIds` is the full list of members the caller can see. Admins place
   * committee heads and sheikhs; committee heads place sheikhs in the committees they head.
   * People the caller cannot place keep their membership. Each person added or removed is told.
   */
  r.put('/:id/members', can('committees.members'), route(async (req, res) => {
    const { userIds } = z.object({ userIds: z.array(z.string().max(255)).max(500) }).parse(req.body);
    const user = req.user!;
    const row = await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM committees WHERE id = $1 FOR UPDATE;', [req.params.id]);
      const committee = rows[0];
      if (!committee) throw notFound('اللجنة غير موجودة');
      assertCommitteeScope(user, committee.id);
      const wanted = new Set(userIds);
      const placeable = (await staffableUsers(db, user)).filter((p) => isScopedRole(p.role) && p.id !== user.id);
      const placeableIds = new Set(placeable.map((p) => p.id));
      const unknown = [...wanted].filter((uid) => !placeableIds.has(uid));
      if (unknown.length) throw badRequest('بعض الأشخاص المختارين غير موجودين أو لا يمكنك إضافتهم لهذه اللجنة');
      const { rows: current } = await db.query(
        'SELECT id FROM app_users WHERE assigned_committee_ids ? $1 AND id = ANY($2::text[]) FOR UPDATE;',
        [committee.id, [...placeableIds]]
      );
      const had = new Set(current.map((r) => r.id as string));
      const added = [...wanted].filter((uid) => !had.has(uid));
      const removed = [...had].filter((uid) => !wanted.has(uid));
      if (added.length) {
        await db.query(
          `UPDATE app_users SET assigned_committee_ids = assigned_committee_ids || to_jsonb($2::text), updated_at = NOW()
           WHERE id = ANY($1::text[]) AND NOT assigned_committee_ids ? $2;`,
          [added, committee.id]
        );
      }
      if (removed.length) {
        await db.query(
          `UPDATE app_users SET assigned_committee_ids = assigned_committee_ids - $2::text, updated_at = NOW()
           WHERE id = ANY($1::text[]);`,
          [removed, committee.id]
        );
      }
      await db.query(
        `UPDATE app_users u SET assigned_committees = COALESCE((SELECT jsonb_agg(DISTINCT c.committee_number) FROM committees c
                                                               WHERE u.assigned_committee_ids ? c.id), '[]'::jsonb)
         WHERE u.id = ANY($1::text[]);`,
        [[...added, ...removed]]
      );
      const label = `لجنة ${committee.committee_number} (${committee.committee_name})`;
      for (const uid of added) {
        await notify(db, { title: `تمت إضافتك إلى ${label}`, description: committee.course_name ?? '', type: 'info', committeeId: committee.id, targetUserId: uid });
      }
      for (const uid of removed) {
        await notify(db, { title: `تم إلغاء إضافتك إلى ${label}`, description: '', type: 'info', targetUserId: uid });
      }
      await audit(db, req, 'committee.members', 'committee', committee.id, { members: [...had] }, { members: [...wanted] },
        `added:${added.length},removed:${removed.length}`);
      return committee;
    });
    const { present } = await presenterFor(pool, user);
    res.json({ success: true, committee: present(row) });
  }));

  /**
   * Invites people to (or removes them from) the committee's ceremony without touching its
   * details: used from a sheikh's page ("add to this ceremony") and from the ceremony itself.
   */
  r.post('/:id/ceremony-attendees', can('committees.finalize'), route(async (req, res) => {
    const body = z
      .object({ add: z.array(z.string().max(255)).max(200).default([]), remove: z.array(z.string().max(255)).max(200).default([]) })
      .parse(req.body);
    const user = req.user!;
    const row = await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM committees WHERE id = $1 FOR UPDATE;', [req.params.id]);
      const existing = rows[0];
      if (!existing) throw notFound('اللجنة غير موجودة');
      assertCommitteeScope(user, existing.id);
      const before = existing.ceremony_details ?? {};
      const beforeAttendees: Person[] = before.attendees ?? [];
      const people = body.add.length ? await staffableUsers(db, user, [...new Set(body.add)]) : [];
      if (people.length !== new Set(body.add).size) throw badRequest('بعض الأشخاص المختارين غير موجودين أو غير معتمدين');
      const removing = new Set(body.remove);
      const attendees = [
        ...beforeAttendees.filter((a) => !removing.has(a.id)),
        ...people.filter((p) => !beforeAttendees.some((a) => a.id === p.id)).map((p) => ({ id: p.id, name: p.name })),
      ];
      const after = { ...before, attendees };
      const { rows: updated } = await db.query(
        'UPDATE committees SET ceremony_details = $2::jsonb, updated_at = NOW() WHERE id = $1 RETURNING *;',
        [existing.id, JSON.stringify(after)]
      );
      await notifyCeremonyAttendees(db, existing, before, beforeAttendees, after);
      await audit(db, req, 'committee.ceremonyAttendees', 'committee', existing.id, { attendees: beforeAttendees }, { attendees }, '');
      return updated[0];
    });
    const { present } = await presenterFor(pool, user);
    res.json({ success: true, committee: present(row) });
  }));

  r.post('/', route(async (req, res) => {
    const c = committeeInput.parse(req.body);
    const row = await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM committees WHERE id = $1 FOR UPDATE;', [c.id]);
      return upsertCommittee(db, req, c, rows[0]);
    });
    res.json({ success: true, committee: (await presenterFor(pool, req.user!)).present(row) });
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
    const { present } = await presenterFor(pool, req.user!);
    res.json({ success: true, count: saved.length, committees: saved.map(present) });
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
          body.ceremonyDetails
            ? JSON.stringify({ ...body.ceremonyDetails, attendees: existing.ceremony_details?.attendees ?? [] })
            : null,
          reception ? JSON.stringify(reception) : null,
          approval ? JSON.stringify(approval) : null,
        ]
      );
      if (body.ceremonyDetails) await syncCeremonyTask(db, updated[0]);
      await audit(db, req, 'committee.patch', 'committee', req.params.id, committeeFromRow(existing), committeeFromRow(updated[0]),
        Object.keys(body).filter((k) => k !== 'expectedUpdatedAt').join(','));
      return updated[0];
    });
    res.json({ success: true, committeeId: row.id, committee: (await presenterFor(pool, req.user!)).present(row) });
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
      const before = existing.ceremony_details ?? {};
      const beforeAttendees: Array<{ id: string; name: string }> = before.attendees ?? [];
      let attendees = beforeAttendees;
      if (action.type === 'scheduleCeremony' && action.attendeeUserIds) {
        // The caller sends the attendees they can see; attendees hidden from them stay invited.
        const { hidden } = await presenterFor(db, user);
        const kept = beforeAttendees.filter((a) => hidden.has(a.id));
        const ids = [...new Set(action.attendeeUserIds)].filter((uid) => !hidden.has(uid));
        const newIds = ids.filter((uid) => !beforeAttendees.some((a) => a.id === uid));
        const people = newIds.length ? await staffableUsers(db, user, newIds) : [];
        if (people.length !== newIds.length) throw badRequest('بعض الأشخاص المختارين غير موجودين أو غير معتمدين');
        const name = (uid: string) => people.find((p) => p.id === uid)?.name ?? beforeAttendees.find((a) => a.id === uid)!.name;
        attendees = [...kept, ...ids.map((uid) => ({ id: uid, name: name(uid) }))];
      }
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
      if (action.type === 'scheduleCeremony') next.ceremonyDetails = { ...(next.ceremonyDetails ?? {}), attendees };
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
      if ((action.type === 'completeStage' || action.type === 'reopenStage') && action.stage === 'ceremony') {
        // The ceremony's calendar task follows the stage.
        await db.query(
          `UPDATE schedule_tasks SET completed = $2, completed_at = CASE WHEN $2 THEN NOW() ELSE NULL END, updated_at = NOW()
           WHERE id = $1;`,
          [`task-ceremony-${existing.id}`, action.type === 'completeStage']
        );
      }
      if (action.type === 'scheduleCeremony') {
        await notifyCeremonyAttendees(db, existing, before, beforeAttendees, next.ceremonyDetails ?? {});
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
    res.json({ success: true, committeeId: row.id, committee: (await presenterFor(pool, req.user!)).present(row) });
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
