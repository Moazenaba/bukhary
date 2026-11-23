import { Router, type Request } from 'express';
import { onCeremonyDone } from './grants.ts';
import { z } from 'zod';
import { assertAllowed, assertCommitteeScope, can } from '../auth.ts';
import { audit } from '../audit.ts';
import type { AppConfig } from '../config.ts';
import { type Pool, type Queryable, withTransaction } from '../db.ts';
import { badRequest, conflict, notFound, route } from '../http.ts';
import {
  type Action,
  type Principal,
  canManageCommittee,
  canStaffCommittee,
  committeeViewer,
  isAdminRole,
  isAllowed,
  isScopedRole,
  observedCommitteeIds,
  seesAllCommittees,
  visibleCommitteeIds,
} from '../policy.ts';
import { LIFECYCLE_LABEL, STAFF_SELECT, activeStaff, addStaff, endStaff, followStages, syncLegacy } from '../staff.ts';
import { forbidden } from '../http.ts';
import { staffableUsers } from './users.ts';
import { STAGE_ACTION, actionPermission, applyCommitteeAction, committeeAction, mergeLegacyStages, normalizeStageOrder } from '../workflow.ts';
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
  /** The day the committee sits its exam (YYYY-MM-DD). */
  examDate: dateOnly.optional(),
  studentsCount: nonNegativeInt.default(0),
  isWomenCommittee: z.boolean().default(false),
  excelUrl: optionalText(2000),
  stages: stagesPartial.optional(),
  scoringDetails: scoringDetails.nullish(),
  aggregationDetails: aggregationDetails.nullish(),
  ceremonyDetails: ceremonyDetails.nullish(),
  createdDate: dateOnly,
  createdAtTime: optionalText(100),
  /** The committee's owner («شيخ اللجنة»), set by the admin who creates it. */
  ownerUserId: optionalId,
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


/** A DATE column as YYYY-MM-DD (node-postgres reads it as a local Date). */
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
    examDate: r.exam_date ? (r.exam_date instanceof Date ? isoDay(r.exam_date) : String(r.exam_date).slice(0, 10)) : undefined,
    studentsCount: r.students_count ?? 0,
    isWomenCommittee: Boolean(r.is_women_committee),
    excelUrl: r.stages?.sheet?.excelUrl ?? r.data?.excelUrl ?? undefined,
    stages: { ...emptyStages(), ...(r.stages ?? {}) },
    scoringDetails: r.scoring_details && Object.keys(r.scoring_details).length ? r.scoring_details : undefined,
    aggregationDetails: r.aggregation_details && Object.keys(r.aggregation_details).length ? r.aggregation_details : undefined,
    // Only the server's list of ceremony sheikhs (attendees, maybe empty) is not a ceremony yet; a ceremony always has
    // its list of attending sheikhs, which older clients read.
    ceremonyDetails: Object.keys(r.ceremony_details ?? {}).some((k) => k !== 'attendees') || r.ceremony_details?.attendees?.length
      ? { attendingSheikhs: [], ...r.ceremony_details }
      : undefined,
    receivedByAssistant: r.received_by_assistant ?? undefined,
    examApprovedBy: r.exam_approved_by ?? undefined,
    createdDate: r.created_date ?? '',
    createdAtTime: r.created_at_time ?? '',
    lifecycle: r.lifecycle ?? 'active',
    lifecycleLabel: LIFECYCLE_LABEL[(r.lifecycle ?? 'active') as keyof typeof LIFECYCLE_LABEL],
    driver: r.has_driver ? { name: r.driver_name ?? '', phone: r.driver_phone ?? '' } : null,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  };
}

interface Person {
  id: string;
  name: string;
  role?: string;
  /** Only a committee head's phone is sent (see presenterFor), so the sheikhs of a committee know whom to call there. */
  phone?: string;
}

