import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { assertAllowed, can, revokeAllSessions } from '../auth.ts';
import { audit } from '../audit.ts';
import { type Pool, type Queryable, withTransaction } from '../db.ts';
import { badRequest, conflict, forbidden, notFound, route } from '../http.ts';
import { logger } from '../logger.ts';
import { type Principal, ROLES, type Role, canSeeRole, grantableRoles, isAllowed, isCommitteeInScope, isSystemPermission } from '../policy.ts';
import { id, normalizePhone, optionalText, toAsciiDigits } from '../schemas.ts';
import { notify } from './notifications.ts';

export const passwordSchema = z
  .string()
  .min(8, 'كلمة المرور يجب ألا تقل عن 8 أحرف')
  .max(128)
  .refine((p) => /[A-Za-z؀-ۿ]/.test(p) && /\d/.test(p), 'كلمة المرور يجب أن تحتوي على حروف وأرقام');

export const phoneSchema = z
  .string()
  .transform(toAsciiDigits)
  .pipe(z.string().trim()
  .min(6, 'رقم الهاتف غير صحيح')
  .max(30)
  .regex(/^\+?[\d\s\-()]+$/, 'رقم الهاتف غير صحيح'))
  .transform(normalizePhone);

export const emailSchema = z
  .string()
  .trim()
  .max(200)
  .nullish()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'البريد الإلكتروني غير صحيح');

// Profile fields kept in app_users.data. Everything that affects access (role, status,
// permissions, committees, exam access, password) lives in real columns and is never
// writable by the user themself.
const PROFILE_FIELDS = {
  whatsapp: optionalText(50),
  quranLevel: optionalText(500),
  qualification: optionalText(500),
  experience: optionalText(2000),
  availability: optionalText(500),
  preferredCommittees: z.array(z.coerce.number().int()).max(500).optional(),
  interviewDate: optionalText(100),
  interviewNotes: optionalText(2000),
  rejectionReason: optionalText(2000),
} as const;
const PROFILE_KEYS = Object.keys(PROFILE_FIELDS) as (keyof typeof PROFILE_FIELDS)[];

const userInput = z.object({
  id,
  name: z.string().trim().min(1, 'الاسم مطلوب').max(200),
  phone: phoneSchema,
  email: emailSchema,
  password: z.string().max(128).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(['pending', 'interview', 'approved', 'rejected']).optional(),
  /** Committees by id (authoritative). */
  assignedCommitteeIds: z.array(z.string().max(255)).max(1000).optional(),
  /** Committees by number: accepted from clients that predate committee ids. */
  assignedCommittees: z.array(z.coerce.number().int().min(0)).max(1000).optional(),
  allCommitteesAllowed: z.boolean().optional(),
  allExamsAllowed: z.boolean().optional(),
  allowedExamIds: z.array(z.string().max(255)).max(1000).optional(),
  /** Applying a permission profile copies its settings onto the user (super admin only). */
  profileId: z.string().max(255).nullish(),
  permissions: z.array(z.string().max(100)).max(200).optional(),
  notes: optionalText(5000),
  /** The updatedAt the client last saw; a different server value means someone else changed the user. */
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  ...PROFILE_FIELDS,
});
type UserInput = z.infer<typeof userInput>;

/** Selects a user row plus the committee numbers of its assigned committee ids. */
const USER_SELECT = `
  SELECT u.*, COALESCE((SELECT jsonb_agg(DISTINCT c.committee_number) FROM committees c
                        WHERE u.assigned_committee_ids ? c.id), '[]'::jsonb) AS assigned_numbers
  FROM app_users u`;

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const iso = (v: any) => (v instanceof Date ? v.toISOString() : v);

