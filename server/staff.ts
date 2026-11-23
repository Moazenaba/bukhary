import crypto from 'crypto';
import type { Request } from 'express';
import { audit } from './audit.ts';
import type { Queryable } from './db.ts';
import { badRequest, conflict, forbidden, HttpError, notFound } from './http.ts';
import {
  LIFECYCLE,
  type Lifecycle,
  type Principal,
  type StaffRole,
  isAdminRole,
  isMemberVisible,
  lifecycleIndex,
} from './policy.ts';
import { notify, notifyMany } from './routes/notifications.ts';

// Committee staff (docs/PLAN_ROLES_AND_FLOW.md): who is on a committee and as what, the committee lifecycle, the
// notices each step sends, schedule conflicts and the legacy columns derived from committee_staff.

export const STAFF_LABEL: Record<StaffRole, string> = { owner: 'شيخ اللجنة', observer: 'مراقب', ceremony_sheikh: 'شيخ الحفلة' };
export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  draft: 'إنشاء (غير مفعّلة)',
  sent_to_manager: 'أُرسلت لمدير الحفلات والامتحانات',
  observers_open: 'مسموح بإضافة المراقبين',
  active: 'مفعّلة',
  observed: 'تمت المراقبة / جاري التصحيح',
  accredited: 'معتمدة',
  ceremony_done: 'تمت الحفلة',
};
/** Who may take each step forward (going back one step is for admins only). */
export const LIFECYCLE_ACTOR: Record<Exclude<Lifecycle, 'draft'>, 'admin' | 'manager'> = {
  sent_to_manager: 'admin',
  observers_open: 'admin',
  active: 'manager',
  observed: 'manager',
  accredited: 'admin',
  ceremony_done: 'manager',
};

const dayOf = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const t = String(v).trim().replace(/\//g, '-').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
};
export const examDay = (c: any) => dayOf(c?.exam_date);
export const ceremonyDay = (c: any) => dayOf(c?.ceremony_details?.ceremonyDate);
export const label = (c: any) => `لجنة ${c.committee_number} (${c.committee_name})`;

export interface StaffRow {
  id: string;
  committee_id: string;
  user_id: string;
  user_name: string;
  user_phone: string | null;
  user_role: string;
  role: StaffRole;
  status: 'active' | 'excused' | 'removed';
  can_assign: boolean;
  note: string | null;
  excuse_reason: string | null;
  notified_at: Date | string | null;
  assigned_by_name: string;
  created_at: Date | string;
}

export const STAFF_SELECT = `
  SELECT s.*, u.name AS user_name, u.phone AS user_phone, u.role AS user_role
  FROM committee_staff s JOIN app_users u ON u.id = s.user_id`;

export function presentStaff(r: StaffRow, opts: { phones?: boolean } = {}) {
  const iso = (v: any) => (v instanceof Date ? v.toISOString() : v ?? null);
  return {
    id: r.id,
    committeeId: r.committee_id,
    userId: r.user_id,
    name: r.user_name,
    ...(opts.phones && r.user_phone ? { phone: r.user_phone } : {}),
    role: r.role,
    roleLabel: STAFF_LABEL[r.role],
    status: r.status,
    canAssign: r.can_assign,
    note: r.note ?? undefined,
    excuseReason: r.excuse_reason ?? undefined,
    notified: Boolean(r.notified_at),
    assignedBy: r.assigned_by_name,
    createdAt: iso(r.created_at),
  };
}

export async function activeStaff(db: Queryable, committeeId: string): Promise<StaffRow[]> {
  const { rows } = await db.query(`${STAFF_SELECT} WHERE s.committee_id = $1 AND s.status = 'active' ORDER BY s.role, u.name;`, [committeeId]);
  return rows;
}

export async function managerIds(db: Queryable): Promise<string[]> {
  const { rows } = await db.query(`SELECT id FROM app_users WHERE role = 'exams_manager' AND status = 'approved';`);
  return rows.map((r) => r.id);
}