/**
 * Committees as `user` may see them: each lists its staff (committee heads and sheikhs assigned to
 * it), and admin accounts are hidden from everyone but super admins, also among ceremony attendees.
 *
 * A committee head's entry carries his phone: the sheikhs on that committee are told to call him when
 * they arrive (product decision). Sheikhs' own phones are never added, and a head without a phone
 * simply has no `phone` key.
 */
async function presenterFor(db: Queryable, user: Principal) {
  const { rows } = await db.query(
    `SELECT id, name, role, phone, assigned_committee_ids FROM app_users
     WHERE status = 'approved' AND (role IN ('super_admin', 'admin') OR jsonb_array_length(assigned_committee_ids) > 0)
     ORDER BY name ASC;`
  );
  const hidden = new Set<string>(isAllowed(user, 'users.admins') ? [] : rows.filter((r) => isAdminRole(r.role)).map((r) => r.id));
  // Jobs on committees: owners show as the committee's head (with their phone), everyone else as a sheikh.
  const { rows: jobs } = await db.query(`SELECT committee_id, user_id, role FROM committee_staff WHERE status = 'active';`);
  const jobOf = new Map<string, string[]>();
  for (const j of jobs) jobOf.set(`${j.committee_id}:${j.user_id}`, [...(jobOf.get(`${j.committee_id}:${j.user_id}`) ?? []), j.role]);
  const staffBy = new Map<string, Person[]>();
  for (const r of rows) {
    if (!isScopedRole(r.role)) continue;
    for (const cid of Array.isArray(r.assigned_committee_ids) ? r.assigned_committee_ids : []) {
      const mine = jobOf.get(`${cid}:${r.id}`);
      const head = mine ? mine.includes('owner') : r.role === 'committee_head';
      const list = staffBy.get(cid) ?? [];
      list.push({ id: r.id, name: r.name, role: head ? 'committee_head' : 'sheikh', ...(head && r.phone ? { phone: r.phone } : {}) });
      staffBy.set(cid, list);
    }
  }
  return {
    hidden,
    present(row: any) {
      const c = committeeFromRow(row);
      const viewer = committeeViewer(user, row);
      // Observers do not see the ceremony's sheikhs; ceremony sheikhs see only the committee's owner.
      const attendees: Person[] | undefined = c.ceremonyDetails && viewer === 'observer' ? [] : c.ceremonyDetails?.attendees;
      const staff = (staffBy.get(row.id) ?? []).filter((p) => viewer !== 'ceremony_sheikh' || p.role === 'committee_head');
      return {
        ...c,
        ceremonyDetails: attendees ? { ...c.ceremonyDetails, attendees: attendees.filter((a) => !hidden.has(a.id)) } : c.ceremonyDetails,
        staff,
        viewer,
      };
    },
  };
}

const IGNORED_CHANGES = new Set(['updatedAt', 'staff', 'createdAtTime']);

/** Field-level changes between two saved versions (stages compared one by one). */
export function committeeChanges(before: any, after: any) {
  const out: { field: string; before: unknown; after: unknown }[] = [];
  if (!before || !after) return out;
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (IGNORED_CHANGES.has(key)) continue;
    if (key === 'stages') {
      for (const stage of new Set([...Object.keys(before.stages ?? {}), ...Object.keys(after.stages ?? {})])) {
        const a = Boolean(before.stages?.[stage]?.completed);
        const b = Boolean(after.stages?.[stage]?.completed);
        if (a !== b) out.push({ field: `stages.${stage}`, before: a, after: b });
      }
      continue;
    }
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      out.push({ field: key, before: before[key] ?? null, after: after[key] ?? null });
    }
  }
  return out;
}

function historyEntry(r: any, showAdmins: boolean) {
  const byAdmin = r.user_role === 'super_admin' || r.user_role === 'admin';
  return {
    at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    by: byAdmin && !showAdmins ? 'الإدارة' : r.user_name ?? '',
    action: r.action,
    detail: r.details ?? '',
    changes: committeeChanges(r.before_data, r.after_data),
  };
}

