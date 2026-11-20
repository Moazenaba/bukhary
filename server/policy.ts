// Single source of truth for who may do what. The server enforces it, and
// GET /api/auth/me returns the evaluated result so web and mobile show
// exactly the actions the server will accept.
//
// The system manages people: who goes to which committee and which ceremony.
// - super_admin: everything, and the only role that sees or manages admin accounts.
// - admin: everything except the super-admin-only actions; never sees other admins or super admins.
// - committee_head: heads the committees an admin assigned to them; adds and removes sheikhs there.
// - sheikh: every other user; sees only the committees and ceremonies they were assigned to.

export const ROLES = ['super_admin', 'admin', 'committee_head', 'sheikh'] as const;
export type Role = (typeof ROLES)[number];

/** Roles that see every committee and the whole system. */
export const ADMIN_ROLES: readonly Role[] = ['super_admin', 'admin'];
export const isAdminRole = (role: Role) => ADMIN_ROLES.includes(role);

/** Extra rights an admin may give a committee head (admins have all of them implicitly). */
export const SYSTEM_PERMISSIONS = [
  'database_sheets',
  'manage_committees',
  'add_new_committee',
  'exams_pdf',
  'manage_courses',
  'calendar_schedule',
  'progress_stats',
  'manage_assistants',
] as const;

export interface ActionRule {
  /** Roles that may ever perform the action (super_admin always may; admin unless superOnly). */
  roles?: readonly Role[];
  /** Only a super admin may perform it. */
  superOnly?: boolean;
  /** Committee heads need at least one of these permissions... */
  anyPermission?: readonly string[];
  /** ...unless their role is listed here (the role itself implies the right). */
  grantedToRoles?: readonly Role[];
  /** Scoped roles (committee head, sheikh) may act only on their assigned committees. */
  committeeScoped?: boolean;
  description: string;
}

const EVERYONE: readonly Role[] = ROLES;
const MANAGERS: readonly Role[] = ['super_admin', 'admin', 'committee_head'];
const HEADS: readonly Role[] = ['committee_head'];

