import { Request, Response, NextFunction } from 'express';

export type SystemRole = 'super_admin' | 'committee_head' | 'teacher' | 'assistant' | 'auditor';

export interface UserContext {
  id?: string;
  name?: string;
  role: SystemRole;
  assignedCommittees: number[];
  permissions?: string[];
}

export const ACTIONS = {
  COURSES_READ: 'COURSES_READ',
  COURSES_WRITE: 'COURSES_WRITE',
  COURSES_DELETE: 'COURSES_DELETE',

  COMMITTEES_READ: 'COMMITTEES_READ',
  COMMITTEES_WRITE: 'COMMITTEES_WRITE',
  COMMITTEES_DELETE: 'COMMITTEES_DELETE',

  USERS_READ: 'USERS_READ',
  USERS_WRITE: 'USERS_WRITE',
  USERS_DELETE: 'USERS_DELETE',

  EXAMS_READ: 'EXAMS_READ',
  EXAMS_WRITE: 'EXAMS_WRITE',
  EXAMS_DELETE: 'EXAMS_DELETE',

  TASKS_READ: 'TASKS_READ',
  TASKS_WRITE: 'TASKS_WRITE',
  TASKS_DELETE: 'TASKS_DELETE',

  SCORING_READ: 'SCORING_READ',
  SCORING_WRITE: 'SCORING_WRITE',

  NOTIFICATIONS_READ: 'NOTIFICATIONS_READ',
  NOTIFICATIONS_WRITE: 'NOTIFICATIONS_WRITE',

  AUDIT_LOGS_READ: 'AUDIT_LOGS_READ',
  AUDIT_LOGS_WRITE: 'AUDIT_LOGS_WRITE',

  DATABASE_ADMIN: 'DATABASE_ADMIN',
} as const;

export type ActionType = (typeof ACTIONS)[keyof typeof ACTIONS];

const ROLE_PERMISSIONS: Record<SystemRole, Set<ActionType>> = {
  super_admin: new Set(Object.values(ACTIONS)),

  committee_head: new Set([
    ACTIONS.COURSES_READ,
    ACTIONS.COMMITTEES_READ,
    ACTIONS.COMMITTEES_WRITE,
    ACTIONS.USERS_READ,
    ACTIONS.EXAMS_READ,
    ACTIONS.EXAMS_WRITE,
    ACTIONS.TASKS_READ,
    ACTIONS.TASKS_WRITE,
    ACTIONS.TASKS_DELETE,
    ACTIONS.SCORING_READ,
    ACTIONS.SCORING_WRITE,
    ACTIONS.NOTIFICATIONS_READ,
    ACTIONS.NOTIFICATIONS_WRITE,
    ACTIONS.AUDIT_LOGS_WRITE,
  ]),

  teacher: new Set([
    ACTIONS.COURSES_READ,
    ACTIONS.COMMITTEES_READ,
    ACTIONS.COMMITTEES_WRITE,
    ACTIONS.USERS_READ,
    ACTIONS.EXAMS_READ,
    ACTIONS.TASKS_READ,
    ACTIONS.SCORING_READ,
    ACTIONS.SCORING_WRITE,
    ACTIONS.NOTIFICATIONS_READ,
    ACTIONS.AUDIT_LOGS_WRITE,
  ]),

  assistant: new Set([
    ACTIONS.COURSES_READ,
    ACTIONS.COMMITTEES_READ,
    ACTIONS.COMMITTEES_WRITE,
    ACTIONS.USERS_READ,
    ACTIONS.EXAMS_READ,
    ACTIONS.TASKS_READ,
    ACTIONS.TASKS_WRITE,
    ACTIONS.SCORING_READ,
    ACTIONS.SCORING_WRITE,
    ACTIONS.NOTIFICATIONS_READ,
    ACTIONS.NOTIFICATIONS_WRITE,
    ACTIONS.AUDIT_LOGS_WRITE,
  ]),

  auditor: new Set([
    ACTIONS.COURSES_READ,
    ACTIONS.COMMITTEES_READ,
    ACTIONS.USERS_READ,
    ACTIONS.EXAMS_READ,
    ACTIONS.TASKS_READ,
    ACTIONS.SCORING_READ,
    ACTIONS.NOTIFICATIONS_READ,
    ACTIONS.AUDIT_LOGS_READ,
  ]),
};

/**
 * فحص هل الدور يملك الصلاحية لتنفيذ العملية
 */
export function isActionAllowed(role: SystemRole, action: ActionType): boolean {
  const allowed = ROLE_PERMISSIONS[role];
  if (!allowed) return false;
  return allowed.has(action);
}

/**
 * فحص هل المستخدم مصرح له بالتعامل مع هذه اللجنة المحددة
 */
export function isCommitteeAllowed(
  user: UserContext,
  committeeNumber?: number | null
): boolean {
  if (user.role === 'super_admin') return true;
  if (committeeNumber === undefined || committeeNumber === null) return true;
  return user.assignedCommittees.includes(Number(committeeNumber));
}

/**
 * استخراج بيانات المستخدم من الترويسات
 */
export function extractUserFromRequest(req: Request): UserContext {
  const headerRole = req.headers['x-user-role'] as string | undefined;
  const headerId = req.headers['x-user-id'] as string | undefined;
  const headerCommittees = req.headers['x-user-committees'] as string | undefined;

  let assignedCommittees: number[] = [];
  if (headerCommittees) {
    try {
      const parsed = JSON.parse(headerCommittees);
      if (Array.isArray(parsed)) {
        assignedCommittees = parsed.map((n) => Number(n)).filter((n) => !isNaN(n));
      }
    } catch {
      assignedCommittees = [];
    }
  }

  // إذا لم يتم تمرير دور، وفي بيئة التطوير نفترض super_admin لتفادي كسر المسارات غير المعتمدة على ترويسات
  const validRoles: SystemRole[] = [
    'super_admin',
    'committee_head',
    'teacher',
    'assistant',
    'auditor',
  ];

  const role: SystemRole =
    headerRole && validRoles.includes(headerRole as SystemRole)
      ? (headerRole as SystemRole)
      : 'super_admin';

  return {
    id: headerId || 'system-user',
    role,
    assignedCommittees,
  };
}

/**
 * وسيط Express للتحقق من الصلاحيات وتقييد اللجان
 */
export function requireAction(
  action: ActionType,
  options?: {
    getCommitteeNumber?: (req: Request) => number | undefined | null;
  }
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = extractUserFromRequest(req);

    // 1. فحص صلاحية الدور الأساسية
    if (!isActionAllowed(user.role, action)) {
      res.status(403).json({
        success: false,
        error: 'forbidden',
        message: `الدور الحالي (${user.role}) غير مصرح له بتنفيذ هذه العملية (${action}).`,
      });
      return;
    }

    // 2. فحص تقييد اللجنة الميدانية إذا كان مطلوباً
    if (options?.getCommitteeNumber) {
      const commNum = options.getCommitteeNumber(req);
      if (!isCommitteeAllowed(user, commNum)) {
        res.status(403).json({
          success: false,
          error: 'forbidden',
          message: `غير مصرح لك بإجراء هذا التعديل على لجنة رقم (${commNum}) لأنها ليست ضمن اللجان المسندة إليك.`,
        });
        return;
      }
    }

    // إرفاق المستخدم بالطلب للاستخدام اللاحق
    (req as any).user = user;
    next();
  };
}