/** Whether `user` may see the committee: in scope, or invited to its ceremony. */
function canSeeCommittee(user: Principal, row: any) {
  if (committeeViewer(user, row) !== 'none') return true;
  // Sent there as an observer: read-only (every write still needs the committee in scope).
  return observedCommitteeIds(user).includes(row.id);
}

/** Changing a committee (its data and stage work): admins, and its head on it. */
function assertCanManage(user: Principal, committeeId: string) {
  if (!canManageCommittee(user, committeeId)) throw forbidden('هذه اللجنة غير مسندة إليك');
}

/** The accreditation is the admin's step (docs/PLAN_ROLES_AND_FLOW.md 1.2). */
function assertStageChanges(user: Principal, changed: string[]) {
  if (changed.includes('accreditation') && !isAdminRole(user.role)) throw forbidden('اعتماد اللجنة يأخذه الأدمن');
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
    assertCanManage(user, existing.id);
    checkVersion(existing, c.expectedUpdatedAt, Boolean(c.scoringDetails || c.aggregationDetails || c.ceremonyDetails));
  } else {
    assertAllowed(user, 'committees.create');
  }

  const name = await courseName(db, c.courseId);
  // Stage flags from a full save get server timestamps, as with PATCH (WEB-18, MOB-15).
  const now = new Date().toISOString();
  const stages = {
    ...emptyStages(),
    ...(existing?.stages ?? {}),
    ...mergeLegacyStages(existing?.stages ?? {}, c.stages ?? {}, user, now),
  };
  // The stage order holds for whole saves too (no «تم الحفل» without the exam, etc.), and each
  // changed stage needs the same right as the stage action.
  const ceremonyAfter = c.ceremonyDetails ?? existing?.ceremony_details;
  const { changed } = normalizeStageOrder(existing?.stages ?? {}, stages, user, now, ceremonyAfter);
  for (const k of changed) assertAllowed(user, STAGE_ACTION[k]);
  assertStageChanges(user, changed);
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
       created_date, created_at_time, data, exam_date, lifecycle, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'draft',NOW())
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
       data = EXCLUDED.data, exam_date = EXCLUDED.exam_date, updated_at = NOW()
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
      // A client that does not send it (older app) keeps the stored date.
      c.examDate !== undefined ? c.examDate : existing?.exam_date ?? null,
    ]
  );
  if (existing && existing.committee_number !== c.committeeNumber) {
    // Denormalised numbers follow the committee (API-19).
    await db.query('UPDATE schedule_tasks SET committee_number = $2 WHERE committee_id = $1;', [c.id, c.committeeNumber]);
    await db.query('UPDATE scoring_records SET committee_number = $2 WHERE committee_id = $1;', [c.id, c.committeeNumber]);
  }
  // The ceremony's calendar task follows the committee (date and «تم الحفل»).
  if (c.ceremonyDetails) await syncCeremonyTask(db, rows[0]);
  else if (changed.includes('ceremony')) await syncCeremonyTask(db, rows[0], { detailsChanged: false });
  await audit(db, req, existing ? 'committee.update' : 'committee.create', 'committee', c.id,
    existing ? committeeFromRow(existing) : null, committeeFromRow(rows[0]));
  // The owner («شيخ اللجنة») the admin chose; their notice waits for the committee to be activated.
  if (c.ownerUserId && isAllowed(user, 'committees.owner')) {
    const current = (await activeStaff(db, c.id)).find((s) => s.role === 'owner');
    if (current?.user_id !== c.ownerUserId) {
      if (current) await endStaff(db, req, rows[0], current, { status: 'removed' });
      await addStaff(db, req, rows[0], { userId: c.ownerUserId, role: 'owner', confirmConflicts: true });
    }
  }
  if (existing) return (await followStages(db, rows[0])) ? (await db.query('SELECT * FROM committees WHERE id = $1;', [c.id])).rows[0] : rows[0];
  return rows[0];
}

/**
 * Tells each person what changed for them: added to the ceremony (with its details), removed from
 * it, or — for those still invited — a new date, time or place.
 */