export const ACTIONS = {
  'committees.read': { roles: EVERYONE, description: 'عرض اللجان (الشيخ ورئيس اللجنة يريان لجانهما وحفلاتهما فقط)' },
  // «إضافة لجنة جديدة» decides it for committee heads (migration 019 kept it for existing heads).
  'committees.create': { roles: MANAGERS, anyPermission: ['add_new_committee'], description: 'إضافة لجنة' },
  'committees.update': { roles: MANAGERS, grantedToRoles: HEADS, committeeScoped: true, description: 'تعديل بيانات اللجنة' },
  'committees.delete': { roles: MANAGERS, anyPermission: ['manage_committees'], committeeScoped: true, description: 'حذف لجنة' },
  'committees.members': { roles: MANAGERS, grantedToRoles: HEADS, committeeScoped: true, description: 'إضافة الشيوخ للجنة وإزالتهم' },
  'committees.reception': {
    roles: MANAGERS,
    grantedToRoles: HEADS,
    committeeScoped: true,
    description: 'توثيق استلام اللجنة واعتماد جاهزية الامتحان (مرحلتا التسجيل والامتحان)',
  },
  'committees.scoring': { roles: MANAGERS, grantedToRoles: HEADS, committeeScoped: true, description: 'التصحيح وتجميع الدرجات والمراجعة' },
  'committees.finalize': {
    roles: MANAGERS,
    grantedToRoles: HEADS,
    committeeScoped: true,
    description: 'كتابة الكشف والاعتماد وإعلان النتيجة والحفل ودعوة الشيوخ للحفل',
  },
  'courses.read': { roles: EVERYONE, description: 'عرض الدورات' },
  'courses.write': { roles: MANAGERS, anyPermission: ['manage_courses'], description: 'إضافة وتعديل وحذف الدورات' },
  // Whoever holds «الامتحانات ونماذج الـ PDF» (any role) sees and downloads the exams chosen for
  // them, at any time (see canAccessExam); committee heads have the same per-exam allow-list.
  'exams.read': { roles: EVERYONE, anyPermission: ['exams_pdf'], grantedToRoles: HEADS, description: 'عرض بيانات الامتحانات' },
  'exams.write': { roles: MANAGERS, anyPermission: ['exams_pdf'], description: 'إضافة وتعديل الامتحانات ورفع الملفات' },
  'exams.delete': { roles: ADMIN_ROLES, description: 'حذف الامتحانات' },
  'exams.file': { roles: EVERYONE, anyPermission: ['exams_pdf'], grantedToRoles: HEADS, description: 'تنزيل ملف أسئلة الامتحان' },
  // Who may give or end an extra «مراقب» assignment on a committee: admins anywhere, a head only on their own.
  'assignments.manage': { roles: MANAGERS, grantedToRoles: HEADS, committeeScoped: true, description: 'تكليف شيخ بمراقبة امتحان أو متابعة حفل في لجنة وإنهاء التكليف' },
  'tasks.read': { roles: EVERYONE, description: 'عرض المهام (الشيخ يرى مهامه ومهام لجانه فقط)' },
  // «الجدول الزمني» decides it for committee heads (migration 019 kept it for existing heads).
  'tasks.write': { roles: MANAGERS, anyPermission: ['calendar_schedule'], description: 'إضافة وتعديل المهام' },
  'tasks.delete': { roles: MANAGERS, anyPermission: ['calendar_schedule'], description: 'حذف المهام' },
  'users.read': { roles: MANAGERS, grantedToRoles: HEADS, description: 'عرض الشيوخ' },
  'users.manage': { roles: MANAGERS, anyPermission: ['manage_assistants'], description: 'قبول ورفض طلبات الانضمام وتعديل بيانات الشيوخ' },
  'users.delete': { roles: ADMIN_ROLES, description: 'حذف المستخدمين' },
  'users.grant': { roles: ADMIN_ROLES, description: 'تعيين الأدوار والصلاحيات وإسناد اللجان' },
  'users.admins': { superOnly: true, description: 'عرض وإدارة حسابات الأدمن والمشرفين العامين' },
  'profiles.read': { roles: ADMIN_ROLES, description: 'عرض بروفايلات الصلاحيات' },
  'profiles.write': { roles: ADMIN_ROLES, description: 'تعديل بروفايلات الصلاحيات والصلاحيات المخصصة' },
  'books.read': { roles: EVERYONE, description: 'عرض الكتب المقررة' },
  'books.write': {
    roles: MANAGERS,
    anyPermission: ['manage_courses', 'add_new_committee', 'exams_pdf'],
    description: 'إضافة وحذف الكتب المقررة',
  },
  'summerRows.read': { roles: MANAGERS, anyPermission: ['database_sheets', 'manage_committees'], description: 'عرض كشف الدورة' },
  'summerRows.write': { roles: MANAGERS, anyPermission: ['database_sheets', 'manage_committees'], description: 'تعديل كشف الدورة' },
  'scoring.read': { roles: MANAGERS, grantedToRoles: HEADS, committeeScoped: true, description: 'عرض رصد الدرجات' },
  'scoring.write': { roles: MANAGERS, grantedToRoles: HEADS, committeeScoped: true, description: 'رصد درجات الطلاب' },
  'settings.write': { roles: ADMIN_ROLES, description: 'تعديل إعدادات النظام (موعد فتح الامتحانات، المراقبون، الخط، مدة التأخير)' },
  'notifications.create': { roles: ADMIN_ROLES, description: 'إرسال تنبيه عام' },
  'audit.read': { superOnly: true, description: 'عرض سجلات التدقيق' },
  // Statistics are computed in the clients from data the user may read; this action decides who sees the screen.
  'stats.read': { roles: MANAGERS, anyPermission: ['progress_stats'], description: 'الإحصائيات' },
  'database.admin': { superOnly: true, description: 'حالة قاعدة البيانات' },
  'database.backup': { roles: ADMIN_ROLES, description: 'تنزيل نسخة احتياطية كاملة من قاعدة البيانات' },
  'ocr.use': { roles: MANAGERS, anyPermission: ['database_sheets'], description: 'استخراج جدول من صورة' },
} satisfies Record<string, ActionRule>;

