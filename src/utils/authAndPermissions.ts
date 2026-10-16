import { AppUser, UserRole } from '../types';

export const AUTH_STORAGE_KEY = 'bukhari_auth_session_user';
export const AUTH_TOKEN_KEY = 'bukhari_auth_session_token';

export interface DatabaseStatus {
  status: 'connected' | 'reconnecting' | 'offline';
  engine: string;
  connectionPool: string;
  latencyMs: number;
  uptimeSeconds: number;
  timestamp: string;
  tables: Array<{ name: string; count: number; status: string }>;
  encryption: string;
  backupStatus: string;
}

export const FALLBACK_DB_STATUS: DatabaseStatus = {
  status: 'offline',
  engine: 'Supabase PostgreSQL Cloud Engine',
  connectionPool: 'غير متصل',
  latencyMs: 0,
  uptimeSeconds: 0,
  timestamp: new Date().toISOString(),
  tables: [],
  encryption: 'TLS 1.3 / SSL Verified',
  backupStatus: 'يتطلب الاتصال بسوبابيز',
};

/**
 * Fetch database connection status from server, querying live Supabase
 */
export async function fetchDatabaseStatus(): Promise<DatabaseStatus> {
  try {
    const res = await fetch('/api/database/status', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      return {
        ...FALLBACK_DB_STATUS,
        ...data,
      };
    }
  } catch (err) {
    // Offline status
  }
  return FALLBACK_DB_STATUS;
}

/**
 * Role-Based Access Control (RBAC) Permissions Helper
 */
export const PermissionsService = {
  isSuperAdmin(user: AppUser | null): boolean {
    return user?.role === 'super_admin';
  },

  isCommitteeHead(user: AppUser | null): boolean {
    return user?.role === 'committee_head' || user?.role === 'super_admin';
  },

  isTeacher(user: AppUser | null): boolean {
    return user?.role === 'teacher' || user?.role === 'committee_head' || user?.role === 'super_admin';
  },

  isAuditor(user: AppUser | null): boolean {
    return user?.role === 'auditor';
  },

  canAddCommittee(user: AppUser | null): boolean {
    if (!user) return false;
    return user.role === 'super_admin';
  },

  canDeleteCommittee(user: AppUser | null): boolean {
    if (!user) return false;
    return user.role === 'super_admin';
  },

  canEditCommitteeDetails(user: AppUser | null, committeeNumber?: number): boolean {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    if (user.role === 'auditor') return false;
    if (committeeNumber && user.assignedCommittees.includes(committeeNumber)) return true;
    return user.role === 'committee_head';
  },

  canAddExam(user: AppUser | null): boolean {
    if (!user) return false;
    return user.role === 'super_admin' || user.role === 'committee_head' || user.role === 'teacher';
  },

  canAddCourse(user: AppUser | null): boolean {
    if (!user) return false;
    return user.role === 'super_admin';
  },

  canReceiveCommittee(user: AppUser | null, committeeNumber?: number): boolean {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    if (user.role === 'auditor') return false;
    if (committeeNumber && !user.assignedCommittees.includes(committeeNumber) && user.assignedCommittees.length > 0) {
      // If user has specific assigned committees and this isn't one of them
      return false;
    }
    return user.permissions.includes('receive_committee');
  },

  canApproveExam(user: AppUser | null, committeeNumber?: number): boolean {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    if (user.role === 'auditor') return false;
    if (committeeNumber && !user.assignedCommittees.includes(committeeNumber) && user.assignedCommittees.length > 0) {
      return false;
    }
    return user.permissions.includes('approve_exam') || user.role === 'committee_head';
  },

  canEnterScores(user: AppUser | null): boolean {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    if (user.role === 'auditor') return false;
    return user.permissions.includes('enter_scores') || user.role === 'teacher' || user.role === 'committee_head';
  },

  canVerifySheets(user: AppUser | null): boolean {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    if (user.role === 'auditor') return false; // auditor can view sheets, not certify them
    return user.permissions.includes('verify_sheets') || user.role === 'committee_head';
  },

  canManageUsers(user: AppUser | null): boolean {
    if (!user) return false;
    return user.role === 'super_admin';
  },

  canExportData(user: AppUser | null): boolean {
    if (!user) return false;
    return true; // All authenticated users can view/export summaries
  },

  getRoleLabel(role: UserRole): string {
    switch (role) {
      case 'super_admin':
        return 'المشرف العام (مدير النظام)';
      case 'committee_head':
        return 'رئيس لجنة واختبارات (معلم)';
      case 'teacher':
        return 'معلم ومقرئ معتمد';
      case 'assistant':
        return 'معاون ميداني معتمد';
      case 'auditor':
        return 'مراجع ومدقق جودة (رقابي)';
      default:
        return 'مستخدم النظام';
    }
  },

  getRoleBadgeColor(role: UserRole): string {
    switch (role) {
      case 'super_admin':
        return 'bg-emerald-700 text-white';
      case 'committee_head':
        return 'bg-blue-700 text-white';
      case 'teacher':
        return 'bg-indigo-700 text-white';
      case 'assistant':
        return 'bg-amber-600 text-white';
      case 'auditor':
        return 'bg-purple-700 text-white';
      default:
        return 'bg-slate-600 text-white';
    }
  },
};

/**
 * Session storage helpers
 */
export function getSavedSessionUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to get saved session user', e);
  }
  return null;
}

export function saveSessionUser(user: AppUser | null): void {
  try {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      localStorage.setItem(AUTH_TOKEN_KEY, `bukhari_token_${user.id}_${Date.now()}`);
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch (e) {
    console.error('Failed to save session user', e);
  }
}

export function clearSessionUser(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (e) {
    console.error('Failed to clear session', e);
  }
}