/** The committee's owner: its owner row, or (older data) the sheikh named on the committee. */
export async function ownerOf(db: Queryable, committee: any): Promise<{ id?: string; name: string; phone: string } | null> {
  const { rows } = await db.query(
    `SELECT u.id, u.name, COALESCE(u.phone, '') AS phone FROM committee_staff s JOIN app_users u ON u.id = s.user_id
     WHERE s.committee_id = $1 AND s.role = 'owner' AND s.status = 'active' LIMIT 1;`,
    [committee.id]
  );
  if (rows[0]) return rows[0];
  const { rows: heads } = await db.query(
    `SELECT id, name, COALESCE(phone, '') AS phone FROM app_users
     WHERE role = 'committee_head' AND status = 'approved' AND assigned_committee_ids ? $1 ORDER BY name LIMIT 1;`,
    [committee.id]
  );
  if (heads[0]) return heads[0];
  return committee.sheikh_name ? { name: committee.sheikh_name, phone: committee.sheikh_phone ?? '' } : null;
}

/**
 * Keeps the legacy columns in step with committee_staff, for the given people and committees:
 *   - app_users.assigned_committee_ids holds the committees where the person is owner or observer and that members
 *     may see (from 'active' on); entries with no committee_staff row for the person (older data) are kept;
 *   - committees.ceremony_details.attendees holds the ceremony sheikhs (from 'active' on).
 */
export async function syncLegacy(db: Queryable, opts: { userIds?: string[]; committeeIds?: string[] }) {
  const committeeIds = [...new Set(opts.committeeIds ?? [])];
  const users = new Set(opts.userIds ?? []);
  if (committeeIds.length) {
    const { rows } = await db.query('SELECT DISTINCT user_id FROM committee_staff WHERE committee_id = ANY($1::text[]);', [committeeIds]);
    for (const r of rows) users.add(r.user_id);
  }
  const userIds = [...users];
  if (userIds.length) {
    await db.query(
      `UPDATE app_users u SET assigned_committee_ids = (
         SELECT COALESCE(jsonb_agg(DISTINCT cid), '[]'::jsonb) FROM (
           SELECT x AS cid FROM jsonb_array_elements_text(u.assigned_committee_ids) AS x
           WHERE NOT EXISTS (SELECT 1 FROM committee_staff s WHERE s.user_id = u.id AND s.committee_id = x)
           UNION
           SELECT s.committee_id FROM committee_staff s JOIN committees c ON c.id = s.committee_id
           WHERE s.user_id = u.id AND s.status = 'active' AND s.role IN ('owner', 'observer')
             AND c.lifecycle IN ('active', 'observed', 'accredited', 'ceremony_done')
         ) t), updated_at = NOW()
       WHERE u.id = ANY($1::text[]);`,
      [userIds]
    );
    await db.query(
      `UPDATE app_users u SET assigned_committees = COALESCE((SELECT jsonb_agg(DISTINCT c.committee_number) FROM committees c
                                                             WHERE u.assigned_committee_ids ? c.id), '[]'::jsonb)
       WHERE u.id = ANY($1::text[]);`,
      [userIds]
    );
  }
  if (committeeIds.length) {
    await db.query(
      `UPDATE committees c SET ceremony_details = COALESCE(c.ceremony_details, '{}'::jsonb) || jsonb_build_object('attendees', (
         SELECT COALESCE(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) ORDER BY u.name), '[]'::jsonb)
         FROM committee_staff s JOIN app_users u ON u.id = s.user_id
         WHERE s.committee_id = c.id AND s.status = 'active' AND s.role = 'ceremony_sheikh'
           AND c.lifecycle IN ('active', 'observed', 'accredited', 'ceremony_done')))
       WHERE c.id = ANY($1::text[]);`,
      [committeeIds]
    );
  }
}

