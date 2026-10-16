import { useEffect, useState } from 'react';
import { AppUser, AssistantPermission, Committee, PermissionProfile, UserRole } from '../types';
import { ApiError, api, onSessionExpired, refreshTokens, tokens } from './api';
import { DataService } from './DataService';

// Session and permissions come only from the server (GET /api/auth/me). Nothing about the user,
// their role or other users is stored in the browser; the refresh token is an HttpOnly cookie.

export interface ServerPermissions {
  role: UserRole;
  actions: Record<string, boolean>;
  /** Committee ids in scope, or 'all'. */
  committeeScope: string[] | 'all';
  committeeNumbers?: number[] | 'all';
  /** Exam ids whose file and content the user may open, or 'all'. */
  exams?: string[] | 'all';
  mustChangePassword?: boolean;
}

/** Access changes a super admin makes when approving or editing someone; only changed fields are sent. */
export interface AccessChanges {
  role?: UserRole;
  permissions?: AssistantPermission[];
  assignedCommitteeIds?: string[];
  allCommitteesAllowed?: boolean;
  allExamsAllowed?: boolean;
  allowedExamIds?: string[];
  profileId?: string | null;
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

  /** Restores the session from the refresh cookie (once per page load). */
  public init(): Promise<void> {
    this.initPromise ??= (async () => {
      try {
        if (tokens.access || (await refreshTokens())) await this.loadMe();
      } catch {
        this.reset();
      }
      this.ready = true;
      this.notify();
    })();
    return this.initPromise;
  }

  private async loadMe() {
    const me = await api<{ user: AppUser; permissions: ServerPermissions; mustChangePassword?: boolean }>('/auth/me');
    this.currentUser = { ...me.user, mustChangePassword: Boolean(me.mustChangePassword ?? me.user.mustChangePassword) };
    this.permissions = me.permissions;
    // Until a reset password is replaced, the server answers nothing else.
    if (!this.currentUser.mustChangePassword) await this.refreshDirectory();
    this.notify();
  }

  /** Reloads the user list and permission profiles if this user may see them. */
  public async refreshDirectory() {
    this.users = this.can('users.read') ? await DataService.getUsers() : this.currentUser ? [this.currentUser] : [];
    this.profiles = this.can('profiles.read') ? await DataService.getProfiles() : [];
    this.notify();
  }

  /** Whether the user must replace a password an admin reset before using the app. */
  public mustChangePassword = () => Boolean(this.currentUser?.mustChangePassword);

  /** Changes the own password; the server ends other sessions and returns a new access token. */
  public async changePassword(currentPassword: string, newPassword: string) {
    const data = await api<{ token: string }>('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
    tokens.setAccess(data.token);
    await this.loadMe();
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
      const data = await api<{ token: string; user: AppUser }>('/auth/login', {
        method: 'POST',
        body: { identifier: identifier.trim(), password },
        auth: false,
      });
      tokens.setAccess(data.token);
      await this.loadMe();
      return { success: true, user: this.currentUser ?? data.user };
    } catch (err) {
      // All or nothing: if the account or its permissions could not be loaded, no half-made
      // session may survive to be restored on the next page load.
      this.reset();
      return { success: false, error: err instanceof ApiError ? err.message : 'تعذر الاتصال بالخادم' };
    }
  }

