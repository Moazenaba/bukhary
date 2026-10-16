// Single source of truth for who may do what. The server enforces it, and
// GET /api/me/permissions returns the evaluated result so web and mobile show
// exactly the actions the server will accept.

export const ROLES = ['super_admin', 'committee_head', 'teacher', 'assistant', 'auditor'] as const;
export type Role = (typeof ROLES)[number];

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
  /** Roles that may ever perform the action (super_admin always may). */
  roles?: readonly Role[];
  /** The user needs at least one of these permissions... */
  anyPermission?: readonly string[];
  /** ...unless their role is listed here (the role itself implies the right). */
  grantedToRoles?: readonly Role[];
  /** Read-only actions are the only ones an auditor may perform. */
  readOnly?: boolean;
  /** Non-admin committee_head/assistant may act only on their assigned committees. */
  committeeScoped?: boolean;
  description: string;
}

const MANAGERS: readonly Role[] = ['super_admin', 'committee_head'];

export const ACTIONS = {
  'committees.read': { readOnly: true, description: 'عرض اللجان' },
  'committees.create': { roles: MANAGERS, anyPermission: ['add_new_committee'], description: 'إضافة لجنة' },
  'committees.update': { roles: MANAGERS, anyPermission: ['manage_committees'], committeeScoped: true, description: 'تعديل بيانات اللجنة' },
  'committees.delete': { roles: MANAGERS, anyPermission: ['manage_committees'], committeeScoped: true, description: 'حذف لجنة' },
  'committees.reception': {
    roles: ['super_admin', 'committee_head', 'assistant'],
    anyPermission: ['manage_committees'],
    grantedToRoles: ['assistant'],
    committeeScoped: true,
    description: 'توثيق استلام اللجنة واعتماد جاهزية الامتحان (مرحلتا التسجيل والامتحان)',
  },
  'committees.scoring': {
    roles: ['super_admin', 'committee_head', 'teacher'],
    anyPermission: ['manage_committees'],
    grantedToRoles: ['teacher'],
    committeeScoped: true,
    description: 'التصحيح وتجميع الدرجات والمراجعة',
  },
  'committees.finalize': {
    roles: MANAGERS,
    anyPermission: ['manage_committees'],
    committeeScoped: true,
    description: 'كتابة الكشف والاعتماد وإعلان النتيجة والحفل',
  },
  'courses.read': { readOnly: true, description: 'عرض الدورات' },
  'courses.write': { roles: MANAGERS, anyPermission: ['manage_courses'], description: 'إضافة وتعديل وحذف الدورات' },
  'exams.read': { readOnly: true, description: 'عرض بيانات الامتحانات' },
  'exams.write': { roles: MANAGERS, anyPermission: ['exams_pdf'], description: 'إضافة وتعديل الامتحانات ورفع الملفات' },
  'exams.delete': { roles: ['super_admin'], description: 'حذف الامتحانات' },
  'exams.file': { roles: MANAGERS, description: 'تنزيل ملف أسئلة الامتحان' },
  'tasks.read': { readOnly: true, description: 'عرض المهام' },
  'tasks.write': {
    roles: ['super_admin', 'committee_head', 'teacher', 'assistant'],
    anyPermission: ['calendar_schedule'],
    description: 'إضافة وتعديل المهام',
  },
  'tasks.delete': { roles: MANAGERS, anyPermission: ['calendar_schedule'], description: 'حذف المهام' },
  'users.read': { roles: MANAGERS, anyPermission: ['manage_assistants'], description: 'عرض المستخدمين' },
  'users.manage': { roles: MANAGERS, anyPermission: ['manage_assistants'], description: 'قبول ورفض المعاونين وتعديل لجانهم' },
  'users.delete': { roles: ['super_admin'], description: 'حذف المستخدمين' },
  'users.grant': { roles: ['super_admin'], description: 'تعيين الأدوار والصلاحيات' },
  'profiles.read': { roles: MANAGERS, anyPermission: ['manage_assistants'], description: 'عرض بروفايلات الصلاحيات' },
  'profiles.write': { roles: ['super_admin'], description: 'تعديل بروفايلات الصلاحيات والصلاحيات المخصصة' },
  'books.read': { readOnly: true, description: 'عرض الكتب المقررة' },
  'books.write': {
    roles: MANAGERS,
    anyPermission: ['manage_courses', 'add_new_committee', 'exams_pdf'],
    description: 'إضافة وحذف الكتب المقررة',
  },
  'summerRows.read': { readOnly: true, description: 'عرض كشف الدورة' },
  'summerRows.write': {
    roles: MANAGERS,
    anyPermission: ['database_sheets', 'manage_committees'],
    description: 'تعديل كشف الدورة',
  },
  'scoring.read': { roles: ['super_admin', 'committee_head', 'teacher', 'auditor'], readOnly: true, description: 'عرض رصد الدرجات' },
  'scoring.write': {
    roles: ['super_admin', 'committee_head', 'teacher'],
    anyPermission: ['manage_committees'],
    grantedToRoles: ['teacher'],
    committeeScoped: true,
    description: 'رصد درجات الطلاب',
  },
  'notifications.create': { roles: ['super_admin'], description: 'إرسال تنبيه عام' },
  'audit.read': { roles: ['super_admin', 'auditor'], readOnly: true, description: 'عرض سجلات التدقيق' },
  'stats.read': { readOnly: true, anyPermission: ['progress_stats'], grantedToRoles: ['auditor', 'committee_head'], description: 'الإحصائيات' },
  'database.admin': { roles: ['super_admin'], description: 'حالة قاعدة البيانات' },
  'ocr.use': { roles: MANAGERS, anyPermission: ['database_sheets'], description: 'استخراج جدول من صورة' },
} satisfies Record<string, ActionRule>;

export type Action = keyof typeof ACTIONS;

export interface Principal {
  id: string;
  name: string;
  role: Role;
  permissions: string[];
  assignedCommittees: number[];
}

/** Whether `user` may perform `action` at all (committee scope is checked separately). */
export function isAllowed(user: Principal, action: Action): boolean {
  if (user.role === 'super_admin') return true;
  const rule: ActionRule = ACTIONS[action];
  if (user.role === 'auditor' && !rule.readOnly) return false;
  if (rule.roles && !rule.roles.includes(user.role)) return false;
  if (rule.grantedToRoles?.includes(user.role)) return true;
  if (rule.anyPermission && !rule.anyPermission.some((p) => user.permissions.includes(p))) return false;
  return true;
}

/** Committee-scope rule from the business decision: heads and assistants act only on assigned committees. */
export function isCommitteeInScope(user: Principal, committeeNumber: number | null | undefined): boolean {
  if (user.role !== 'committee_head' && user.role !== 'assistant') return true;
  if (committeeNumber === null || committeeNumber === undefined) return false;
  return user.assignedCommittees.includes(Number(committeeNumber));
}

export function evaluatedPermissions(user: Principal) {
  const actions: Record<string, boolean> = {};
  for (const a of Object.keys(ACTIONS) as Action[]) actions[a] = isAllowed(user, a);
  const scoped = user.role === 'committee_head' || user.role === 'assistant';
  return { role: user.role, actions, committeeScope: scoped ? user.assignedCommittees : 'all' as const };
}