/** What a person is busy with on a day: committees they observe or own before «تمت المراقبة», ceremonies they attend. */
export async function busyOn(db: Queryable, userIds: string[], day: string, exceptCommitteeId?: string) {
  if (userIds.length === 0) return [] as Array<{ userId: string; committeeId: string; label: string; kind: 'committee' | 'ceremony'; time?: string }>;
  const { rows } = await db.query(
    `SELECT s.user_id, s.role, c.id, c.committee_number, c.committee_name, c.lifecycle, c.exam_date,
            c.ceremony_details ->> 'ceremonyDate' AS ceremony_date, c.ceremony_details ->> 'ceremonyTime' AS ceremony_time
     FROM committee_staff s JOIN committees c ON c.id = s.committee_id
     WHERE s.user_id = ANY($1::text[]) AND s.status = 'active' AND ($3::text IS NULL OR c.id <> $3)
       AND (
         (s.role IN ('owner', 'observer') AND c.exam_date = ($2::text)::date AND c.lifecycle IN ('sent_to_manager', 'observers_open', 'active'))
         OR (s.role = 'ceremony_sheikh' AND left(replace(c.ceremony_details ->> 'ceremonyDate', '/', '-'), 10) = $2::text AND c.lifecycle <> 'ceremony_done')
       );`,
    [userIds, day, exceptCommitteeId ?? null]
  );
  return rows.map((r) => ({
    userId: r.user_id as string,
    committeeId: r.id as string,
    kind: (r.role === 'ceremony_sheikh' ? 'ceremony' : 'committee') as 'committee' | 'ceremony',
    label: `${r.role === 'ceremony_sheikh' ? 'حفلة' : STAFF_LABEL[r.role as StaffRole]} — ${label(r)}`,
    ...(r.role === 'ceremony_sheikh' && r.ceremony_time ? { time: r.ceremony_time as string } : {}),
  }));
}

/** The day a job keeps the person busy: the committee's day for owner/observer, the ceremony's for a ceremony sheikh. */
export const jobDay = (committee: any, role: StaffRole) => (role === 'ceremony_sheikh' ? ceremonyDay(committee) : examDay(committee));

/** The notice a person receives about their job on a committee (place, day, whom to call, colleagues, driver, note). */
export async function staffNotice(db: Queryable, committee: any, row: { role: StaffRole; user_id: string; note?: string | null }) {
  const owner = await ownerOf(db, committee);
  const staff = await activeStaff(db, committee.id);
  const same = staff.filter((s) => s.role === row.role && s.user_id !== row.user_id).map((s) => s.user_name);
  const place = committee.sheikh_country ? `المكان: ${committee.sheikh_country}` : 'المكان: لم يُحدد بعد';
  const driver = committee.has_driver
    ? `السائق: ${committee.driver_name || 'محدد'}${committee.driver_phone ? ` (${committee.driver_phone})` : ''}`
    : 'لا يوجد سائق';
  const ownerLine = owner ? `شيخ اللجنة: ${owner.name}${owner.phone ? ` (${owner.phone})` : ''}` : 'شيخ اللجنة: لم يُحدد بعد';
  const lines: string[] = [];
  if (row.role === 'owner') {
    const observers = staff.filter((s) => s.role === 'observer').length;
    lines.push(place, examDay(committee) ? `اليوم: ${examDay(committee)}` : '', `عدد المراقبين: ${observers}`, `عدد الطلاب: ${committee.students_count ?? 0}`);
    return { title: `تم إسناد ${label(committee)} إليك (شيخ اللجنة)`, description: lines.filter(Boolean).join(' · ') };
  }
  if (row.role === 'observer') {
    lines.push(place, examDay(committee) ? `اليوم: ${examDay(committee)}` : '', ownerLine,
      same.length ? `المراقبون معك: ${same.join('، ')}` : 'لا يوجد مراقبون آخرون حتى الآن', driver);
  } else {
    const d = committee.ceremony_details ?? {};
    lines.push(
      d.ceremonyPlace ? `مكان الحفل: ${d.ceremonyPlace}` : 'مكان الحفل: لم يُحدد بعد',
      d.ceremonyDate ? `الموعد: ${[d.ceremonyDate, d.ceremonyTime].filter(Boolean).join(' ')}` : 'الموعد: لم يُحدد بعد',
      'دورك: شيخ الحفلة (حضور الحفل وتكريم الطلاب)',
      `عدد الطلاب: ${committee.students_count ?? 0}${d.honoredStudentsCount ? ` · المكرّمون: ${d.honoredStudentsCount}` : ''}`,
      ownerLine,
      same.length ? `المشايخ معك: ${same.join('، ')}` : '',
      driver
    );
  }
  if (row.note) lines.push(`ملاحظة: ${row.note}`);
  const title = row.role === 'observer' ? `تم تكليفك بالمراقبة في ${label(committee)}` : `تم تعيينك شيخًا لحفلة ${label(committee)}`;
  return { title, description: lines.filter(Boolean).join(' · ') };
}

