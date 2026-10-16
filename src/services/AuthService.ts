import { useEffect, useState } from 'react';
import { AppUser, AssistantPermission, PermissionProfile, UserRole } from '../types';
import { ApiError, api, onSessionExpired, tokens } from './api';
import { DataService } from './DataService';

// Session and permissions come only from the server (GET /api/auth/me). Nothing about
// the user, their role or other users is read from localStorage; only the two session
// tokens are stored there.

export interface ServerPermissions {
  role: UserRole;
  actions: Record<string, boolean>;
  committeeScope: number[] | 'all';
}

/** Keys from older versions that held users, passwords and cached data; removed on load and logout. */
const LEGACY_KEYS = [
  'bukhari_auth_session_user',
  'bukhari_auth_session_token',
  'bukhari_users_v2',
  'bukhari_permission_profiles_v1',
  'bukhari_competition_committees_v2',
  'bukhari_exams_v2',
  'bukhari_saved_books_v2',
  'bukhari_sheets_config_v2',
  'bukhari_custom_permissions_v4',
  'bukhari_competition_courses_v2',
  'bukhari_schedule_tasks_v2',
  'bukhari_summer_course_table_rows_v4',
];

function clearLegacyStorage() {
  try {
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem('bukhari_auth_session_user');
  } catch {
    // storage unavailable
  }
}

class AuthServiceClass {
  private currentUser: AppUser | null = null;
  private permissions: ServerPermissions | null = null;
  private users: AppUser[] = [];
  private profiles: PermissionProfile[] = [];
  private listeners = new Set<() => void>();
  private initPromise: Promise<void> | null = null;
  public ready = false;

  constructor() {
    clearLegacyStorage();
    onSessionExpired(() => this.reset());
  }

  /** Restores the session from the stored tokens (once). */
  public init(): Promise<void> {
    this.initPromise ??= (async () => {
      if (tokens.access || tokens.refresh) {
        try {
          await this.loadMe();
        } catch {
          this.reset();
        }
      }
      this.ready = true;
      this.notify();
    })();
    return this.initPromise;
  }

  private async loadMe() {
    const me = await api<{ user: AppUser; permissions: ServerPermissions }>('/auth/me');
    this.currentUser = me.user;
    this.permissions = me.permissions;
    await this.refreshDirectory();
    this.notify();
  }

  /** Reloads the user list and permission profiles if this user may see them. */
  public async refreshDirectory() {
    this.users = this.can('users.read') ? await DataService.getUsers() : this.currentUser ? [this.currentUser] : [];
    this.profiles = this.can('profiles.read') ? await DataService.getProfiles() : [];
    this.notify();
  }

