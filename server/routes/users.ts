import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { assertAllowed, can } from '../auth.ts';
import { audit } from '../audit.ts';
import { type Pool, type Queryable, withTransaction } from '../db.ts';
import { badRequest, conflict, forbidden, notFound, route } from '../http.ts';
import { ROLES, isAllowed } from '../policy.ts';
import { id, optionalText, toAsciiDigits } from '../schemas.ts';

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
  .regex(/^\+?[\d\s-]+$/, 'رقم الهاتف غير صحيح'))
  .transform((v) => v.replace(/[\s-]/g, ''));

export const emailSchema = z
  .string()
  .trim()
  .max(200)
  .nullish()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'البريد الإلكتروني غير صحيح');

// Profile fields kept in app_users.data. Everything that affects access
// (role, status, permissions, committees, password) lives in real columns only.
const PROFILE_FIELDS = {
  whatsapp: optionalText(50),
  nationalId: optionalText(50),
  profileId: optionalText(255),
  allowedExamIds: z.array(z.string().max(255)).max(500).optional(),
  allExamsAllowed: z.boolean().optional(),
  allCommitteesAllowed: z.boolean().optional(),
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
  passportNumber: optionalText(50),
  password: z.string().max(128).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(['pending', 'interview', 'approved', 'rejected']).optional(),
  assignedCommittees: z.array(z.coerce.number().int().min(0)).max(1000).optional(),
  permissions: z.array(z.string().max(100)).max(200).optional(),
  notes: optionalText(5000),
  /** The updatedAt the client last saw; a different server value means someone else changed the user. */
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  ...PROFILE_FIELDS,
});