/** Sends a job's notice now and marks it sent. */
async function sendNotice(db: Queryable, committee: any, row: { id: string; role: StaffRole; user_id: string; note?: string | null }) {
  const n = await staffNotice(db, committee, row);
  await notify(db, { ...n, type: 'info', committeeId: committee.id, targetUserId: row.user_id, data: { kind: 'staff.assigned', role: row.role } });
  await db.query('UPDATE committee_staff SET notified_at = NOW() WHERE id = $1;', [row.id]);
}

/** On activation: everyone whose notice was held gets it now. */
export async function releasePendingNotices(db: Queryable, committee: any) {
  const { rows } = await db.query(
    `SELECT id, role, user_id, note FROM committee_staff WHERE committee_id = $1 AND status = 'active' AND notified_at IS NULL
     ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, created_at;`,
    [committee.id]
  );
  for (const r of rows) await sendNotice(db, committee, r);
  return rows.length;
}

export class ScheduleConflict extends HttpError {
  constructor(conflicts: unknown[]) {
    super(409, 'هذا الشخص لديه مهمة أخرى في نفس اليوم. أكّد لإكمال التعيين.', 'schedule_conflict', { conflicts });
  }
}

/**
 * Adds a person to a committee as `role`. The caller has checked the right to do so. Conflicts on the same day are a
 * warning: without `confirmConflicts` a 409 schedule_conflict lists them. The notice goes now if members already see
 * the committee, otherwise it is held until activation.
 */
export async function addStaff(
  db: Queryable,
  req: Request,
  committee: any,
  input: { userId: string; role: StaffRole; note?: string | null; confirmConflicts?: boolean; canAssign?: boolean }
) {
  const actor = req.user!;
  const { rows: u } = await db.query('SELECT id, name, role, status FROM app_users WHERE id = $1 FOR UPDATE;', [input.userId]);
  const person = u[0];
  if (!person || person.status !== 'approved') throw badRequest('الشخص المختار غير موجود أو غير معتمد');
  if (isAdminRole(person.role) && actor.role !== 'super_admin') throw badRequest('الشخص المختار غير موجود أو غير معتمد');
  const { rows: existing } = await db.query(
    `SELECT id FROM committee_staff WHERE committee_id = $1 AND user_id = $2 AND role = $3 AND status = 'active';`,
    [committee.id, input.userId, input.role]
  );
  if (existing[0]) throw conflict(`هذا الشخص معيّن بالفعل ${STAFF_LABEL[input.role]} في هذه اللجنة`);
  const day = jobDay(committee, input.role);
  if (day && !input.confirmConflicts) {
    const conflicts = await busyOn(db, [input.userId], day, committee.id);
    if (conflicts.length) throw new ScheduleConflict(conflicts.map((c) => ({ ...c, day, userName: person.name })));
  }
  const id = `stf_${crypto.randomUUID()}`;
  await db.query(
    `INSERT INTO committee_staff (id, committee_id, user_id, role, can_assign, note, assigned_by, assigned_by_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8);`,
    [id, committee.id, input.userId, input.role, Boolean(input.canAssign), input.note ?? null, actor.id, actor.name]
  );
  await syncLegacy(db, { userIds: [input.userId], committeeIds: [committee.id] });
  if (isMemberVisible(committee.lifecycle)) {
    await sendNotice(db, committee, { id, role: input.role, user_id: input.userId, note: input.note });
    // The owner hears about everyone joining their committee.
    const owner = await ownerOf(db, committee);
    if (input.role !== 'owner' && owner?.id && owner.id !== input.userId && owner.id !== actor.id) {
      await notify(db, {
        title: `انضم ${STAFF_LABEL[input.role]} إلى ${label(committee)}`,
        description: person.name,
        type: 'info',
        committeeId: committee.id,
        targetUserId: owner.id,
        data: { kind: 'staff.joined' },
      });
    }
  }
  const { rows } = await db.query(`${STAFF_SELECT} WHERE s.id = $1;`, [id]);
  await audit(db, req, 'staff.add', 'committee', committee.id, null, presentStaff(rows[0]), `${STAFF_LABEL[input.role]}: ${person.name}`);
  return rows[0] as StaffRow;
}