/** API representation of a user. */
export function userFromRow(r: any) {
  const profile = r.data ?? {};
  const numbers = Array.isArray(r.assigned_numbers) ? r.assigned_numbers : r.assigned_committees ?? [];
  const out: Record<string, unknown> = {
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email ?? '',
    role: r.role,
    status: r.status,
    assignedCommittees: [...numbers].map(Number).sort((a, b) => a - b),
    assignedCommitteeIds: asStrings(r.assigned_committee_ids),
    allCommitteesAllowed: Boolean(r.all_committees),
    allExamsAllowed: Boolean(r.all_exams),
    allowedExamIds: asStrings(r.allowed_exam_ids),
    profileId: r.profile_id ?? undefined,
    mustChangePassword: Boolean(r.must_change_password),
    permissions: r.permissions ?? [],
    createdAt: r.created_at ?? '',
    approvedAt: r.approved_at ?? undefined,
    approvedBy: r.approved_by ?? undefined,
    notes: r.notes ?? undefined,
    requestCode: r.request_code ?? undefined,
    updatedAt: iso(r.updated_at),
  };
  for (const k of PROFILE_KEYS) if (profile[k] !== undefined && profile[k] !== null) out[k] = profile[k];
  if (profile.rejectedAt) out.rejectedAt = profile.rejectedAt;
  if (profile.rejectedBy) out.rejectedBy = profile.rejectedBy;
  return out;
}

async function countSuperAdmins(db: Queryable, excludeId: string): Promise<number> {
  const { rows } = await db.query(
    "SELECT count(*)::int AS n FROM app_users WHERE role = 'super_admin' AND status = 'approved' AND id <> $1;",
    [excludeId]
  );
  return rows[0].n;
}

const sameSet = (a: unknown[] = [], b: unknown[] = []) =>
  a.length === b.length && a.every((x) => b.map(String).includes(String(x)));

/**
 * Only system permissions grant anything (custom permission labels are display-only, D-01).
 * Unknown ids are dropped and logged; with STRICT_PERMISSION_IDS they are rejected.
 */
export function cleanPermissions(input: string[], strict: boolean): string[] {
  const unknown = input.filter((p) => !isSystemPermission(p));
  if (unknown.length) {
    if (strict) throw badRequest(`صلاحيات غير معروفة: ${unknown.join('، ')}`);
    logger.warn('users.unknown_permissions_dropped', { unknown });
  }
  return [...new Set(input.filter(isSystemPermission))];
}

/**
 * Committee numbers from older clients become ids. Numbers that did not change keep their
 * current ids; a newly added number means that committee number in the default course (or in
 * every course when there is no default).
 */
async function idsFromNumbers(db: Queryable, numbers: number[], currentIds: string[]): Promise<string[]> {
  const { rows: current } = await db.query('SELECT id, committee_number FROM committees WHERE id = ANY($1::text[]);', [currentIds]);
  const keep = current.filter((c) => numbers.includes(Number(c.committee_number))).map((c) => c.id as string);
  const keptNumbers = new Set(current.filter((c) => keep.includes(c.id)).map((c) => Number(c.committee_number)));
  const added = numbers.filter((n) => !keptNumbers.has(n));
  if (added.length === 0) return keep;
  const { rows: def } = await db.query('SELECT id FROM courses WHERE is_default LIMIT 1;');
  const { rows } = def[0]
    ? await db.query('SELECT id FROM committees WHERE committee_number = ANY($1::int[]) AND course_id = $2;', [added, def[0].id])
    : await db.query('SELECT id FROM committees WHERE committee_number = ANY($1::int[]);', [added]);
  return [...new Set([...keep, ...rows.map((r) => r.id as string)])];
}

