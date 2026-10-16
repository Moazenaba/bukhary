import { useState, useEffect } from 'react';
import { AppUser, UserRole, AssistantPermission, AssistantStatus, PermissionProfile } from '../types';
import { SupabaseService } from './SupabaseService';
import { INITIAL_PERMISSION_PROFILES } from '../data/initialPermissionProfiles';

export const AUTH_STORAGE_KEY = 'bukhari_auth_session_user';
export const AUTH_TOKEN_KEY = 'bukhari_auth_session_token';
export const USERS_STORAGE_KEY = 'bukhari_users_v2';
export const PROFILES_STORAGE_KEY = 'bukhari_permission_profiles_v1';

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
  backupStatus: 'يتطلب الاتصال بقاعدة بيانات سوبابيز',
};

class AuthServiceClass {
  private currentUser: AppUser | null = null;
  private users: AppUser[] = [];
  private profiles: PermissionProfile[] = [];
  private listeners: Set<() => void> = new Set();
  private initialized: boolean = false;

  constructor() {
    this.init();
  }

  public async init(): Promise<void> {
    if (this.initialized) return;

    // 1. First load from local storage cache if available
    try {
      const rawUsers = localStorage.getItem(USERS_STORAGE_KEY);
      if (rawUsers) {
        this.users = JSON.parse(rawUsers);
      }
    } catch (e) {
      console.error('Failed to load cached users in AuthService', e);
    }

    // Load permission profiles
    try {
      const rawProfiles = localStorage.getItem(PROFILES_STORAGE_KEY);
      if (rawProfiles) {
        this.profiles = JSON.parse(rawProfiles);
      } else {
        this.profiles = INITIAL_PERMISSION_PROFILES;
        this.saveProfiles();
      }
    } catch (e) {
      this.profiles = INITIAL_PERMISSION_PROFILES;
    }

    // 2. Load active session if exists
    try {
      const rawSession = localStorage.getItem(AUTH_STORAGE_KEY);
      if (rawSession) {
        const savedUser: AppUser = JSON.parse(rawSession);
        this.currentUser = savedUser;
      }
    } catch (e) {
      console.error('Failed to load auth session in AuthService', e);
      this.currentUser = null;
    }

    this.initialized = true;

    // 3. Immediately fetch live users directly from Supabase app_users table
    try {
      const dbUsers = await SupabaseService.getUsers();
      if (Array.isArray(dbUsers) && dbUsers.length > 0) {
        this.users = dbUsers;
        this.saveUsers();

        // Refresh current user session from live DB
        if (this.currentUser) {
          const matched = dbUsers.find((u) => u.id === this.currentUser?.id);
          if (matched && matched.status === 'approved') {
            this.currentUser = matched;
          } else if (!matched || matched.status === 'rejected') {
            this.clearSession();
          }
        }
        this.notify();
      }
    } catch (err) {
      console.warn('تعذر جلب المستخدمين مباشرة من سوبابيز:', err);
    }
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getCurrentUser(): AppUser | null {
    return this.currentUser;
  }

  public isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  public getUsers(): AppUser[] {
    return [...this.users];
  }

  private saveUsers(): void {
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(this.users));
    } catch (e) {
      console.error('Failed to persist users in AuthService', e);
    }
  }

  private saveSession(user: AppUser, rememberMe = true): void {
    try {
      this.currentUser = user;
      if (rememberMe) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
        localStorage.setItem(AUTH_TOKEN_KEY, `bukhari_session_${user.id}_${Date.now()}`);
      }
      this.notify();
    } catch (e) {
      console.error('Failed to save session in AuthService', e);
    }
  }

  private clearSession(): void {
    try {
      this.currentUser = null;
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
      this.notify();
    } catch (e) {
      console.error('Failed to clear session in AuthService', e);
    }
  }

  /**
   * Primary Login Method
   */
  public async login(
    emailOrPhone: string,
    passwordInput: string,
    rememberMe = true
  ): Promise<{ success: boolean; user?: AppUser; error?: string }> {
    const cleanInput = emailOrPhone.trim().toLowerCase();
    const cleanPass = passwordInput.trim();

    // 1. Direct Super Admin Match (admin / 504)
    if (
      (cleanInput === 'admin' ||
        cleanInput === 'admin@bukhari-mosque.com' ||
        cleanInput === 'أدمن' ||
        cleanInput === 'الادمن') &&
      cleanPass === '504'
    ) {
      let adminUser = this.users.find((u) => u.role === 'super_admin');
      if (!adminUser) {
        adminUser = this.users[0];
      }
      this.saveSession(adminUser, rememberMe);
      return { success: true, user: adminUser };
    }

    // 2. Match by email, phone, or name for other accounts
    const matchedUser = this.users.find(
      (u) =>
        u.email.toLowerCase() === cleanInput ||
        u.phone.trim() === cleanInput ||
        u.name.toLowerCase().includes(cleanInput)
    );

    if (!matchedUser) {
      return {
        success: false,
        error: 'بيانات الدخول غير صحيحة، لم يتم العثور على هذا الحساب في قاعدة البيانات.',
      };
    }

    if (matchedUser.password && matchedUser.password !== cleanPass) {
      return {
        success: false,
        error: 'كلمة المرور غير صحيحة، يرجى كتابة كلمة المرور الصحيحة لهذا الحساب.',
      };
    }

    if (matchedUser.status === 'rejected') {
      return {
        success: false,
        error: 'تم رفض طلب هذا الحساب من قبل إدارة المسجد.',
      };
    }

    // Seamless auto-activation for registered assistants upon correct password verification
    if (matchedUser.status === 'pending') {
      matchedUser.status = 'approved';
      if (!matchedUser.permissions || matchedUser.permissions.length === 0) {
        matchedUser.permissions = ['database_sheets', 'manage_committees', 'calendar_schedule'];
      }
      matchedUser.approvedAt = new Date().toLocaleDateString('ar-EG');
      this.saveUsers();
      this.notify();
    }

    this.saveSession(matchedUser, rememberMe);
    return { success: true, user: matchedUser };
  }

  /**
   * Fast Demo / Direct Switch Login
   */
  public quickLogin(user: AppUser, rememberMe = true): void {
    const verified = this.users.find((u) => u.id === user.id) || user;
    if (verified.status === 'pending') {
      verified.status = 'approved';
      if (!verified.permissions || verified.permissions.length === 0) {
        verified.permissions = ['database_sheets', 'manage_committees', 'calendar_schedule'];
      }
      this.saveUsers();
    }
    this.saveSession(verified, rememberMe);
  }

  /**
   * Logout - Completely terminates session and returns to Gateway
   */
  public logout(): void {
    this.clearSession();
  }

  /**
   * Register new user (staff or assistant) - instantly linked with assistants & permissions
   */
  public registerUser(newUserData: Partial<AppUser>): AppUser {
    const role: UserRole = newUserData.role || 'assistant';
    const status: AssistantStatus = newUserData.status || 'pending';
    const defaultPerms: AssistantPermission[] =
      newUserData.permissions && newUserData.permissions.length > 0
        ? newUserData.permissions
        : status === 'approved'
        ? ['database_sheets', 'manage_committees', 'calendar_schedule']
        : [];

    const requestCode =
      newUserData.requestCode ||
      `REQ-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newUser: AppUser = {
      ...newUserData,
      id: newUserData.id || `usr_${Date.now()}`,
      name: newUserData.name || 'معاون جديد',
      phone: newUserData.phone || '',
      whatsapp: newUserData.whatsapp || newUserData.phone || '',
      nationalId: newUserData.nationalId || '',
      passportNumber: newUserData.passportNumber || '',
      email: newUserData.email || `${Date.now()}@bukhari.org`,
      password: newUserData.password || '',
      role,
      status,
      assignedCommittees: newUserData.assignedCommittees || [],
      permissions: defaultPerms,
      createdAt: newUserData.createdAt || new Date().toLocaleDateString('ar-EG'),
      notes: newUserData.notes || 'طلب انضمام جديد مسجل عبر البوابة المركزية',
      requestCode,
      quranLevel: newUserData.quranLevel || '',
      qualification: newUserData.qualification || '',
      experience: newUserData.experience || '',
      availability: newUserData.availability || 'طوال فترة المسابقة',
      preferredCommittees: newUserData.preferredCommittees || [],
      interviewDate: newUserData.interviewDate,
      interviewNotes: newUserData.interviewNotes,
      rejectionReason: newUserData.rejectionReason,
      rejectedAt: newUserData.rejectedAt,
      rejectedBy: newUserData.rejectedBy,
    };

    this.users = [newUser, ...this.users];
    this.saveUsers();
    SupabaseService.saveUser(newUser).catch(console.error);
    this.notify();
    return newUser;
  }

  /**
   * Super Admin approves pending user and assigns their role, permissions, and committees
   */
  public approveUser(
    userId: string,
    permissions: AssistantPermission[],
    assignedCommittees: number[],
    role: UserRole = 'assistant'
  ): void {
    let targetUser: AppUser | undefined;
    this.users = this.users.map((u) => {
      if (u.id === userId) {
        targetUser = {
          ...u,
          role,
          status: 'approved',
          permissions,
          assignedCommittees,
          approvedAt: new Date().toLocaleDateString('ar-EG'),
          approvedBy: this.currentUser?.name || 'المشرف العام',
          rejectionReason: undefined,
          rejectedAt: undefined,
        };
        return targetUser;
      }
      return u;
    });

    this.saveUsers();
    if (targetUser) {
      SupabaseService.saveUser(targetUser).catch(console.error);
    }
    this.notify();
  }

  /**
   * Super Admin schedules an interview & trial exam for applicant
   */
  public scheduleInterview(
    userId: string,
    interviewDate: string,
    interviewNotes?: string
  ): void {
    let targetUser: AppUser | undefined;
    this.users = this.users.map((u) => {
      if (u.id === userId) {
        targetUser = {
          ...u,
          status: 'interview',
          interviewDate,
          interviewNotes:
            interviewNotes ||
            'تم تحديد موعد المقابلة الشخصية والاختبار التجريبي بمقر إدارة لجان المسجد.',
        };
        return targetUser;
      }
      return u;
    });

    this.saveUsers();
    if (targetUser) {
      SupabaseService.saveUser(targetUser).catch(console.error);
    }
    this.notify();
  }

  /**
   * Super Admin rejects / apologizes to applicant with formal reason
   */
  public rejectUser(userId: string, reason?: string): void {
    let targetUser: AppUser | undefined;
    this.users = this.users.map((u) => {
      if (u.id === userId) {
        targetUser = {
          ...u,
          status: 'rejected',
          rejectionReason:
            reason ||
            'نعتذر عن قبول الطلب حالياً لاكتمال النصاب المطلوب في لجان هذه الدورة، مع خالص التقدير والشكر.',
          rejectedAt: new Date().toLocaleDateString('ar-EG'),
          rejectedBy: this.currentUser?.name || 'المشرف العام',
        };
        return targetUser;
      }
      return u;
    });

    this.saveUsers();
    if (targetUser) {
      SupabaseService.saveUser(targetUser).catch(console.error);
    }
    this.notify();
  }

  /**
   * Track application by phone number, request code, or national ID
   */
  public trackJoinRequest(query: string): AppUser | null {
    const clean = query.trim().toLowerCase();
    if (!clean) return null;
    return (
      this.users.find(
        (u) =>
          u.phone.trim() === clean ||
          (u.requestCode && u.requestCode.toLowerCase() === clean) ||
          (u.nationalId && u.nationalId.trim() === clean) ||
          u.email.toLowerCase() === clean
      ) || null
    );
  }

  /**
   * Update User Profile & Permissions
   */
  public updateUser(updatedUser: AppUser): void {
    this.users = this.users.map((u) => (u.id === updatedUser.id ? updatedUser : u));
    if (this.currentUser?.id === updatedUser.id) {
      this.currentUser = updatedUser;
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedUser));
    }
    this.saveUsers();
    SupabaseService.saveUser(updatedUser).catch(console.error);
    this.notify();
  }

  /**
   * Delete User
   */
  public deleteUser(userId: string): void {
    this.users = this.users.filter((u) => u.id !== userId);
    this.saveUsers();
    SupabaseService.deleteUser(userId).catch(console.error);
    this.notify();
    if (this.currentUser?.id === userId) {
      this.clearSession();
    }
  }

  /**
   * Add direct pre-approved user
   */
  public addDirectUser(userData: Omit<AppUser, 'id' | 'createdAt'>): AppUser {
    const user: AppUser = {
      ...userData,
      id: `usr_${Date.now()}`,
      createdAt: new Date().toLocaleDateString('ar-EG'),
      status: 'approved',
    };
    this.users = [user, ...this.users];
    this.saveUsers();
    SupabaseService.saveUser(user).catch(console.error);
    this.notify();
    return user;
  }

  private saveProfiles(): void {
    try {
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(this.profiles));
    } catch (e) {
      console.error('Failed to persist permission profiles', e);
    }
  }

  public getProfiles(): PermissionProfile[] {
    return [...this.profiles];
  }

  public getProfileById(profileId: string): PermissionProfile | undefined {
    return this.profiles.find((p) => p.id === profileId);
  }

  public saveProfile(profileData: PermissionProfile): PermissionProfile {
    const existingIndex = this.profiles.findIndex((p) => p.id === profileData.id);
    let updatedProfile: PermissionProfile;
    if (existingIndex >= 0) {
      updatedProfile = {
        ...this.profiles[existingIndex],
        ...profileData,
      };
      this.profiles[existingIndex] = updatedProfile;
    } else {
      updatedProfile = {
        ...profileData,
        id: profileData.id || `profile_${Date.now()}`,
        createdAt: profileData.createdAt || new Date().toLocaleDateString('ar-EG'),
      };
      this.profiles = [updatedProfile, ...this.profiles];
    }
    this.saveProfiles();
    this.notify();
    return updatedProfile;
  }

  public deleteProfile(profileId: string): boolean {
    const target = this.profiles.find((p) => p.id === profileId);
    if (target?.isDefault) return false;
    this.profiles = this.profiles.filter((p) => p.id !== profileId);
    this.saveProfiles();
    this.notify();
    return true;
  }

  public assignProfileToUser(userId: string, profileId: string): void {
    const profile = this.getProfileById(profileId);
    if (!profile) return;
    this.users = this.users.map((u) => {
      if (u.id === userId) {
        const updatedUser: AppUser = {
          ...u,
          profileId,
          permissions: profile.permissions,
          assignedCommittees: profile.allCommitteesAllowed ? [] : profile.allowedCommittees,
          allCommitteesAllowed: profile.allCommitteesAllowed,
          allowedExamIds: profile.allowedExamIds,
          allExamsAllowed: profile.allExamsAllowed,
        };
        SupabaseService.saveUser(updatedUser).catch(console.error);
        return updatedUser;
      }
      return u;
    });
    this.saveUsers();
    this.notify();
  }

  public setSuperAdmin(userId: string, makeSuper: boolean): { success: boolean; message: string } {
    if (!this.isSuperAdmin()) {
      return { success: false, message: 'عذراً، فقط المشرف العام (سوبر أدمن) يملك صلاحية تعيين المشرفين.' };
    }

    const currentSuperAdmins = this.users.filter((u) => u.role === 'super_admin');
    if (makeSuper) {
      if (currentSuperAdmins.length >= 2) {
        return {
          success: false,
          message: 'لا يمكن تعيين أكثر من (2) مشرفين عامين (سوبر أدمن) في المنظومة للحفاظ على أمان وصلاحيات النظام.',
        };
      }
    } else {
      if (currentSuperAdmins.length <= 1) {
        return {
          success: false,
          message: 'يجب أن يتبقى على الأقل مشرف عام واحد (سوبر أدمن) في المنظومة.',
        };
      }
    }

    this.users = this.users.map((u) => {
      if (u.id === userId) {
        const updated: AppUser = {
          ...u,
          role: makeSuper ? 'super_admin' : 'assistant',
          profileId: makeSuper ? 'profile_super_admin' : undefined,
          allCommitteesAllowed: makeSuper,
          allExamsAllowed: makeSuper,
          permissions: makeSuper
            ? [
                'database_sheets',
                'manage_committees',
                'add_new_committee',
                'exams_pdf',
                'manage_courses',
                'calendar_schedule',
                'progress_stats',
                'manage_assistants',
              ]
            : ['database_sheets', 'manage_committees'],
        };
        SupabaseService.saveUser(updated).catch(console.error);
        return updated;
      }
      return u;
    });
    this.saveUsers();
    this.notify();
    return {
      success: true,
      message: makeSuper ? 'تمت ترقية المستخدم إلى مشرف عام (سوبر أدمن) بنجاح.' : 'تم تعديل دور المستخدم بنجاح.',
    };
  }

  // ==========================================
  // Role & Permissions Capabilities (RBAC)
  // ==========================================

  public isSuperAdmin(): boolean {
    return this.currentUser?.role === 'super_admin';
  }

  public isCommitteeHead(): boolean {
    return this.currentUser?.role === 'committee_head' || this.isSuperAdmin();
  }

  public isTeacher(): boolean {
    return (
      this.currentUser?.role === 'teacher' ||
      this.currentUser?.role === 'committee_head' ||
      this.isSuperAdmin()
    );
  }

  public isAssistant(): boolean {
    return this.currentUser?.role === 'assistant';
  }

  public isAuditor(): boolean {
    return this.currentUser?.role === 'auditor';
  }

  public hasPermission(permission: string): boolean {
    if (!this.currentUser) return false;
    if (this.currentUser.role === 'super_admin') return true;
    return this.currentUser.permissions.includes(permission);
  }

  public canAccessTab(tab: string, user?: AppUser): boolean {
    const target = user || this.currentUser;
    if (!target) return false;
    if (target.role === 'super_admin') return true;

    // If user has assigned permission profile
    if (target.profileId) {
      const profile = this.getProfileById(target.profileId);
      if (profile && Array.isArray(profile.allowedTabs)) {
        return profile.allowedTabs.includes(tab);
      }
    }

    const perms = target.permissions || [];
    switch (tab) {
      case 'home':
        return true;
      case 'summer_course':
        return perms.includes('database_sheets');
      case 'committees':
        return perms.includes('manage_committees');
      case 'exams':
        return perms.includes('exams_pdf');
      case 'calendar':
        return perms.includes('calendar_schedule');
      case 'stats':
        return perms.includes('progress_stats');
      case 'assistants':
        return perms.includes('manage_assistants');
      case 'courses':
        return perms.includes('manage_courses');
      case 'ceremonies':
      case 'daily_alerts':
        return true;
      default:
        return false;
    }
  }

  public canAccessCommittee(committeeNumber: number, user?: AppUser): boolean {
    const target = user || this.currentUser;
    if (!target) return false;
    if (target.role === 'super_admin' || target.allCommitteesAllowed) return true;

    if (target.profileId) {
      const profile = this.getProfileById(target.profileId);
      if (profile) {
        if (profile.allCommitteesAllowed) return true;
        if (profile.allowedCommittees && profile.allowedCommittees.length > 0) {
          return profile.allowedCommittees.includes(committeeNumber);
        }
      }
    }

    if (target.assignedCommittees && target.assignedCommittees.length > 0) {
      return target.assignedCommittees.includes(committeeNumber);
    }

    return false;
  }

  public canAccessExam(examId: string, user?: AppUser): boolean {
    const target = user || this.currentUser;
    if (!target) return false;
    if (target.role === 'super_admin' || target.allExamsAllowed) return true;

    if (target.profileId) {
      const profile = this.getProfileById(target.profileId);
      if (profile) {
        if (profile.allExamsAllowed) return true;
        if (profile.allowedExamIds && profile.allowedExamIds.length > 0) {
          return profile.allowedExamIds.includes(examId);
        }
      }
    }

    if (target.allowedExamIds && target.allowedExamIds.length > 0) {
      return target.allowedExamIds.includes(examId);
    }

    // Default if not restricted: allowed if user has exams_pdf perm
    return this.hasPermission('exams_pdf');
  }

  public getUserAllowedCommittees(user?: AppUser, allComms: number[] = []): number[] {
    const target = user || this.currentUser;
    if (!target) return [];
    if (target.role === 'super_admin' || target.allCommitteesAllowed) return allComms;

    if (target.profileId) {
      const profile = this.getProfileById(target.profileId);
      if (profile && !profile.allCommitteesAllowed && profile.allowedCommittees.length > 0) {
        return profile.allowedCommittees;
      }
    }

    if (target.assignedCommittees && target.assignedCommittees.length > 0) {
      return target.assignedCommittees;
    }
    return allComms;
  }

  public canAccessDatabaseSheets(): boolean {
    return this.hasPermission('database_sheets');
  }

  public canAccessCommittees(): boolean {
    return this.hasPermission('manage_committees');
  }

  public canAddCommittee(): boolean {
    return this.hasPermission('add_new_committee');
  }

  public canDeleteCommittee(): boolean {
    return this.isSuperAdmin();
  }

  public canAccessExams(): boolean {
    return this.hasPermission('exams_pdf');
  }

  public canAddExam(): boolean {
    return this.hasPermission('exams_pdf');
  }

  public canAccessCourses(): boolean {
    return this.hasPermission('manage_courses');
  }

  public canAddCourse(): boolean {
    return this.hasPermission('manage_courses');
  }

  public canAccessCalendar(): boolean {
    return this.hasPermission('calendar_schedule');
  }

  public canAccessStats(): boolean {
    return this.hasPermission('progress_stats');
  }

  public canAccessAssistants(): boolean {
    return this.hasPermission('manage_assistants');
  }

  public canManageUsers(): boolean {
    return this.hasPermission('manage_assistants');
  }

  public getRoleLabel(role?: UserRole): string {
    const targetRole = role || this.currentUser?.role;
    switch (targetRole) {
      case 'super_admin':
        return 'المشرف العام (سوبر أدمن)';
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
  }

  public getRoleBadgeClass(role?: UserRole): string {
    const targetRole = role || this.currentUser?.role;
    switch (targetRole) {
      case 'super_admin':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'committee_head':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'teacher':
        return 'bg-indigo-100 text-indigo-800 border-indigo-300';
      case 'assistant':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'auditor':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  }

  /**
   * Database connectivity verification
   */
  public async getDatabaseStatus(): Promise<DatabaseStatus> {
    try {
      const res = await fetch('/api/database/status', { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        return {
          ...FALLBACK_DB_STATUS,
          ...data,
        };
      }
    } catch {
      // Silently return status
    }
    return FALLBACK_DB_STATUS;
  }
}

// Export singleton instance
export const AuthService = new AuthServiceClass();

/**
 * React Hook for consuming AuthService state reactively
 */
export function useAuth() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(AuthService.getCurrentUser());
  const [users, setUsers] = useState<AppUser[]>(AuthService.getUsers());
  const [profiles, setProfiles] = useState<PermissionProfile[]>(AuthService.getProfiles());

  useEffect(() => {
    AuthService.init();
    const unsubscribe = AuthService.subscribe(() => {
      setCurrentUser(AuthService.getCurrentUser());
      setUsers(AuthService.getUsers());
      setProfiles(AuthService.getProfiles());
    });
    return unsubscribe;
  }, []);

  return {
    currentUser,
    users,
    profiles,
    isAuthenticated: currentUser !== null,
    login: (e: string, p: string, r?: boolean) => AuthService.login(e, p, r),
    quickLogin: (u: AppUser, r?: boolean) => AuthService.quickLogin(u, r),
    logout: () => AuthService.logout(),
    registerUser: (u: Partial<AppUser>) => AuthService.registerUser(u),
    updateUser: (u: AppUser) => AuthService.updateUser(u),
    approveUser: (id: string, p: AssistantPermission[], c: number[], r?: UserRole) =>
      AuthService.approveUser(id, p, c, r),
    scheduleInterview: (id: string, date: string, notes?: string) =>
      AuthService.scheduleInterview(id, date, notes),
    rejectUser: (id: string, reason?: string) => AuthService.rejectUser(id, reason),
    trackJoinRequest: (query: string) => AuthService.trackJoinRequest(query),
    deleteUser: (id: string) => AuthService.deleteUser(id),
    addDirectUser: (d: Omit<AppUser, 'id' | 'createdAt'>) => AuthService.addDirectUser(d),
    
    // Profiles & Role Management
    saveProfile: (p: PermissionProfile) => AuthService.saveProfile(p),
    deleteProfile: (id: string) => AuthService.deleteProfile(id),
    assignProfileToUser: (uId: string, pId: string) => AuthService.assignProfileToUser(uId, pId),
    setSuperAdmin: (uId: string, isSuper: boolean) => AuthService.setSuperAdmin(uId, isSuper),
    getProfileById: (pId: string) => AuthService.getProfileById(pId),

    // Granular Scope Checks
    canAccessTab: (tab: string, user?: AppUser) => AuthService.canAccessTab(tab, user),
    canAccessCommittee: (commNum: number, user?: AppUser) => AuthService.canAccessCommittee(commNum, user),
    canAccessExam: (examId: string, user?: AppUser) => AuthService.canAccessExam(examId, user),
    getUserAllowedCommittees: (user?: AppUser, allComms?: number[]) =>
      AuthService.getUserAllowedCommittees(user, allComms),

    isSuperAdmin: AuthService.isSuperAdmin(),
    isCommitteeHead: AuthService.isCommitteeHead(),
    isTeacher: AuthService.isTeacher(),
    isAssistant: AuthService.isAssistant(),
    isAuditor: AuthService.isAuditor(),
    hasPermission: (p: string) => AuthService.hasPermission(p),
    canAccessDatabaseSheets: () => AuthService.canAccessDatabaseSheets(),
    canAccessCommittees: () => AuthService.canAccessCommittees(),
    canAddCommittee: () => AuthService.canAddCommittee(),
    canDeleteCommittee: () => AuthService.canDeleteCommittee(),
    canAccessExams: () => AuthService.canAccessExams(),
    canAccessCourses: () => AuthService.canAccessCourses(),
    canAccessCalendar: () => AuthService.canAccessCalendar(),
    canAccessStats: () => AuthService.canAccessStats(),
    canAccessAssistants: () => AuthService.canAccessAssistants(),
    canManageUsers: AuthService.canManageUsers(),
    getRoleLabel: (r?: UserRole) => AuthService.getRoleLabel(r),
    getRoleBadgeClass: (r?: UserRole) => AuthService.getRoleBadgeClass(r),
    getDatabaseStatus: () => AuthService.getDatabaseStatus(),
  };
}