/** Ends a job (removed by a manager, or excused by the person). Whoever was told is told it ended. */
export async function endStaff(
  db: Queryable,
  req: Request,
  committee: any,
  row: StaffRow,
  how: { status: 'removed' | 'excused'; reason?: string | null }
) {
  const actor = req.user!;
  await db.query(
    `UPDATE committee_staff SET status = $2, excuse_reason = $3, ended_at = NOW(), ended_by = $4, can_assign = false WHERE id = $1;`,
    [row.id, how.status, how.reason ?? null, actor.id]
  );
  await syncLegacy(db, { userIds: [row.user_id], committeeIds: [committee.id] });
  if (how.status === 'removed' && row.notified_at && row.user_id !== actor.id) {
    await notify(db, {
      title: `تم إلغاء تكليفك (${STAFF_LABEL[row.role]}) في ${label(committee)}`,
      description: '',
      type: 'info',
      targetUserId: row.user_id,
      data: { kind: 'staff.removed' },
    });
  }
  if (how.status === 'excused') {
    const owner = await ownerOf(db, committee);
    const to = [...(await managerIds(db)), ...(owner?.id && owner.id !== row.user_id ? [owner.id] : [])];
    await notifyMany(db, to, {
      title: `اعتذار: ${row.user_name} (${STAFF_LABEL[row.role]}) في ${label(committee)}`,
      description: how.reason ? `السبب: ${how.reason}` : 'بدون سبب مذكور',
      type: 'urgent',
      committeeId: committee.id,
      data: { kind: 'staff.excused' },
    });
  }
  await audit(db, req, how.status === 'excused' ? 'staff.excuse' : 'staff.remove', 'committee', committee.id, presentStaff(row), null,
    `${STAFF_LABEL[row.role]}: ${row.user_name}${how.reason ? ` — ${how.reason}` : ''}`);
}

/** The step the stages put the committee at (the stage work and the lifecycle stay in step). */
export function lifecycleFromStages(stages: any): Lifecycle | null {
  const done = (k: string) => Boolean(stages?.[k]?.completed);
  if (done('ceremony')) return 'ceremony_done';
  if (done('accreditation')) return 'accredited';
  if (done('exam')) return 'observed';
  return null;
}

/** Notices for reaching a step (sent once, when the committee arrives there). */
export async function onLifecycleReached(db: Queryable, committee: any, to: Lifecycle) {
  const managers = await managerIds(db);
  const staff = await activeStaff(db, committee.id);
  const people = (roles: StaffRole[]) => staff.filter((s) => roles.includes(s.role) && s.notified_at).map((s) => s.user_id);
  switch (to) {
    case 'sent_to_manager':
      await notifyMany(db, managers, {
        title: `لجنة جديدة: ${label(committee)}`,
        description: [examDay(committee) && `اليوم: ${examDay(committee)}`, committee.sheikh_country && `المكان: ${committee.sheikh_country}`]
          .filter(Boolean).join(' · ') || committee.course_name || '',
        type: 'info',
        committeeId: committee.id,
        data: { kind: 'lifecycle.sent_to_manager' },
      });
      return;
    case 'observers_open':
      await notifyMany(db, managers, {
        title: `الأدمن سمح لك بإضافة مراقبين في ${label(committee)}`,
        description: examDay(committee) ? `يوم اللجنة: ${examDay(committee)}` : '',
        type: 'info',
        committeeId: committee.id,
        data: { kind: 'lifecycle.observers_open' },
      });
      return;
    case 'active':
      await syncLegacy(db, { committeeIds: [committee.id] });
      await releasePendingNotices(db, committee);
      return;
    case 'observed':
      await notifyMany(db, people(['observer', 'owner']), {
        title: `تمت المراقبة في ${label(committee)}`,
        description: 'شكرًا لكم. اللجنة الآن في مرحلة التصحيح.',
        type: 'success',
        committeeId: committee.id,
        data: { kind: 'lifecycle.observed' },
      });
      return;
    case 'accredited':
      await notifyMany(db, managers, {
        title: `تم اعتماد ${label(committee)}: عيّن مشايخ للحفلة`,
        description: committee.ceremony_details?.ceremonyDate ? `موعد الحفل: ${committee.ceremony_details.ceremonyDate}` : 'حدد موعد الحفلة ومكانها ثم عيّن المشايخ',
        type: 'urgent',
        committeeId: committee.id,
        data: { kind: 'lifecycle.accredited' },
      });
      return;
    default:
      return;
  }
}