  private reset() {
    tokens.clear();
    clearLegacyStorage();
    this.currentUser = null;
    this.permissions = null;
    this.users = [];
    this.profiles = [];
    this.notify();
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getCurrentUser = () => this.currentUser;
  public getUsers = () => [...this.users];
  public getProfiles = () => [...this.profiles];
  public getPermissions = () => this.permissions;

  /** Whether the server allows the current user to perform `action` (see server/policy.ts). */
  public can(action: string): boolean {
    return Boolean(this.permissions?.actions[action]);
  }

  public async login(identifier: string, password: string): Promise<{ success: boolean; user?: AppUser; error?: string }> {
    try {
      const data = await api<{ token: string; refreshToken: string; user: AppUser }>('/auth/login', {
        method: 'POST',
        body: { identifier: identifier.trim(), password },
        auth: false,
      });
      tokens.set(data.token, data.refreshToken);
      await this.loadMe();
      return { success: true, user: this.currentUser ?? data.user };
    } catch (err) {
      // All or nothing: if the account or its permissions could not be loaded, no half-made
      // session may survive to be restored on the next page load.
      this.reset();
      return { success: false, error: err instanceof ApiError ? err.message : 'تعذر الاتصال بالخادم' };
    }
  }

  public async logout() {
    const refreshToken = tokens.refresh;
    this.reset();
    if (refreshToken) await api('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }).catch(() => {});
  }

  /** Public join request (no session). Returns the server-generated tracking code. */
  public async submitJoinRequest(data: Partial<AppUser> & { password?: string }): Promise<string> {
    const res = await api<{ requestCode: string }>('/auth/register', {
      method: 'POST',
      auth: false,
      body: {
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        roleKey: data.role,
        password: data.password,
        notes: data.notes,
        whatsapp: data.whatsapp,
        nationalId: data.nationalId,
        quranLevel: data.quranLevel,
        qualification: data.qualification,
        experience: data.experience,
        availability: data.availability,
        preferredCommittees: data.preferredCommittees,
      },
    });
    return res.requestCode;
  }

  public async trackJoinRequest(code: string): Promise<{ status: string; interviewDate?: string } | null> {
    try {
      return await api(`/auth/join-status/${encodeURIComponent(code.trim())}`, { auth: false });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  private async saveUser(user: Partial<AppUser> & { id: string; password?: string }): Promise<AppUser> {
    const saved = await DataService.saveUser(user);
    if (saved.id === this.currentUser?.id) await this.loadMe();
    else await this.refreshDirectory();
    return saved;
  }

  private findUser(id: string): AppUser {
    const u = this.users.find((x) => x.id === id);
    if (!u) throw new ApiError('المستخدم غير موجود', 404);
    return u;
  }

  /** Staff-created account; the person logs in with `password`. */
  public createUser(data: Omit<AppUser, 'id' | 'createdAt'> & { password: string }) {
    return this.saveUser({ ...data, id: `usr_${crypto.randomUUID()}` });
  }

  public updateUser(user: AppUser & { password?: string }) {
    return this.saveUser(user);
  }

  public approveUser(userId: string, permissions: AssistantPermission[], assignedCommittees: number[], role: UserRole = 'assistant') {
    return this.saveUser({ ...this.findUser(userId), role, status: 'approved', permissions, assignedCommittees });
  }

  public scheduleInterview(userId: string, interviewDate: string, interviewNotes?: string) {
    return this.saveUser({ ...this.findUser(userId), status: 'interview', interviewDate, interviewNotes });
  }

  public rejectUser(userId: string, reason?: string) {
    return this.saveUser({ ...this.findUser(userId), status: 'rejected', rejectionReason: reason });
  }

  public async deleteUser(userId: string) {
    await DataService.deleteUser(userId);
    await this.refreshDirectory();
  }

  public async saveProfile(profile: PermissionProfile): Promise<PermissionProfile> {
    const saved = await DataService.saveProfile({ ...profile, id: profile.id || `profile_${crypto.randomUUID()}` });
    await this.refreshDirectory();
    return saved;
  }

  public async deleteProfile(profileId: string): Promise<boolean> {
    const target = this.profiles.find((p) => p.id === profileId);
    if (target?.isDefault) return false;
    await DataService.deleteProfile(profileId);
    await this.refreshDirectory();
    return true;
  }

  public getProfileById(profileId: string) {
    return this.profiles.find((p) => p.id === profileId);
  }

  public async assignProfileToUser(userId: string, profileId: string) {
    const profile = this.getProfileById(profileId);
    if (!profile) throw new ApiError('البروفايل غير موجود', 404);
    return this.saveUser({
      ...this.findUser(userId),
      profileId,
      permissions: profile.permissions,
      assignedCommittees: profile.allCommitteesAllowed ? [] : profile.allowedCommittees,
      allCommitteesAllowed: profile.allCommitteesAllowed,
      allowedExamIds: profile.allowedExamIds,
      allExamsAllowed: profile.allExamsAllowed,
    });
  }

  public async setSuperAdmin(userId: string, makeSuper: boolean): Promise<{ success: boolean; message: string }> {
    try {
      await this.saveUser({ ...this.findUser(userId), role: makeSuper ? 'super_admin' : 'assistant' });
      return { success: true, message: 'تم تحديث الرتبة بنجاح.' };
    } catch (err) {
      return { success: false, message: err instanceof ApiError ? err.message : 'تعذر تحديث الرتبة' };
    }
  }

  public isSuperAdmin = () => this.currentUser?.role === 'super_admin';
  public isCommitteeHead = () => this.currentUser?.role === 'committee_head' || this.isSuperAdmin();
  public isTeacher = () => this.currentUser?.role === 'teacher' || this.isCommitteeHead();
  public isAssistant = () => this.currentUser?.role === 'assistant';

  public hasPermission(permission: string): boolean {
    if (!this.currentUser) return false;
    if (this.currentUser.role === 'super_admin') return true;
    return this.currentUser.permissions.includes(permission);
  }

  /** Tab visibility: the server's read rights, narrowed by the user's permission profile. */
  public canAccessTab(tab: string, user?: AppUser): boolean {
    const target = user || this.currentUser;
    if (!target) return false;
    if (target.role === 'super_admin') return true;
    if (target.profileId) {
      const profile = this.getProfileById(target.profileId);
      if (profile && Array.isArray(profile.allowedTabs) && !profile.allowedTabs.includes(tab) && tab !== 'home') return false;
    }
    const perms = target.permissions || [];
    switch (tab) {
      case 'home':
      case 'ceremonies':
      case 'daily_alerts':
        return true;
      case 'summer_course':
        return perms.includes('database_sheets') || target.role === 'auditor';
      case 'committees':
        return perms.includes('manage_committees') || ['assistant', 'teacher', 'auditor'].includes(target.role);
      case 'exams':
        return perms.includes('exams_pdf');
      case 'calendar':
        return perms.includes('calendar_schedule') || target.role === 'assistant';
      case 'stats':
        return perms.includes('progress_stats') || target.role === 'auditor';
      case 'assistants':
        return target.id === this.currentUser?.id ? this.can('users.read') : perms.includes('manage_assistants');
      case 'courses':
        return perms.includes('manage_courses');
      default:
        return false;
    }
  }

  /** Whether the user may change this committee (server rule: heads/assistants only their assigned ones). */
  public canAccessCommittee(committeeNumber: number, user?: AppUser): boolean {
    const target = user || this.currentUser;
    if (!target) return false;
    if (target.role !== 'committee_head' && target.role !== 'assistant') return true;
    return target.assignedCommittees?.includes(committeeNumber) || false;
  }

  public canAccessExam(examId: string, user?: AppUser): boolean {
    const target = user || this.currentUser;
    if (!target) return false;
    if (target.role === 'super_admin' || target.allExamsAllowed) return true;
    if (target.profileId) {
      const profile = this.getProfileById(target.profileId);
      if (profile?.allExamsAllowed) return true;
      if (profile && !profile.allowedExamIds?.includes(examId)) return false;
    }
    return target.allowedExamIds ? target.allowedExamIds.includes(examId) : this.hasPermission('exams_pdf');
  }

  public getUserAllowedCommittees(user?: AppUser, allComms: number[] = []): number[] {
    const target = user || this.currentUser;
    if (!target) return [];
    if (target.role !== 'committee_head' && target.role !== 'assistant') return allComms;
    return target.assignedCommittees || [];
  }

  public canAccessDatabaseSheets = () => this.hasPermission('database_sheets');
  public canAccessCommittees = () => this.hasPermission('manage_committees');
  public canAddCommittee = () => this.can('committees.create');
  public canDeleteCommittee = () => this.can('committees.delete');
  public canAccessExams = () => this.hasPermission('exams_pdf');
  public canAddExam = () => this.can('exams.write');
  public canAccessCourses = () => this.hasPermission('manage_courses');
  public canAddCourse = () => this.can('courses.write');
  public canAccessCalendar = () => this.hasPermission('calendar_schedule');
  public canAccessStats = () => this.hasPermission('progress_stats');
  public canAccessAssistants = () => this.can('users.read');
  public canManageUsers = () => this.can('users.manage');

  public getRoleLabel(role?: UserRole): string {
    switch (role || this.currentUser?.role) {
      case 'super_admin': return 'المشرف العام (مدير النظام)';
      case 'committee_head': return 'رئيس لجنة واختبارات';
      case 'teacher': return 'معلم ومقرئ معتمد';
      case 'assistant': return 'معاون ميداني معتمد';
      case 'auditor': return 'مراجع ومدقق جودة (رقابي)';
      default: return 'مستخدم النظام';
    }
  }

  public getRoleBadgeClass(role?: UserRole): string {
    switch (role || this.currentUser?.role) {
      case 'super_admin': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'committee_head': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'teacher': return 'bg-indigo-100 text-indigo-800 border-indigo-300';
      case 'assistant': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'auditor': return 'bg-purple-100 text-purple-800 border-purple-300';
      default: return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  }
}

export const AuthService = new AuthServiceClass();

export function useAuth() {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = AuthService.subscribe(() => setVersion((v) => v + 1));
    AuthService.init();
    return unsubscribe;
  }, []);

  return {
    ready: AuthService.ready,
    currentUser: AuthService.getCurrentUser(),
    users: AuthService.getUsers(),
    profiles: AuthService.getProfiles(),
    permissions: AuthService.getPermissions(),
    can: (action: string) => AuthService.can(action),
    login: (identifier: string, password: string) => AuthService.login(identifier, password),
    logout: () => AuthService.logout(),
    submitJoinRequest: (u: Partial<AppUser> & { password?: string }) => AuthService.submitJoinRequest(u),
    trackJoinRequest: (code: string) => AuthService.trackJoinRequest(code),
    createUser: (d: Omit<AppUser, 'id' | 'createdAt'> & { password: string }) => AuthService.createUser(d),
    updateUser: (u: AppUser) => AuthService.updateUser(u),
    approveUser: (id: string, p: AssistantPermission[], c: number[], r?: UserRole) => AuthService.approveUser(id, p, c, r),
    scheduleInterview: (id: string, date: string, notes?: string) => AuthService.scheduleInterview(id, date, notes),
    rejectUser: (id: string, reason?: string) => AuthService.rejectUser(id, reason),
    deleteUser: (id: string) => AuthService.deleteUser(id),
    saveProfile: (p: PermissionProfile) => AuthService.saveProfile(p),
    deleteProfile: (id: string) => AuthService.deleteProfile(id),
    assignProfileToUser: (uId: string, pId: string) => AuthService.assignProfileToUser(uId, pId),
    setSuperAdmin: (uId: string, isSuper: boolean) => AuthService.setSuperAdmin(uId, isSuper),
    refreshDirectory: () => AuthService.refreshDirectory(),
    getProfileById: (pId: string) => AuthService.getProfileById(pId),
    canAccessTab: (tab: string, user?: AppUser) => AuthService.canAccessTab(tab, user),
    canAccessCommittee: (commNum: number, user?: AppUser) => AuthService.canAccessCommittee(commNum, user),
    canAccessExam: (examId: string, user?: AppUser) => AuthService.canAccessExam(examId, user),
    getUserAllowedCommittees: (user?: AppUser, allComms?: number[]) => AuthService.getUserAllowedCommittees(user, allComms),
    isSuperAdmin: AuthService.isSuperAdmin(),
    isCommitteeHead: AuthService.isCommitteeHead(),
    isTeacher: AuthService.isTeacher(),
    isAssistant: AuthService.isAssistant(),
    hasPermission: (p: string) => AuthService.hasPermission(p),
    canManageUsers: AuthService.canManageUsers(),
    getRoleLabel: (r?: UserRole) => AuthService.getRoleLabel(r),
    getRoleBadgeClass: (r?: UserRole) => AuthService.getRoleBadgeClass(r),
  };
}