  /** Ends the session on the server (the access token stops working at once) and clears the cookie. */
  public async logout() {
    const access = tokens.access;
    await api('/auth/logout', { method: 'POST', body: {}, auth: false, headers: access ? { Authorization: `Bearer ${access}` } : {} }).catch(() => {});
    this.reset();
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

  /**
   * One request per change, built from the identity fields plus only what changed, with the version
   * the screen showed (WEB-03). Access fields that did not change are never re-sent, so a manager
   * who may not grant permissions can still edit an assistant (WEB-05, WEB-14).
   */
  private changeUser(userId: string, changes: Partial<AppUser>) {
    const u = this.findUser(userId);
    return this.saveUser({ id: u.id, name: u.name, phone: u.phone, email: u.email, updatedAt: u.updatedAt, ...changes });
  }

  /** Staff-created account; the person logs in with `password` and must change it at first login. */
  public createUser(data: Omit<AppUser, 'id' | 'createdAt'> & { password: string }) {
    return this.saveUser({ ...data, id: `usr_${crypto.randomUUID()}` });
  }

  /** Saves profile fields and, if given, access changes, in one request. */
  public updateUser(user: AppUser & { password?: string }, access: AccessChanges = {}) {
    const { assignedCommittees: _n, assignedCommitteeIds: _i, permissions: _p, allCommitteesAllowed: _a, allExamsAllowed: _e,
      allowedExamIds: _x, profileId: _f, role: _r, status: _s, mustChangePassword: _m, password: _pw, ...profile } = user;
    return this.changeUser(user.id, { ...profile, ...access });
  }

  /** Approval and any profile or access settings are one request (WEB-03). */
  public approveUser(userId: string, access: AccessChanges = {}) {
    return this.changeUser(userId, { status: 'approved', ...access });
  }

  public scheduleInterview(userId: string, interviewDate: string, interviewNotes?: string) {
    return this.changeUser(userId, { status: 'interview', interviewDate, interviewNotes });
  }

  public rejectUser(userId: string, reason?: string) {
    return this.changeUser(userId, { status: 'rejected', rejectionReason: reason });
  }

  /** Super admin: sets a temporary password the user must replace at the next login (WEB-02). */
  public async resetPassword(userId: string, temporaryPassword: string) {
    await DataService.resetUserPassword(userId, temporaryPassword);
    await this.refreshDirectory();
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

  /** The server copies the profile's permissions, committees and exam access (super admin only). */
  public async assignProfileToUser(userId: string, profileId: string) {
    if (!this.getProfileById(profileId)) throw new ApiError('البروفايل غير موجود', 404);
    return this.changeUser(userId, { profileId });
  }

  /** Promotes to super admin, or demotes to the role the super admin chose (WEB-14). */
  public async setSuperAdmin(userId: string, makeSuper: boolean, demoteTo: UserRole = 'assistant'): Promise<{ success: boolean; message: string }> {
    try {
      await this.changeUser(userId, { role: makeSuper ? 'super_admin' : demoteTo });
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

  /**
   * Which screens to show, from the server's evaluated actions only (WEB-22). Hiding a screen is a
   * convenience, not a security boundary: the server checks every request.
   */
  public canAccessTab(tab: string, _user?: AppUser): boolean {
    if (!this.currentUser) return false;
    switch (tab) {
      case 'home':
      case 'ceremonies':
      case 'daily_alerts':
      case 'committees':
        return true;
      case 'summer_course':
        return this.can('summerRows.write') || this.can('audit.read');
      case 'exams':
        return this.can('exams.write') || this.can('exams.file');
      case 'calendar':
        return this.can('tasks.write') || this.currentUser.role === 'assistant';
      case 'stats':
        return this.can('stats.read');
      case 'assistants':
        return this.can('users.read');
      case 'courses':
        return this.can('courses.write');
      case 'audit':
        return this.can('audit.read');
      default:
        return false;
    }
  }

  /** Whether the committee is in the current user's scope (server rule, by committee id). */
  public canAccessCommittee(committee: Pick<Committee, 'id'> | string): boolean {
    const scope = this.permissions?.committeeScope;
    if (!scope) return false;
    if (scope === 'all') return true;
    return scope.includes(typeof committee === 'string' ? committee : committee.id);
  }

  /** `action` is allowed and the committee is in scope: what the server will accept. */
  public canOnCommittee(action: string, committee: Pick<Committee, 'id'> | string): boolean {
    return this.can(action) && this.canAccessCommittee(committee);
  }

  /** Whether the user may open this exam's file and content (server-evaluated allow-list). */
  public canAccessExam(examId: string, _user?: AppUser): boolean {
    if (!this.can('exams.file')) return false;
    const exams = this.permissions?.exams;
    return exams === undefined || exams === 'all' || exams.includes(examId);
  }

  public canAddCommittee = () => this.can('committees.create');
  public canDeleteCommittee = () => this.can('committees.delete');
  public canAddExam = () => this.can('exams.write');
  public canAddCourse = () => this.can('courses.write');
  public canAccessAssistants = () => this.can('users.read');
  public canManageUsers = () => this.can('users.manage');
  public canGrant = () => this.can('users.grant');

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
    updateUser: (u: AppUser, access?: AccessChanges) => AuthService.updateUser(u, access),
    approveUser: (id: string, access?: AccessChanges) => AuthService.approveUser(id, access),
    resetPassword: (id: string, temporaryPassword: string) => AuthService.resetPassword(id, temporaryPassword),
    changePassword: (current: string, next: string) => AuthService.changePassword(current, next),
    mustChangePassword: AuthService.mustChangePassword(),
    scheduleInterview: (id: string, date: string, notes?: string) => AuthService.scheduleInterview(id, date, notes),
    rejectUser: (id: string, reason?: string) => AuthService.rejectUser(id, reason),
    deleteUser: (id: string) => AuthService.deleteUser(id),
    saveProfile: (p: PermissionProfile) => AuthService.saveProfile(p),
    deleteProfile: (id: string) => AuthService.deleteProfile(id),
    assignProfileToUser: (uId: string, pId: string) => AuthService.assignProfileToUser(uId, pId),
    setSuperAdmin: (uId: string, isSuper: boolean, demoteTo?: UserRole) => AuthService.setSuperAdmin(uId, isSuper, demoteTo),
    refreshDirectory: () => AuthService.refreshDirectory(),
    getProfileById: (pId: string) => AuthService.getProfileById(pId),
    canAccessTab: (tab: string, user?: AppUser) => AuthService.canAccessTab(tab, user),
    canAccessCommittee: (committee: Pick<Committee, 'id'> | string) => AuthService.canAccessCommittee(committee),
    canOnCommittee: (action: string, committee: Pick<Committee, 'id'> | string) => AuthService.canOnCommittee(action, committee),
    canAccessExam: (examId: string) => AuthService.canAccessExam(examId),
    canGrant: AuthService.canGrant(),
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