/** Moves the committee forward when its stages reached a later step (never back). Returns the new step, if any. */
export async function followStages(db: Queryable, committee: any): Promise<Lifecycle | null> {
  const target = lifecycleFromStages(committee.stages);
  if (!target) return null;
  // Only committees members already see follow their stages; earlier steps are moved on purpose.
  if (!isMemberVisible(committee.lifecycle)) return null;
  if (lifecycleIndex(target) <= lifecycleIndex(committee.lifecycle)) return null;
  await setLifecycle(db, committee, target, { id: null, name: 'تحديث المراحل' });
  for (let i = lifecycleIndex(committee.lifecycle) + 1; i <= lifecycleIndex(target); i++) {
    await onLifecycleReached(db, { ...committee, lifecycle: LIFECYCLE[i] }, LIFECYCLE[i]);
  }
  return target;
}

export async function setLifecycle(db: Queryable, committee: any, to: Lifecycle, by: { id: string | null; name: string }) {
  const entry = { from: committee.lifecycle, to, at: new Date().toISOString(), byId: by.id, byName: by.name };
  const { rows } = await db.query(
    `UPDATE committees SET lifecycle = $2, lifecycle_history = COALESCE(lifecycle_history, '[]'::jsonb) || $3::jsonb, updated_at = NOW()
     WHERE id = $1 RETURNING *;`,
    [committee.id, to, JSON.stringify([entry])]
  );
  return rows[0];
}

/** Checks that `actor` may move `committee` to `to` (one step forward by its actor, one step back by an admin). */
export function assertLifecycleStep(actor: Principal, committee: any, to: Lifecycle) {
  const from = lifecycleIndex(committee.lifecycle);
  const target = LIFECYCLE.indexOf(to);
  if (target < 0) throw badRequest('مرحلة غير معروفة');
  if (target === from) throw conflict('اللجنة في هذه المرحلة بالفعل');
  if (target < from) {
    if (!isAdminRole(actor.role)) throw forbidden('الرجوع لمرحلة سابقة متاح للأدمن فقط');
    if (target !== from - 1) throw badRequest('يمكن الرجوع مرحلة واحدة فقط في كل مرة');
    return 'back' as const;
  }
  if (target !== from + 1) {
    throw badRequest(`الخطوة التالية للجنة هي «${LIFECYCLE_LABEL[LIFECYCLE[from + 1]]}»`, { next: LIFECYCLE[from + 1] });
  }
  const who = LIFECYCLE_ACTOR[to as Exclude<Lifecycle, 'draft'>];
  if (who === 'admin' && !isAdminRole(actor.role)) throw forbidden('هذه الخطوة يأخذها الأدمن');
  if (who === 'manager' && !isAdminRole(actor.role) && actor.role !== 'exams_manager') throw forbidden('هذه الخطوة يأخذها مدير الحفلات والامتحانات أو الأدمن');
  return 'forward' as const;
}

export async function loadCommittee(db: Queryable, id: string, lock = false) {
  const { rows } = await db.query(`SELECT * FROM committees WHERE id = $1${lock ? ' FOR UPDATE' : ''};`, [id]);
  if (!rows[0]) throw notFound('اللجنة غير موجودة');
  return rows[0];
}