/** API representation. Identity documents are only shown to super admins and the user themself. */
export function userFromRow(r: any, opts: { includeIdentity: boolean }) {
  const profile = r.data ?? {};
  const out: Record<string, unknown> = {
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email ?? '',
    role: r.role,
    status: r.status,
    assignedCommittees: r.assigned_committees ?? [],
    permissions: r.permissions ?? [],
    createdAt: r.created_at ?? '',
    approvedAt: r.approved_at ?? undefined,
    approvedBy: r.approved_by ?? undefined,
    notes: r.notes ?? undefined,
    requestCode: r.request_code ?? undefined,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  };
  for (const k of PROFILE_KEYS) if (profile[k] !== undefined && profile[k] !== null) out[k] = profile[k];
  if (profile.rejectedAt) out.rejectedAt = profile.rejectedAt;
  if (profile.rejectedBy) out.rejectedBy = profile.rejectedBy;
  if (opts.includeIdentity) out.passportNumber = r.passport_number ?? undefined;
  else delete out.nationalId;
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

async function saveUser(db: Queryable, req: Request, input: z.infer<typeof userInput>) {
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
  const canManage = isAllowed(actor, 'users.manage');
  const canGrant = isAllowed(actor, 'users.grant');

  if (!existing && !canManage) throw forbidden();
  if (existing && !isSelf && !canManage) throw forbidden('ليس لديك صلاحية لتعديل هذا المستخدم');
  // Managers who are not super admins cannot touch super admins.
  if (existing && !isSelf && existing.role === 'super_admin' && !canGrant) throw forbidden();

  const role = input.role ?? existing?.role ?? 'assistant';
  const permissions = input.permissions ?? existing?.permissions ?? [];
  const status = input.status ?? existing?.status ?? 'pending';
  const assigned = input.assignedCommittees ?? existing?.assigned_committees ?? [];

  const roleChanged = existing ? role !== existing.role : role !== 'assistant';
  const permsChanged = existing ? !sameSet(permissions, existing.permissions) : permissions.length > 0;
  if ((roleChanged || permsChanged) && !canGrant) {
    throw forbidden('تعيين الأدوار والصلاحيات متاح للمشرف العام فقط');
  }
  // Approving an account activates the role it carries. A join request may ask for any role,
  // so activating anything above assistant is a grant, even when the role itself is unchanged.
  const activating = status === 'approved' && existing?.status !== 'approved';
  if (activating && role !== 'assistant' && !canGrant) {
    throw forbidden('اعتماد حساب بدور غير «معاون» متاح للمشرف العام فقط');
  }
  const statusChanged = existing ? status !== existing.status : status !== 'pending';
  const assignedChanged = existing ? !sameSet(assigned, existing.assigned_committees) : assigned.length > 0;
  if (isSelf && !canManage && (statusChanged || assignedChanged)) throw forbidden();

  // Never leave the system without an approved super admin.
  if (existing?.role === 'super_admin' && (role !== 'super_admin' || status !== 'approved')) {
    if ((await countSuperAdmins(db, existing.id)) === 0) throw conflict('لا يمكن إزالة آخر مشرف عام في النظام');
  }

  let passwordHash: string | null = existing?.password ?? null;
  if (!existing) {
    // New accounts created by staff must get an initial password so the person can log in.
    passwordHash = await bcrypt.hash(passwordSchema.parse(input.password ?? ''), 12);
  } else if (input.password && !isSelf && canGrant) {
    // Admin reset. Users change their own password through /api/auth/change-password.
    passwordHash = await bcrypt.hash(passwordSchema.parse(input.password), 12);
  }

  const profile: Record<string, unknown> = { ...(existing?.data ?? {}) };
  for (const k of PROFILE_KEYS) if (input[k] !== undefined) profile[k] = input[k];
  if (status === 'rejected' && existing?.status !== 'rejected') {
    profile.rejectedAt = new Date().toISOString();
    profile.rejectedBy = actor.name;
  }

  const approvedNow = status === 'approved' && existing?.status !== 'approved';
  const sessionsInvalid = existing && (roleChanged || permsChanged || statusChanged || assignedChanged || passwordHash !== existing.password);

  const { rows: saved } = await db.query(
    `INSERT INTO app_users (id, name, phone, email, password, passport_number, role, status, assigned_committees,
       permissions, notes, created_at, approved_at, approved_by, data, token_version, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,0,NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email, password = EXCLUDED.password,
       passport_number = EXCLUDED.passport_number, role = EXCLUDED.role, status = EXCLUDED.status,
       assigned_committees = EXCLUDED.assigned_committees, permissions = EXCLUDED.permissions,
       notes = EXCLUDED.notes, approved_at = EXCLUDED.approved_at, approved_by = EXCLUDED.approved_by,
       data = EXCLUDED.data,
       token_version = app_users.token_version + $16,
       password_changed_at = CASE WHEN app_users.password IS DISTINCT FROM EXCLUDED.password THEN NOW() ELSE app_users.password_changed_at END,
       updated_at = NOW()
     RETURNING *;`,
    [
      input.id, input.name, input.phone, input.email, passwordHash,
      input.passportNumber !== undefined ? input.passportNumber : existing?.passport_number ?? null,
      role, status, JSON.stringify(assigned), JSON.stringify(permissions),
      input.notes !== undefined ? input.notes : existing?.notes ?? null,
      existing?.created_at ?? new Date().toISOString(),
      approvedNow ? new Date().toISOString() : existing?.approved_at ?? null,
      approvedNow ? actor.name : existing?.approved_by ?? null,
      JSON.stringify(profile),
      sessionsInvalid ? 1 : 0,
    ]
  );
  if (sessionsInvalid) await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL;', [input.id]);

  const safe = (r: any) => (r ? userFromRow(r, { includeIdentity: false }) : null);
  await audit(db, req, existing ? 'user.update' : 'user.create', 'user', input.id, safe(existing), safe(saved[0]));
  return saved[0];
}

export function usersRouter(pool: Pool) {
  const r = Router();

  r.get('/', can('users.read'), route(async (req, res) => {
    const includeIdentity = isAllowed(req.user!, 'users.grant');
    const { rows } = await pool.query(
      "SELECT * FROM app_users ORDER BY (role = 'super_admin') DESC, created_at ASC NULLS LAST, name ASC;"
    );
    res.json({ success: true, users: rows.map((u) => userFromRow(u, { includeIdentity })) });
  }));

  r.post('/', route(async (req, res) => {
    const input = userInput.parse(req.body);
    const row = await withTransaction(pool, (db) => saveUser(db, req, input));
    res.json({ success: true, user: userFromRow(row, { includeIdentity: isAllowed(req.user!, 'users.grant') || req.user!.id === row.id }) });
  }));

  r.delete('/:id', route(async (req, res) => {
    assertAllowed(req.user!, 'users.delete');
    if (req.params.id === req.user!.id) throw badRequest('لا يمكنك حذف حسابك الشخصي');
    await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM app_users WHERE id = $1 FOR UPDATE;', [req.params.id]);
      if (!rows[0]) throw notFound('المستخدم غير موجود');
      if (rows[0].role === 'super_admin' && (await countSuperAdmins(db, rows[0].id)) === 0) {
        throw conflict('لا يمكن حذف آخر مشرف عام في النظام');
      }
      await db.query('DELETE FROM app_users WHERE id = $1;', [req.params.id]);
      await audit(db, req, 'user.delete', 'user', req.params.id, userFromRow(rows[0], { includeIdentity: false }), null);
    });
    res.json({ success: true });
  }));

  return r;
}