async function committeeNumbersFor(db: Queryable, ids: string[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.query('SELECT DISTINCT committee_number FROM committees WHERE id = ANY($1::text[]) ORDER BY 1;', [ids]);
  return rows.map((r) => Number(r.committee_number));
}

interface SaveOptions {
  strictPermissionIds: boolean;
}

async function saveUser(db: Queryable, req: Request, input: UserInput, opts: SaveOptions) {
  const actor = req.user!;
  const { rows } = await db.query('SELECT * FROM app_users WHERE id = $1 FOR UPDATE;', [input.id]);
  const existing = rows[0];
  if (existing && input.expectedUpdatedAt) {
    const current = existing.updated_at instanceof Date ? existing.updated_at.getTime() : new Date(existing.updated_at).getTime();
    if (current !== new Date(input.expectedUpdatedAt).getTime()) {
      throw conflict('تم تعديل بيانات هذا المستخدم من مكان آخر، حدّث البيانات ثم أعد المحاولة');
    }
  }
  const isSelf = actor.id === input.id;
  // Optional text fields parse a missing value as null, so "was it sent?" is read from the raw body:
  // a field a client leaves out keeps its stored value (partial saves never wipe data).
  const sent = (key: string) => Object.prototype.hasOwnProperty.call(req.body ?? {}, key);
  const canManage = isAllowed(actor, 'users.manage');
  const canGrant = isAllowed(actor, 'users.grant');

  if (!existing && !canManage) throw forbidden();
  // Admin accounts do not exist for anyone but a super admin: not listed, not editable.
  if (existing && !isSelf && !canSeeRole(actor, existing.role)) throw notFound('المستخدم غير موجود');
  if (existing && !isSelf && !canManage) throw forbidden('ليس لديك صلاحية لتعديل هذا المستخدم');
  // Committee heads who may manage people handle sheikhs only (API-01).
  if (existing && !isSelf && !canGrant && existing.status === 'approved' && existing.role !== 'sheikh') {
    throw forbidden('إدارة الحسابات المعتمدة لغير الشيوخ متاحة للأدمن فقط');
  }

  // ---- Access settings: start from the stored values, apply a profile, then explicit fields.
  let permissions: string[] = asStrings(existing?.permissions);
  let assignedIds: string[] = asStrings(existing?.assigned_committee_ids);
  let allCommittees = Boolean(existing?.all_committees);
  let allExams = Boolean(existing?.all_exams);
  let allowedExamIds: string[] = asStrings(existing?.allowed_exam_ids);
  let profileId: string | null = existing?.profile_id ?? null;
  let profileCommitteeIds = new Set<string>();

  if (input.profileId !== undefined && (input.profileId ?? null) !== profileId) {
    profileId = input.profileId ?? null;
    if (profileId) {
      const { rows: prof } = await db.query('SELECT * FROM permission_profiles WHERE id = $1;', [profileId]);
      if (!prof[0]) throw badRequest('البروفايل غير موجود');
      const p = prof[0];
      permissions = asStrings(p.permissions);
      allCommittees = Boolean(p.all_committees_allowed);
      profileCommitteeIds = new Set(asStrings(p.allowed_committee_ids));
      assignedIds = allCommittees ? assignedIds : asStrings(p.allowed_committee_ids);
      allExams = Boolean(p.all_exams_allowed);
      allowedExamIds = asStrings(p.allowed_exam_ids);
    }
  }
  if (input.permissions !== undefined) permissions = input.permissions;
  permissions = cleanPermissions(permissions, opts.strictPermissionIds);
  if (input.assignedCommitteeIds !== undefined) assignedIds = [...new Set(input.assignedCommitteeIds)];
  else if (input.assignedCommittees !== undefined) assignedIds = await idsFromNumbers(db, input.assignedCommittees, assignedIds);
  if (input.allCommitteesAllowed !== undefined) allCommittees = input.allCommitteesAllowed;
  if (input.allExamsAllowed !== undefined) allExams = input.allExamsAllowed;
  if (input.allowedExamIds !== undefined) allowedExamIds = [...new Set(input.allowedExamIds)];

  const role: Role = input.role ?? existing?.role ?? 'sheikh';
  const status = input.status ?? existing?.status ?? 'pending';

  const before = {
    permissions: cleanPermissions(asStrings(existing?.permissions), false),
    assignedIds: asStrings(existing?.assigned_committee_ids),
  };
  const roleChanged = existing ? role !== existing.role : role !== 'sheikh';
  const permsChanged = existing ? !sameSet(permissions, before.permissions) : permissions.length > 0;
  const statusChanged = existing ? status !== existing.status : status !== 'pending';
  const assignedChanged = existing ? !sameSet(assignedIds, before.assignedIds) : assignedIds.length > 0;
  const grantsChanged = existing
    ? allCommittees !== Boolean(existing.all_committees) ||
      allExams !== Boolean(existing.all_exams) ||
      !sameSet(allowedExamIds, asStrings(existing.allowed_exam_ids)) ||
      profileId !== (existing.profile_id ?? null)
    : allCommittees || allExams || allowedExamIds.length > 0 || profileId !== null;

  // Nobody changes their own access, whatever their role (API-01). Another super admin must do it.
  if (isSelf && existing && (roleChanged || permsChanged || statusChanged || assignedChanged || grantsChanged)) {
    throw forbidden('لا يمكنك تعديل صلاحياتك أو لجانك أو حالة حسابك بنفسك');
  }
  if ((roleChanged || permsChanged || grantsChanged) && !canGrant) {
    throw forbidden('تعيين الأدوار والصلاحيات متاح للأدمن فقط');
  }
  // Admins give only the roles below them; admin accounts are a super admin's.
  if ((roleChanged || !existing) && !isSelf && !grantableRoles(actor).includes(role)) {
    throw forbidden('لا يمكنك تعيين هذا الدور');
  }
  // Approving an account activates the role it carries. A join request may ask for any role,
  // so activating anything above sheikh is a grant, even when the role itself is unchanged.
  const activating = status === 'approved' && existing?.status !== 'approved';
  if (activating && role !== 'sheikh' && !canGrant) {
    throw forbidden('اعتماد حساب بدور غير «شيخ» متاح للأدمن فقط');
  }
  if (activating && !grantableRoles(actor).includes(role)) throw forbidden('لا يمكنك اعتماد حساب بهذا الدور');
  // Managers who are not super admins may assign only committees inside their own scope.
  if (assignedChanged && !canGrant) {
    if (role !== 'sheikh') throw forbidden('تعيين لجان لغير الشيوخ متاح للأدمن فقط');
    const changed = [
      ...assignedIds.filter((x) => !before.assignedIds.includes(x)),
      ...before.assignedIds.filter((x) => !assignedIds.includes(x)),
    ];
    const outside = changed.filter((cid) => !isCommitteeInScope(actor as Principal, cid));
    if (outside.length) throw forbidden('لا يمكنك إسناد لجان خارج نطاق لجانك');
  }
  if (assignedIds.length) {
    // Committees deleted since they were assigned (or kept on a permission profile) are dropped
    // quietly; only a committee being added now must exist.
    const { rows: found } = await db.query('SELECT id FROM committees WHERE id = ANY($1::text[]);', [assignedIds]);
    const existingIds = new Set(found.map((r) => r.id as string));
    if (assignedIds.some((cid) => !existingIds.has(cid) && !before.assignedIds.includes(cid) && !profileCommitteeIds.has(cid))) {
      throw badRequest('إحدى اللجان المحددة غير موجودة');
    }
    assignedIds = assignedIds.filter((cid) => existingIds.has(cid));
  }

  // Never leave the system without an approved super admin.
  if (existing?.role === 'super_admin' && (role !== 'super_admin' || status !== 'approved')) {
    if ((await countSuperAdmins(db, existing.id)) === 0) throw conflict('لا يمكن إزالة آخر مشرف عام في النظام');
  }

  let passwordHash: string | null = existing?.password ?? null;
  let mustChange = Boolean(existing?.must_change_password);
  if (!existing) {
    // New accounts created by staff must get an initial password; the person changes it at first login.
    passwordHash = await bcrypt.hash(passwordSchema.parse(input.password ?? ''), 12);
    mustChange = true;
  } else if (input.password && !isSelf && canGrant) {
    // Admin reset (older clients). New clients use POST /api/users/:id/reset-password.
    passwordHash = await bcrypt.hash(passwordSchema.parse(input.password), 12);
    mustChange = true;
  }

  const profile: Record<string, unknown> = { ...(existing?.data ?? {}) };
  for (const k of PROFILE_KEYS) if (sent(k)) profile[k] = input[k];
  if (status === 'rejected' && existing?.status !== 'rejected') {
    profile.rejectedAt = new Date().toISOString();
    profile.rejectedBy = actor.name;
  }

  const approvedNow = status === 'approved' && existing?.status !== 'approved';
  const passwordChanged = Boolean(existing) && passwordHash !== existing.password;
  const sessionsInvalid = Boolean(existing) && (roleChanged || permsChanged || statusChanged || assignedChanged || grantsChanged || passwordChanged);
  const numbers = await committeeNumbersFor(db, assignedIds);

  const { rows: saved } = await db.query(
    `INSERT INTO app_users (id, name, phone, email, password, passport_number, role, status, assigned_committees,
       assigned_committee_ids, all_committees, all_exams, allowed_exam_ids, profile_id, must_change_password,
       permissions, notes, created_at, approved_at, approved_by, data, token_version, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,0,NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email, password = EXCLUDED.password,
       passport_number = EXCLUDED.passport_number, role = EXCLUDED.role, status = EXCLUDED.status,
       assigned_committees = EXCLUDED.assigned_committees, assigned_committee_ids = EXCLUDED.assigned_committee_ids,
       all_committees = EXCLUDED.all_committees, all_exams = EXCLUDED.all_exams,
       allowed_exam_ids = EXCLUDED.allowed_exam_ids, profile_id = EXCLUDED.profile_id,
       must_change_password = EXCLUDED.must_change_password, permissions = EXCLUDED.permissions,
       notes = EXCLUDED.notes, approved_at = EXCLUDED.approved_at, approved_by = EXCLUDED.approved_by,
       data = EXCLUDED.data,
       token_version = app_users.token_version + $22,
       password_changed_at = CASE WHEN app_users.password IS DISTINCT FROM EXCLUDED.password THEN NOW() ELSE app_users.password_changed_at END,
       updated_at = NOW()
     RETURNING *;`,
    [
      input.id, input.name, input.phone,
      sent('email') || !existing ? input.email : existing.email,
      passwordHash,
      // No ID or passport number is kept (migration 018).
      null,
      role, status, JSON.stringify(numbers), JSON.stringify(assignedIds), allCommittees, allExams,
      JSON.stringify(allowedExamIds), profileId, mustChange, JSON.stringify(permissions),
      sent('notes') ? input.notes : existing?.notes ?? null,
      existing?.created_at ?? new Date().toISOString(),
      approvedNow ? new Date().toISOString() : existing?.approved_at ?? null,
      approvedNow ? actor.name : existing?.approved_by ?? null,
      JSON.stringify(profile),
      sessionsInvalid ? 1 : 0,
    ]
  );
  if (sessionsInvalid) await revokeAllSessions(db, input.id, 'access_changed');

  if (approvedNow && existing) {
    await notify(db, { title: 'تم اعتماد حسابك', description: 'يمكنك الآن تسجيل الدخول واستخدام النظام', type: 'success', targetUserId: input.id });
  } else if (existing && assignedChanged && status === 'approved') {
    await notify(db, { title: 'تم تحديث اللجان المسندة إليك', description: `عدد اللجان: ${allCommittees ? 'كل اللجان' : assignedIds.length}`, type: 'info', targetUserId: input.id });
  }

  const safe = (r: any) => (r ? userFromRow(r) : null);
  await audit(db, req, existing ? 'user.update' : 'user.create', 'user', input.id, safe(existing), safe(saved[0]));
  return saved[0];
}

/**
 * Which users someone sees (API-08): super admins see everyone; admins see everyone except other
 * admins and super admins; committee heads see themself and the approved sheikhs they can staff
 * their committees with (plus applicants when they may manage people).
 */
async function listUsersFor(db: Queryable, actor: Principal) {
  const order = "ORDER BY (u.role = 'super_admin') DESC, (u.role = 'admin') DESC, u.created_at ASC NULLS LAST, u.name ASC";
  if (isAllowed(actor, 'users.admins')) {
    const { rows } = await db.query(`${USER_SELECT} ${order};`);
    return rows;
  }
  if (isAllowed(actor, 'users.grant')) {
    const { rows } = await db.query(`${USER_SELECT} WHERE u.id = $1 OR u.role NOT IN ('super_admin', 'admin') ${order};`, [actor.id]);
    return rows;
  }
  const { rows } = await db.query(
    `${USER_SELECT}
     WHERE u.id = $1
        OR (u.role = 'sheikh' AND u.status = 'approved')
        OR ($2::boolean AND u.status <> 'approved' AND u.role NOT IN ('super_admin', 'admin'))
     ${order};`,
    [actor.id, isAllowed(actor, 'users.manage')]
  );
  return rows;
}

/** Approved people `actor` may add to a committee or a ceremony (admins never see admin accounts). */
export async function staffableUsers(db: Queryable, actor: Principal, ids?: string[]) {
  const roles: Role[] = isAllowed(actor, 'users.admins')
    ? [...ROLES]
    : isAllowed(actor, 'users.grant')
      ? ['committee_head', 'sheikh']
      : ['sheikh'];
  const { rows } = await db.query(
    `SELECT id, name, role FROM app_users
     WHERE status = 'approved' AND (role = ANY($1::text[]) OR id = $2) AND ($3::text[] IS NULL OR id = ANY($3::text[]))
     ORDER BY name ASC;`,
    [roles, actor.id, ids ?? null]
  );
  return rows as Array<{ id: string; name: string; role: Role }>;
}

export function usersRouter(pool: Pool, opts: SaveOptions) {
  const r = Router();

  r.get('/', can('users.read'), route(async (req, res) => {
    const rows = await listUsersFor(pool, req.user!);
    res.json({ success: true, users: rows.map((u) => userFromRow(u)) });
  }));

  /**
   * People a task may be assigned to (D-07): anyone allowed to write tasks gets id and name of
   * approved staff, limited to their own committees when they are committee-scoped.
   */
  r.get('/ceremony-candidates', can('committees.finalize'), route(async (req, res) => {
    const rows = await staffableUsers(pool, req.user!);
    res.json({ success: true, users: rows.map((u) => ({ id: u.id, name: u.name, role: u.role })) });
  }));

  r.get('/assignable', can('tasks.write'), route(async (req, res) => {
    const actor = req.user!;
    const unscoped = actor.allCommittees || !['committee_head', 'sheikh'].includes(actor.role);
    const { rows } = await pool.query(
      `SELECT id, name, role FROM app_users
       WHERE status = 'approved' AND role IN ('sheikh', 'committee_head')
         AND (id = $1 OR $2::boolean OR all_committees OR assigned_committee_ids ?| $3::text[])
       ORDER BY name ASC;`,
      [actor.id, unscoped, actor.assignedCommitteeIds]
    );
    res.json({ success: true, users: rows.map((u) => ({ id: u.id, name: u.name, role: u.role })) });
  }));

  r.post('/', route(async (req, res) => {
    const input = userInput.parse(req.body);
    const row = await withTransaction(pool, (db) => saveUser(db, req, input, opts));
    const { rows } = await pool.query(`${USER_SELECT} WHERE u.id = $1;`, [row.id]);
    res.json({ success: true, user: userFromRow(rows[0]) });
  }));

  // Admin password reset (WEB-02): the user must choose a new password at the next login.
  r.post('/:id/reset-password', can('users.grant'), route(async (req, res) => {
    const { password } = z.object({ password: passwordSchema }).parse(req.body);
    if (req.params.id === req.user!.id) throw badRequest('لتغيير كلمة مرورك استخدم «حسابي» ← تغيير كلمة المرور');
    await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT id, role FROM app_users WHERE id = $1 FOR UPDATE;', [req.params.id]);
      if (!rows[0] || !canSeeRole(req.user!, rows[0].role)) throw notFound('المستخدم غير موجود');
      await db.query(
        `UPDATE app_users SET password = $2, password_changed_at = NOW(), must_change_password = true,
           token_version = token_version + 1, failed_login_count = 0, locked_until = NULL, updated_at = NOW()
         WHERE id = $1;`,
        [req.params.id, await bcrypt.hash(password, 12)]
      );
      await revokeAllSessions(db, req.params.id, 'password_reset');
      await audit(db, req, 'user.password_reset', 'user', req.params.id, null, null);
      await notify(db, { title: 'تمت إعادة تعيين كلمة المرور', description: 'سجّل الدخول بكلمة المرور المؤقتة ثم اختر كلمة مرور جديدة', type: 'urgent', targetUserId: req.params.id });
    });
    res.json({ success: true });
  }));

  r.delete('/:id', route(async (req, res) => {
    assertAllowed(req.user!, 'users.delete');
    if (req.params.id === req.user!.id) throw badRequest('لا يمكنك حذف حسابك الشخصي');
    await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM app_users WHERE id = $1 FOR UPDATE;', [req.params.id]);
      if (!rows[0] || !canSeeRole(req.user!, rows[0].role)) throw notFound('المستخدم غير موجود');
      if (rows[0].role === 'super_admin' && (await countSuperAdmins(db, rows[0].id)) === 0) {
        throw conflict('لا يمكن حذف آخر مشرف عام في النظام');
      }
      await db.query('DELETE FROM app_users WHERE id = $1;', [req.params.id]);
      // A deleted account is no longer invited to any ceremony.
      await db.query(
        `UPDATE committees SET ceremony_details = jsonb_set(ceremony_details, '{attendees}',
           COALESCE((SELECT jsonb_agg(a) FROM jsonb_array_elements(ceremony_details -> 'attendees') a WHERE a ->> 'id' <> $1), '[]'::jsonb)),
           updated_at = NOW()
         WHERE ceremony_details -> 'attendees' @> jsonb_build_array(jsonb_build_object('id', $1::text));`,
        [req.params.id]
      );
      await audit(db, req, 'user.delete', 'user', req.params.id, userFromRow(rows[0]), null);
    });
    res.json({ success: true });
  }));

  return r;
}