export async function notifyCeremonyAttendees(
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

/**
 * The ceremony's calendar task has one owner: the server (WEB-08). No date means no task; the task
 * is completed exactly when the committee's ceremony stage is.
 */
export async function syncCeremonyTask(db: Queryable, committee: any, opts: { detailsChanged: boolean } = { detailsChanged: true }) {
  const taskId = `task-ceremony-${committee.id}`;
  const details = committee.ceremony_details ?? {};
  const raw = typeof details.ceremonyDate === 'string' ? details.ceremonyDate.trim().replace(/\//g, '-') : '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(`${raw}T00:00:00Z`)) ? raw : null;
  if (!date) {
    // The date was cleared on purpose: no task. When only the stage changed, an older task that
    // still holds the date is kept and just follows the stage (its data is never deleted here).
    if (opts.detailsChanged) await db.query('DELETE FROM schedule_tasks WHERE id = $1;', [taskId]);
    else {
      await db.query(
        `UPDATE schedule_tasks SET completed = $2,
           completed_at = CASE WHEN $2 THEN COALESCE(completed_at, NOW()) ELSE NULL END, updated_at = NOW()
         WHERE id = $1;`,
        [taskId, Boolean(committee.stages?.ceremony?.completed)]
      );
    }
    return;
  }
  await db.query(
    `INSERT INTO schedule_tasks (id, title, date, time, committee_id, committee_number, type, priority, completed, completed_at, notes, data, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'ceremony','high',$8,CASE WHEN $8 THEN NOW() ELSE NULL END,$7,'{}'::jsonb,NOW())
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, date = EXCLUDED.date, time = EXCLUDED.time,
       committee_id = EXCLUDED.committee_id, committee_number = EXCLUDED.committee_number, notes = EXCLUDED.notes,
       completed = EXCLUDED.completed,
       completed_at = CASE WHEN EXCLUDED.completed THEN COALESCE(schedule_tasks.completed_at, NOW()) ELSE NULL END,
       updated_at = NOW();`,
    [taskId, `حفل تكريم لجنة ${committee.committee_number} - ${committee.committee_name}`, date,
      details.ceremonyTime ?? null, committee.id, committee.committee_number, details.ceremonyPlace ?? null,
      Boolean(committee.stages?.ceremony?.completed)]
  );
}

/**
 * Adds and removes ceremony sheikhs (committee_staff): the admin and the exams manager, or an owner with can_assign;
 * after the accreditation for everyone but admins.
 */
async function changeCeremonySheikhs(db: Queryable, req: Request, committee: any, add: Set<string>, remove: Set<string>) {
  const user = req.user!;
  if (add.size === 0 && remove.size === 0) return;
  if (!isAllowed(user, 'committees.members') || !canStaffCommittee(user, committee.id)) {
    throw forbidden('لا تملك صلاحية تعيين مشايخ الحفلة في هذه اللجنة');
  }
  if (add.size && !isAdminRole(user.role) && !['accredited', 'ceremony_done'].includes(committee.lifecycle)) {
    throw forbidden('يُعيَّن مشايخ الحفلة بعد اعتماد اللجنة');
  }
  const people = add.size ? await staffableUsers(db, user, [...add]) : [];
  if (people.length !== add.size) throw badRequest('بعض الأشخاص المختارين غير موجودين أو غير معتمدين');
  const staff = (await activeStaff(db, committee.id)).filter((s) => s.role === 'ceremony_sheikh');
  for (const p of people) {
    if (!staff.some((s) => s.user_id === p.id)) await addStaff(db, req, committee, { userId: p.id, role: 'ceremony_sheikh', confirmConflicts: true });
  }
  for (const s of staff) if (remove.has(s.user_id)) await endStaff(db, req, committee, s, { status: 'removed' });
}

export function committeesRouter(pool: Pool, config: Pick<AppConfig, 'legacyStagePatch'>) {
  const r = Router();

  // Committee heads and sheikhs see only their committees and the ceremonies they are invited to.
  r.get('/', can('committees.read'), route(async (req, res) => {
    const q = pageQuery.parse(req.query);
    const user = req.user!;
    const where = seesAllCommittees(user)
      ? user.role === 'exams_manager' ? `WHERE lifecycle <> 'draft'` : ''
      : `WHERE id = ANY($1::text[]) OR ceremony_details -> 'attendees' @> jsonb_build_array(jsonb_build_object('id', $2::text))`;
    const params = seesAllCommittees(user) ? [] : [[...visibleCommitteeIds(user), ...observedCommitteeIds(user)], user.id];
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
      if (!committee || committeeViewer(user, committee) === 'none') throw notFound('اللجنة غير موجودة');
      if (!canStaffCommittee(user, committee.id)) throw forbidden('لا تملك صلاحية تعيين أشخاص في هذه اللجنة');
      const wanted = new Set(userIds);
      const placeable = (await staffableUsers(db, user)).filter((p) => isScopedRole(p.role) && p.id !== user.id);
      const placeableIds = new Set(placeable.map((p) => p.id));
      const unknown = [...wanted].filter((uid) => !placeableIds.has(uid));
      if (unknown.length) throw badRequest('بعض الأشخاص المختارين غير موجودين أو لا يمكنك إضافتهم لهذه اللجنة');
      // Members are the committee's observers (and its owner, who stays: the owner is changed by the admin).
      const staff = await activeStaff(db, committee.id);
      const ownerId = staff.find((s) => s.role === 'owner')?.user_id;
      const observers = new Map(staff.filter((s) => s.role === 'observer').map((s) => [s.user_id, s]));
      // Older data: people on the committee with no job row there.
      const { rows: legacy } = await db.query(
        `SELECT u.id FROM app_users u WHERE u.assigned_committee_ids ? $1 AND u.id = ANY($2::text[])
           AND NOT EXISTS (SELECT 1 FROM committee_staff s WHERE s.user_id = u.id AND s.committee_id = $1);`,
        [committee.id, [...placeableIds]]
      );
      const added = [...wanted].filter((uid) => uid !== ownerId && !observers.has(uid) && !legacy.some((l) => l.id === uid));
      const removed = [...observers.values()].filter((s) => placeableIds.has(s.user_id) && !wanted.has(s.user_id));
      const removedLegacy = legacy.map((l) => l.id as string).filter((uid) => !wanted.has(uid));
      for (const uid of added) await addStaff(db, req, committee, { userId: uid, role: 'observer', confirmConflicts: true });
      for (const s of removed) await endStaff(db, req, committee, s, { status: 'removed' });
      if (removedLegacy.length) {
        await db.query(
          `UPDATE app_users SET assigned_committee_ids = assigned_committee_ids - $2::text, updated_at = NOW() WHERE id = ANY($1::text[]);`,
          [removedLegacy, committee.id]
        );
        await syncLegacy(db, { userIds: removedLegacy });
        for (const uid of removedLegacy) {
          await notify(db, { title: `تم إلغاء إضافتك إلى لجنة ${committee.committee_number} (${committee.committee_name})`, description: '', type: 'info', targetUserId: uid });
        }
      }
      await audit(db, req, 'committee.members', 'committee', committee.id, { members: [...observers.keys(), ...legacy.map((l) => l.id)] }, { members: [...wanted] },
        `added:${added.length},removed:${removed.length + removedLegacy.length}`);
      return (await db.query('SELECT * FROM committees WHERE id = $1;', [committee.id])).rows[0];
    });
    const { present } = await presenterFor(pool, user);
    res.json({ success: true, committee: present(row) });
  }));

  /**
   * Invites people to (or removes them from) the committee's ceremony without touching its
   * details: used from a sheikh's page ("add to this ceremony") and from the ceremony itself.
   */
  r.post('/:id/ceremony-attendees', can('committees.members'), route(async (req, res) => {
    const body = z
      .object({ add: z.array(z.string().max(255)).max(200).default([]), remove: z.array(z.string().max(255)).max(200).default([]) })
      .parse(req.body);
    const user = req.user!;
    const row = await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM committees WHERE id = $1 FOR UPDATE;', [req.params.id]);
      const existing = rows[0];
      if (!existing || committeeViewer(user, existing) === 'none') throw notFound('اللجنة غير موجودة');
      await changeCeremonySheikhs(db, req, existing, new Set(body.add), new Set(body.remove));
      return (await db.query('SELECT * FROM committees WHERE id = $1;', [existing.id])).rows[0];
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
      if (body.excelUrl) needed.add('committees.scoring');
      if (body.receivedByAssistant !== undefined || body.examApprovedBy !== undefined) needed.add('committees.reception');
      for (const a of needed) assertAllowed(user, a);
      assertCanManage(user, existing.id);

      const now = new Date().toISOString();
      const stages = { ...emptyStages(), ...(existing.stages ?? {}) };
      if (body.excelUrl !== undefined) {
        stages.sheet = { ...(stages.sheet ?? { completed: false }), excelUrl: body.excelUrl };
      }
      if (body.stages) {
        Object.assign(stages, mergeLegacyStages(existing.stages ?? {}, body.stages, user, now));
        const { changed } = normalizeStageOrder(existing.stages ?? {}, stages, user, now, body.ceremonyDetails ?? existing.ceremony_details);
        for (const k of changed) assertAllowed(user, STAGE_ACTION[k]);
        assertStageChanges(user, changed);
      }
      const committeeData = { ...(existing.data ?? {}), ...(body.excelUrl ? { excelUrl: body.excelUrl } : {}) };
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
           stages = $2::jsonb,
           scoring_details = COALESCE($3::jsonb, scoring_details),
           aggregation_details = COALESCE($4::jsonb, aggregation_details),
           ceremony_details = COALESCE($5::jsonb, ceremony_details),
           received_by_assistant = $6::jsonb,
           exam_approved_by = $7::jsonb,
           data = $8::jsonb,
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
          JSON.stringify(committeeData),
        ]
      );
      if (body.ceremonyDetails) await syncCeremonyTask(db, updated[0]);
      else if (body.stages) await syncCeremonyTask(db, updated[0], { detailsChanged: false });
      // The ceremony is done for the first time: its grants and observers end now (see grants.ts onCeremonyDone).
      if (!existing.stages?.ceremony?.completed && stages.ceremony?.completed) await onCeremonyDone(db, existing.id);
      if (await followStages(db, updated[0])) updated[0] = (await db.query('SELECT * FROM committees WHERE id = $1;', [existing.id])).rows[0];
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
      assertCanManage(user, existing.id);
      if (action.type === 'completeStage' || action.type === 'reopenStage') assertStageChanges(user, [action.stage]);
      const before = existing.ceremony_details ?? {};
      const beforeAttendees: Array<{ id: string; name: string }> = before.attendees ?? [];
      let attendees = beforeAttendees;
      let sheikhChanges: { add: Set<string>; remove: Set<string> } | null = null;
      if (action.type === 'scheduleCeremony' && action.attendeeUserIds) {
        // The caller sends the attendees they can see; attendees hidden from them stay invited. They are the
        // ceremony's sheikhs (committee_staff); the legacy list follows.
        const { hidden } = await presenterFor(db, user);
        const ids = new Set([...new Set(action.attendeeUserIds)].filter((uid) => !hidden.has(uid)));
        const add = new Set([...ids].filter((uid) => !beforeAttendees.some((a) => a.id === uid)));
        const remove = new Set(beforeAttendees.filter((a) => !hidden.has(a.id) && !ids.has(a.id)).map((a) => a.id));
        sheikhChanges = { add, remove };
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
      if (sheikhChanges) {
        // With the new day and place in place, so each person's notice carries them.
        await changeCeremonySheikhs(db, req, updated[0], sheikhChanges.add, sheikhChanges.remove);
        updated[0] = (await db.query('SELECT * FROM committees WHERE id = $1;', [existing.id])).rows[0];
        attendees = updated[0].ceremony_details?.attendees ?? [];
      }
      if ((action.type === 'completeStage' || action.type === 'reopenStage') && action.stage === 'ceremony') {
        // The ceremony's calendar task follows the stage.
        await syncCeremonyTask(db, updated[0], { detailsChanged: false });
      }
      if (!existing.stages?.ceremony?.completed && next.stages?.ceremony?.completed) await onCeremonyDone(db, existing.id);
      if (await followStages(db, updated[0])) updated[0] = (await db.query('SELECT * FROM committees WHERE id = $1;', [existing.id])).rows[0];
      if (action.type === 'scheduleCeremony') {
        // Who joined or left was told by committee_staff; here only the people who stay hear about a new day or place.
        const stayed = beforeAttendees.filter((a) => attendees.some((x) => x.id === a.id));
        await notifyCeremonyAttendees(db, existing, before, stayed, { ...(next.ceremonyDetails ?? {}), attendees: stayed });
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

  /**
   * What changed in this committee, who changed it and when (from the audit log), for anyone who
   * may see the committee. Admin accounts appear as «الإدارة» except to super admins, as everywhere.
   */
  r.get('/:id/history', can('committees.read'), route(async (req, res) => {
    const user = req.user!;
    const { rows: cs } = await pool.query('SELECT * FROM committees WHERE id = $1;', [req.params.id]);
    if (!cs[0] || !canSeeCommittee(user, cs[0])) throw notFound('اللجنة غير موجودة');
    const { rows } = await pool.query(
      `SELECT action, user_name, user_role, details, before_data, after_data, created_at
       FROM audit_logs WHERE entity = 'committee' AND entity_id = $1 ORDER BY created_at DESC LIMIT 200;`,
      [req.params.id]
    );
    const showAdmins = isAllowed(user, 'users.admins');
    res.json({ success: true, history: rows.map((r) => historyEntry(r, showAdmins)) });
  }));

  r.delete('/:id', route(async (req, res) => {
    await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM committees WHERE id = $1 FOR UPDATE;', [req.params.id]);
      if (!rows[0]) throw notFound('اللجنة غير موجودة');
      assertAllowed(req.user!, 'committees.delete');
      assertCommitteeScope(req.user!, rows[0].id);
      await db.query('DELETE FROM schedule_tasks WHERE id = $1;', [`task-ceremony-${req.params.id}`]);
      await db.query('DELETE FROM committees WHERE id = $1;', [req.params.id]);
      // Nobody stays assigned to a committee that no longer exists (it would block saving that
      // person later and show a committee number that is gone).
      await db.query(
        `UPDATE app_users u SET assigned_committee_ids = u.assigned_committee_ids - $1::text,
           assigned_committees = COALESCE((SELECT jsonb_agg(DISTINCT c.committee_number) FROM committees c
                                           WHERE (u.assigned_committee_ids - $1::text) ? c.id), '[]'::jsonb),
           updated_at = NOW()
         WHERE u.assigned_committee_ids ? $1;`,
        [req.params.id]
      );
      await db.query(
        'UPDATE permission_profiles SET allowed_committee_ids = allowed_committee_ids - $1::text WHERE allowed_committee_ids ? $1;',
        [req.params.id]
      );
      await db.query(
        `UPDATE committee_head_grants SET committee_ids = committee_ids - $1::text,
           status = CASE WHEN jsonb_array_length(committee_ids - $1::text) = 0 THEN 'ended' ELSE status END,
           ended_at = CASE WHEN jsonb_array_length(committee_ids - $1::text) = 0 THEN NOW() ELSE ended_at END
         WHERE committee_ids ? $1;`,
        [req.params.id]
      );
      await audit(db, req, 'committee.delete', 'committee', req.params.id, committeeFromRow(rows[0]), null);
    });
    res.json({ success: true });
  }));

  return r;
}