export type Action = keyof typeof ACTIONS;

export interface Principal {
  id: string;
  name: string;
  role: Role;
  permissions: string[];
  /** Committees (by id) a committee head heads or a sheikh sits on. */
  assignedCommitteeIds: string[];
  /** Scoped user granted every committee (set only by an admin). */
  allCommittees: boolean;
  /** Committee numbers of the assigned committees; informational, kept for older clients. */
  assignedCommittees: number[];
  /** Exam access for roles that may download exam files. */
  allExams: boolean;
  allowedExamIds: string[];
  /** Set after an admin password reset; only account endpoints work until it is cleared. */
  mustChangePassword: boolean;
  /**
   * Active extra assignments («مراقب») on other committees: read-only powers limited to that committee
   * and task, added on top of the role. Absent means none.
   */
  observing?: ObservedAssignment[];
  /**
   * Active temporary head grants inside their dates (see grants.ts). While one applies, the sheikh acts as the
   * committee head on that committee only. Absent means none.
   */
  headGrants?: HeadGrant[];
}

export interface HeadGrant {
  id: string;
  committeeId: string;
  /** What the grant's ceremony decision says now (drives whether it lasts past its end date). */
  decision: 'yes' | 'no' | 'undecided';
}

export interface ObservedAssignment {
  id: string;
  committeeId: string;
  task: 'exam' | 'ceremony';
  /** The committee's book: the exam paper of that book is the one an exam observer may open. */
  book: string;
}

/** Roles whose committee actions are limited to their assigned committees. */
export const SCOPED_ROLES: readonly Role[] = ['committee_head', 'sheikh'];
export const isScopedRole = (role: Role) => SCOPED_ROLES.includes(role);

/** Whether `user` may perform `action` at all (committee scope is checked separately). */
export function isAllowed(user: Pick<Principal, 'role' | 'permissions'> & { headGrants?: HeadGrant[] }, action: Action): boolean {
  if (user.role === 'super_admin') return true;
  const rule: ActionRule = ACTIONS[action];
  if (rule.superOnly) return false;
  // A temporary head may do the head's committee actions, but only on the committees of their grant
  // (isCommitteeInScope checks that for committee-scoped actions). Checked before the role list, since a sheikh
  // is not in it.
  if (rule.committeeScoped && rule.grantedToRoles?.includes('committee_head') && (user.headGrants?.length ?? 0) > 0) return true;
  if (rule.roles && !rule.roles.includes(user.role)) return false;
  if (user.role === 'admin') return true;
  if (rule.grantedToRoles?.includes(user.role)) return true;
  if (rule.anyPermission && !rule.anyPermission.some((p) => user.permissions.includes(p))) return false;
  return true;
}

/**
 * Committee scope: committee heads and sheikhs act only on committees assigned to them (by
 * committee id), unless an admin granted them all committees.
 */
export function isCommitteeInScope(user: Principal, committeeId: string | null | undefined): boolean {
  if (!isScopedRole(user.role)) return true;
  if (user.allCommittees) return true;
  if (!committeeId) return false;
  return user.assignedCommitteeIds.includes(committeeId) || grantedHeadCommitteeIds(user).includes(committeeId);
}

/** Committees on which the user holds a temporary head grant right now. */
export const grantedHeadCommitteeIds = (user: Pick<Principal, 'headGrants'>): string[] =>
  [...new Set((user.headGrants ?? []).map((g) => g.committeeId))];

/** Whether the user acts as the committee head on this committee: the role, or a grant on it. */
export const isHeadOn = (user: Principal, committeeId: string): boolean =>
  (user.role === 'committee_head' && user.assignedCommitteeIds.includes(committeeId)) ||
  grantedHeadCommitteeIds(user).includes(committeeId);

/** Committees the user observes through an active assignment (read-only, on top of the role). */
export const observedCommitteeIds = (user: Pick<Principal, 'observing'>): string[] =>
  [...new Set((user.observing ?? []).map((o) => o.committeeId))];

/** Whether the user observes this committee, optionally for a given kind of task. */
export const isObserving = (user: Pick<Principal, 'observing'>, committeeId: string, task?: ObservedAssignment['task']) =>
  (user.observing ?? []).some((o) => o.committeeId === committeeId && (!task || o.task === task));

/** Whether the user observes an exam of this book (the paper of the committee they were sent to). */
export const observesExamBook = (user: Pick<Principal, 'observing'>, book: string | null | undefined) =>
  Boolean(book?.trim()) && (user.observing ?? []).some((o) => o.task === 'exam' && o.book.trim() === book!.trim());

/** Whether the user observes any exam at all (opens the exams screen/list for them). */
export const observesAnyExam = (user: Pick<Principal, 'observing'>) => (user.observing ?? []).some((o) => o.task === 'exam');

/** Whether the user sees every committee (otherwise only assigned ones and ceremonies they are invited to). */
export const seesAllCommittees = (user: Principal) => !isScopedRole(user.role) || user.allCommittees;

/** The committee ids a scoped user sees: their assignments plus the committees of their active head grants. */
export const visibleCommitteeIds = (user: Principal): string[] => [...new Set([...user.assignedCommitteeIds, ...grantedHeadCommitteeIds(user)])];

/** Roles a user may give to other accounts. Admin accounts are managed by super admins only. */
export function grantableRoles(user: Pick<Principal, 'role' | 'permissions'>): Role[] {
  if (user.role === 'super_admin') return [...ROLES];
  if (isAllowed(user, 'users.grant')) return ['committee_head', 'sheikh'];
  return ['sheikh'];
}

/** Whether `actor` may see or manage an account with `targetRole` (admins are hidden from admins). */
export const canSeeRole = (actor: Pick<Principal, 'role' | 'permissions'>, targetRole: string) =>
  isAllowed(actor, 'users.admins') || !ADMIN_ROLES.includes(targetRole as Role);

/** Admins and people granted all exams open every exam. */
export const seesAllExams = (user: Pick<Principal, 'role' | 'allExams'>) => isAdminRole(user.role) || user.allExams;

/**
 * Everyone else opens only the exams chosen for them (per-user allow-list), whatever the
 * committees' dates or stages.
 */
export function canAccessExam(user: Principal, examId: string, book?: string | null): boolean {
  // An observer sent to a committee for its exam opens that book's paper, and only that one.
  if (observesExamBook(user, book)) return true;
  if (!isAllowed(user, 'exams.file')) return false;
  if (seesAllExams(user)) return true;
  return user.allowedExamIds.includes(examId);
}

/** Only system permissions grant anything; custom permission labels are display-only tags. */
export const isSystemPermission = (p: string): p is (typeof SYSTEM_PERMISSIONS)[number] =>
  (SYSTEM_PERMISSIONS as readonly string[]).includes(p);

export function evaluatedPermissions(user: Principal) {
  const actions: Record<string, boolean> = {};
  for (const a of Object.keys(ACTIONS) as Action[]) actions[a] = isAllowed(user, a);
  const scoped = !seesAllCommittees(user);
  return {
    role: user.role,
    actions,
    // 'all' or the committee ids in scope.
    committeeScope: scoped ? visibleCommitteeIds(user) : ('all' as const),
    // Same scope as committee numbers, for clients that predate committee ids.
    committeeNumbers: scoped ? user.assignedCommittees : ('all' as const),
    exams: seesAllExams(user) ? ('all' as const) : user.allowedExamIds,
    grantableRoles: grantableRoles(user),
    // Extra assignments (read-only powers on other committees), so clients can show and mirror them.
    observing: (user.observing ?? []).map((o) => ({ id: o.id, committeeId: o.committeeId, task: o.task })),
    // Committees this person heads by a temporary grant right now (the head's screens and tabs follow).
    headCommitteeIds: grantedHeadCommitteeIds(user),
    mustChangePassword: user.mustChangePassword,
  };
}
