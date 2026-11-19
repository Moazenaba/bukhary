import React, { useState } from 'react';
import { UserAssignmentsPanel } from './Assignments';
import { HeadGrantsAdminPanel, canSeeHeadGrants } from './HeadGrants';
import { PageHeader, primaryAction, quietAction } from './ui/PageHeader';
import {
  AppUser,
  AssistantPermission,
  Committee,
  Course,
  PermissionDefinition,
  UserRole,
  PermissionProfile,
  ExamItem,
} from '../types';
import { AuthService, type AccessChanges } from '../services/AuthService';
import { PersonAssignmentsModal, assignmentsOf } from './StaffAssignment';
import { CommitteePicker } from './CommitteePicker';
import { PermissionProfileModal } from './users/PermissionProfileModal';

interface AssistantsViewProps {
  users: AppUser[];
  committees: Committee[];
  courses?: Course[];
  exams?: ExamItem[];
  currentUser: AppUser;
  profiles?: PermissionProfile[];
  onSaveProfile?: (profile: PermissionProfile) => unknown;
  onDeleteProfile?: (profileId: string) => unknown;
  onAssignProfile?: (userId: string, profileId: string) => Promise<unknown>;
  onSetSuperAdmin?: (userId: string, isSuper: boolean, demoteTo?: UserRole) => Promise<{ success: boolean; message: string }>;
  /** One request: approval plus any access settings (WEB-03). Resolves to undefined on failure. */
  onApproveAssistant: (userId: string, access?: AccessChanges) => Promise<unknown>;
  onScheduleInterview?: (userId: string, date: string, notes?: string) => unknown;
  onRejectAssistant: (userId: string, reason?: string) => unknown;
  /** Profile fields plus only the access settings that changed. Resolves to undefined on failure. */
  onUpdateAssistantUser: (updatedUser: AppUser, access?: AccessChanges) => Promise<unknown>;
  onAddAssistantDirect: (user: Omit<AppUser, 'id' | 'createdAt'> & { password: string }) => unknown;
  onDeleteAssistant: (userId: string) => unknown;
  /** Super admin: temporary password the user must replace at the next login (WEB-02). */
  onResetPassword?: (userId: string, temporaryPassword: string) => Promise<unknown>;
  onOpenAuthModal: () => void;
  onOpenCommitteeDetails?: (committee: Committee) => void;
  /** The server returned a newer committee after a person was placed on it or invited to its ceremony. */
  onCommitteeChanged?: (committee: Committee) => void;
  /** System permissions only: custom labels never granted anything (D-01). */
  customPermissions: PermissionDefinition[];
}

const sameSet = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((x) => b.includes(x));

/** Role choices the current user may give (from the server: admins never give admin roles). */
const RoleOptions: React.FC = () => (
  <>
    {AuthService.grantableRoles().map((r) => (
      <option key={r} value={r}>{AuthService.getRoleLabel(r)}</option>
    ))}
  </>
);

/** A readable temporary password that satisfies the server rule (letters and digits, 10 characters). */
function generateTemporaryPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [...Array(7)].map(() => pick(letters)).concat([...Array(3)].map(() => pick(digits)));
  return chars.sort(() => (crypto.getRandomValues(new Uint8Array(1))[0] > 127 ? 1 : -1)).join('');
}

export const AssistantsView: React.FC<AssistantsViewProps> = ({
  users,
  committees,
  courses: _courses = [],
  exams = [],
  currentUser,
  profiles = [],
  onSaveProfile,
  onDeleteProfile,
  onAssignProfile,
  onSetSuperAdmin,
  onApproveAssistant,
  onScheduleInterview,
  onRejectAssistant,
  onUpdateAssistantUser,
  onAddAssistantDirect,
  onDeleteAssistant,
  onResetPassword,
  onOpenAuthModal,
  onOpenCommitteeDetails,
  onCommitteeChanged,
  customPermissions,
}) => {
  // Super admins grant roles, permissions and access; other managers assign their own committees only.
  const canGrant = AuthService.canGrant();
  const canAssign = (c: Committee) => canGrant || AuthService.canAccessCommittee(c);
  const committeeLabel = (ids: string[] = []) =>
    committees
      .filter((c) => ids.includes(c.id))
      .map((c) => `#${c.committeeNumber}${c.courseName ? ` (${c.courseName})` : ''}`)
      .join('، ');
  // Tabs: 'approved' (المعاونون والمستخدمون), 'profiles' (مركز بناء أنظمة الصلاحيات المخصصة), 'requests' (طلبات الانضمام والمقابلات)
  const [activeTab, setActiveTab] = useState<'approved' | 'profiles' | 'requests'>('approved');
  const [requestsSubFilter, setRequestsSubFilter] = useState<'all' | 'pending' | 'interview' | 'rejected'>('all');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);
  const [dossierUser, setDossierUser] = useState<AppUser | null>(null);
  const [interviewingUser, setInterviewingUser] = useState<AppUser | null>(null);
  const [rejectingUser, setRejectingUser] = useState<AppUser | null>(null);
  const [approvingUser, setApprovingUser] = useState<AppUser | null>(null);
  const [assigningProfileUser, setAssigningProfileUser] = useState<AppUser | null>(null);
  const [demotingUser, setDemotingUser] = useState<AppUser | null>(null);
  const [demoteTo, setDemoteTo] = useState<UserRole>('admin');
  const [assigningUser, setAssigningUser] = useState<AppUser | null>(null);
  const [saving, setSaving] = useState(false);
  // Edit modal: access settings edited next to the profile fields.
  const [editAccess, setEditAccess] = useState<{
    role: UserRole;
    permissions: AssistantPermission[];
    committeeIds: string[];
    allCommittees: boolean;
    allExams: boolean;
    examIds: string[];
    profileId: string;
  } | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  // Profile Builder Modal State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<PermissionProfile | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [superAdminAlert, setSuperAdminAlert] = useState<string | null>(null);

  // Interview state
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewNotes, setInterviewNotes] = useState('يرجى الحضور لمقر إدارة لجان المسابقة لإجراء اختبار حفظ القرآن والمقابلة الشخصية.');

  // Rejection state
  const [rejectionReason, setRejectionReason] = useState('نعتذر عن قبول الطلب حالياً لاكتمال النصاب المطلوب في لجان هذه الدورة، مع تمنياتنا بالتوفيق في الدورات القادمة.');

  // Approval modal: nothing extra is pre-selected (WEB-05).
  const [approvalRole, setApprovalRole] = useState<UserRole>('sheikh');
  const [approvalProfileId, setApprovalProfileId] = useState<string>('');
  const [approvalPermissions, setApprovalPermissions] = useState<AssistantPermission[]>([]);
  const [approvalCommittees, setApprovalCommittees] = useState<string[]>([]);
  const [approvalAllCommittees, setApprovalAllCommittees] = useState(false);

  // Form state for adding direct assistant
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('sheikh');
  const [newProfileId, setNewProfileId] = useState<string>('');
  const [newPermissions, setNewPermissions] = useState<AssistantPermission[]>([]);
  const [newAssignedCommittees, setNewAssignedCommittees] = useState<string[]>([]);

  // Screen names, used only to describe what a permission opens.
  const ALL_SYSTEM_TABS: Array<{ id: string; label: string; icon: string; desc: string }> = [
    { id: 'home', label: 'الرئيسية ونظرة عامة', icon: 'dashboard', desc: 'الشاشة الترحيبية والملخص الميداني' },
    { id: 'summer_course', label: 'قاعدة البيانات والكشوفات', icon: 'table_chart', desc: 'كشوفات الطلاب ورصد الحضور' },
    { id: 'committees', label: 'إدارة اللجان الميدانية', icon: 'groups', desc: 'متابعة اللجان والمراحل وسير الاختبارات' },
    { id: 'exams', label: 'الامتحانات ونماذج PDF', icon: 'description', desc: 'بنك الأسئلة والامتحانات المعتمدة' },
    { id: 'calendar', label: 'الجدول وتقويم المواعيد', icon: 'calendar_month', desc: 'تقويم المواعيد ومهام التسليم' },
    { id: 'ceremonies', label: 'الحفلات والتكريم', icon: 'celebration', desc: 'تكريم الطلاب وتجهيز الدروع والشهادات' },
    { id: 'daily_alerts', label: 'التنبيهات والمهام اليومية', icon: 'notifications_active', desc: 'المهام اليومية العاجلة للمعاونين' },
    { id: 'stats', label: 'حساب ونسبة الإنجاز', icon: 'donut_large', desc: 'لوحة الإحصائيات الشاملة والنسب' },
    { id: 'courses', label: 'إضافة وإدارة الدورات', icon: 'event_repeat', desc: 'إدارة الدورات العلمية الصيفية' },
    { id: 'assistants', label: 'الشيوخ والصلاحيات', icon: 'badge', desc: 'إدارة الشيوخ ورؤساء اللجان وإسنادهم للجان والحفلات' },
  ];

  // Fallback to AuthService & LocalStorage if props are syncing
  const effectiveProfiles: PermissionProfile[] =
    profiles && profiles.length > 0 ? profiles : AuthService.getProfiles();
  const effectiveExams: ExamItem[] = exams ?? [];

  // Filtering
  const isSuperAdmin = currentUser.role === 'super_admin';
  const superAdminsCount = users.filter((u) => u.role === 'super_admin').length;
  const approvedUsers = users.filter((u) => u.status === 'approved');
  const joinRequests = users.filter((u) => u.role !== 'super_admin' && u.status !== 'approved');
  const pendingRequests = users.filter((u) => u.status === 'pending');
  const interviewRequests = users.filter((u) => u.status === 'interview');
  const rejectedRequests = users.filter((u) => u.status === 'rejected');

  const filteredApproved = approvedUsers.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.phone.includes(q) || u.email.toLowerCase().includes(q);
  });

  const filteredRequests = joinRequests.filter((u) => {
    if (requestsSubFilter === 'pending' && u.status !== 'pending') return false;
    if (requestsSubFilter === 'interview' && u.status !== 'interview') return false;
    if (requestsSubFilter === 'rejected' && u.status !== 'rejected') return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.phone.includes(q) ||
      (u.requestCode && u.requestCode.toLowerCase().includes(q)) ||
      (u.quranLevel && u.quranLevel.toLowerCase().includes(q))
    );
  });

  // Profile Builder Actions
  const handleOpenCreateProfile = () => {
    setEditingProfile(null);
    setIsProfileModalOpen(true);
  };

  const handleOpenEditProfile = (profile: PermissionProfile) => {
    setEditingProfile(profile);
    setIsProfileModalOpen(true);
  };

  const handleToggleSuperAdmin = async (targetUser: AppUser, demoteRole?: UserRole) => {
    if (!canGrant) return;
    const willBeSuper = targetUser.role !== 'super_admin';
    const result = await (onSetSuperAdmin
      ? onSetSuperAdmin(targetUser.id, willBeSuper, demoteRole)
      : AuthService.setSuperAdmin(targetUser.id, willBeSuper, demoteRole));
    setSuperAdminAlert(result.message);
    setTimeout(() => setSuperAdminAlert(null), result.success ? 4000 : 5000);
  };

  /** Applying a profile is one server request: the server copies its settings (WEB-03). */
  const handleAssignProfileToUser = async (targetUser: AppUser, profileId: string) => {
    setSaving(true);
    try {
      await (onAssignProfile ? onAssignProfile(targetUser.id, profileId) : AuthService.assignProfileToUser(targetUser.id, profileId));
      setAssigningProfileUser(null);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenApproveModal = (user: AppUser) => {
    setApprovingUser(user);
    setApprovalRole(user.role || 'assistant');
    setApprovalProfileId('');
    setApprovalPermissions([]);
    setApprovalAllCommittees(false);
    // Preferred committees are numbers chosen by the applicant; offer them only where unambiguous.
    const preferred = committees.filter((c) => user.preferredCommittees?.includes(c.committeeNumber) && canAssign(c));
    const numbers = new Set(preferred.map((c) => c.committeeNumber));
    setApprovalCommittees(preferred.length === numbers.size ? preferred.map((c) => c.id) : []);
  };

  const handleConfirmApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvingUser) return;
    const access: AccessChanges = {};
    if (canGrant) {
      if (approvalRole !== approvingUser.role) access.role = approvalRole;
      if (approvalProfileId) {
        access.profileId = approvalProfileId;
      } else {
        access.permissions = approvalPermissions;
        if (approvalAllCommittees) access.allCommitteesAllowed = true;
        else access.assignedCommitteeIds = approvalCommittees;
      }
    } else {
      access.assignedCommitteeIds = approvalCommittees;
    }
    setSaving(true);
    try {
      // The modal closes only after the server confirmed the approval.
      const result = await onApproveAssistant(approvingUser.id, access);
      if (result !== undefined) setApprovingUser(null);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenInterviewModal = (user: AppUser) => {
    setInterviewingUser(user);
    setInterviewDate('');
    setInterviewNotes('يرجى الحضور لمقر إدارة لجان المسجد لإجراء اختبار حفظ القرآن والمقابلة.');
  };

  const handleConfirmInterview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!interviewingUser) return;
    if (onScheduleInterview) {
      onScheduleInterview(interviewingUser.id, interviewDate, interviewNotes);
    } else {
      AuthService.scheduleInterview(interviewingUser.id, interviewDate, interviewNotes);
    }
    setInterviewingUser(null);
  };

  const handleOpenRejectModal = (user: AppUser) => {
    setRejectingUser(user);
    setRejectionReason('نعتذر عن قبول الطلب حالياً لاكتمال النصاب المطلوب في لجان هذه الدورة، مع تمنياتنا بالتوفيق.');
  };

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingUser) return;
    onRejectAssistant(rejectingUser.id, rejectionReason);
    setRejectingUser(null);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim() || !newPassword) return;
    const created = await onAddAssistantDirect({
      password: newPassword,
      name: newName.trim(),
      phone: newPhone.trim(),
      email: newEmail.trim(),
      role: canGrant ? newRole : 'sheikh',
      profileId: canGrant && newProfileId ? newProfileId : undefined,
      status: 'approved',
      assignedCommittees: [],
      assignedCommitteeIds: newAssignedCommittees,
      permissions: canGrant && !newProfileId ? newPermissions : [],
      notes: newNotes.trim() || undefined,
    });
    if (!created) return;
    setIsAddModalOpen(false);
    setNewName('');
    setNewPhone('');
    setNewEmail('');
    setNewPassword('');
    setNewNotes('');
    setNewPermissions([]);
    setNewProfileId('');
    setNewAssignedCommittees([]);
  };

  const openEditUser = (user: AppUser) => {
    setEditingUser(user);
    setResetPassword('');
    setEditAccess({
      role: user.role,
      permissions: user.permissions ?? [],
      committeeIds: user.assignedCommitteeIds ?? [],
      allCommittees: Boolean(user.allCommitteesAllowed),
      allExams: Boolean(user.allExamsAllowed),
      examIds: user.allowedExamIds ?? [],
      profileId: '',
    });
  };

  /** Sends the profile fields and only the access settings that changed, in one request. */
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editAccess) return;
    const original = users.find((u) => u.id === editingUser.id) ?? editingUser;
    const access: AccessChanges = {};
    if (editAccess.profileId) {
      access.profileId = editAccess.profileId;
    } else {
      if (canGrant && editAccess.role !== original.role) access.role = editAccess.role;
      if (canGrant && !sameSet(editAccess.permissions, original.permissions)) access.permissions = editAccess.permissions;
      if (canGrant && editAccess.allCommittees !== Boolean(original.allCommitteesAllowed)) access.allCommitteesAllowed = editAccess.allCommittees;
      if (!editAccess.allCommittees && !sameSet(editAccess.committeeIds, original.assignedCommitteeIds ?? [])) {
        access.assignedCommitteeIds = editAccess.committeeIds;
      }
      if (canGrant && editAccess.allExams !== Boolean(original.allExamsAllowed)) access.allExamsAllowed = editAccess.allExams;
      if (canGrant && !editAccess.allExams && !sameSet(editAccess.examIds, original.allowedExamIds ?? [])) access.allowedExamIds = editAccess.examIds;
    }
    setSaving(true);
    try {
      const result = await onUpdateAssistantUser(editingUser, access);
      if (result !== undefined) setEditingUser(null);
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!editingUser || !onResetPassword || resetPassword.length < 8) return;
    setSaving(true);
    try {
      const result = await onResetPassword(editingUser.id, resetPassword);
      if (result !== undefined) setSuperAdminAlert(`تمت إعادة تعيين كلمة مرور ${editingUser.name}. أبلغه بكلمة المرور المؤقتة؛ سيُطلب منه تغييرها عند الدخول.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-right font-sans">
      <PageHeader
        icon="badge"
        title="المستخدمون"
        subtitle={`${approvedUsers.length} معتمد${pendingRequests.length > 0 ? ` · ${pendingRequests.length} طلب انضمام جديد` : ''}${
          isSuperAdmin ? ` · ${superAdminsCount} من 2 سوبر أدمن` : ''
        }`}
        actions={
          <>
            {/* Creating accounts is the server's users.manage: admins, or a committee head given that permission. */}
            {AuthService.canManageUsers() && (
              <button type="button" onClick={() => setIsAddModalOpen(true)} className={primaryAction}>
                <span className="material-symbols-outlined text-lg">person_add</span>
                <span>إضافة مستخدم</span>
              </button>
            )}
            {canGrant && (
              <button type="button" onClick={handleOpenCreateProfile} className={quietAction}>
                <span className="material-symbols-outlined text-lg">add_moderator</span>
                <span>نظام صلاحية جديد</span>
              </button>
            )}
          </>
        }
      />
      {canSeeHeadGrants() && <HeadGrantsAdminPanel committees={committees} />}

      {/* Super Admin Alert Notification */}
      {superAdminAlert && (
        <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-400 text-amber-950 text-xs sm:text-sm font-bold flex items-center justify-between gap-3 animate-in fade-in shadow-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-600 text-xl">info</span>
            <span>{superAdminAlert}</span>
          </div>
          <button onClick={() => setSuperAdminAlert(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Main Tabs Navigation Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveTab('approved')}
            className={`min-h-11 px-2 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 ${
              activeTab === 'approved'
                ? 'bg-brand text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
            }`}
          >
            <span className="material-symbols-outlined text-base">manage_accounts</span>
            <span>المستخدمون</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-white/20 text-white font-mono">
              {approvedUsers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('profiles')}
            className={`min-h-11 px-2 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 ${
              activeTab === 'profiles'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-teal-50'
            }`}
          >
            <span className="material-symbols-outlined text-base">tune</span>
            <span>الأنظمة</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-teal-200 text-teal-950 font-mono font-bold">
              {effectiveProfiles.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`min-h-11 px-2 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 ${
              activeTab === 'requests'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-amber-50'
            }`}
          >
            <span className="material-symbols-outlined text-base">how_to_reg</span>
            <span>الطلبات</span>
            {pendingRequests.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-amber-200 text-amber-950 font-mono font-black animate-pulse">
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <span className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400">
            <span className="material-symbols-outlined text-base">search</span>
          </span>
          <input
            type="text"
            placeholder="بحث بالاسم أو الهاتف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-xl pr-9 pl-3 py-2 text-xs outline-none focus:border-brand"
          />
        </div>
      </div>

      {/* VIEW 1: APPROVED USERS & ROLE ASSIGNMENTS */}
      {activeTab === 'approved' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredApproved.map((user) => {
              const userProfile = effectiveProfiles.find((p) => p.id === user.profileId);
              const assignedLabel = committeeLabel(user.assignedCommitteeIds);
              const canEditUser = canGrant || (user.role === 'sheikh' && AuthService.canManageUsers()) || user.id === currentUser.id;
              const placed = assignmentsOf(user, committees);
              const canPlace = (user.role === 'sheikh' || (user.role === 'committee_head' && canGrant)) &&
                (AuthService.can('committees.members') || AuthService.can('committees.finalize'));

              return (
                <div
                  key={user.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs hover:shadow-md transition-all space-y-4"
                >
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-base shadow-xs ${
                          user.role === 'super_admin'
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-emerald-100 text-brand'
                        }`}
                      >
                        <span className="material-symbols-outlined text-2xl">
                          {user.role === 'super_admin' ? 'military_tech' : 'person'}
                        </span>
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm sm:text-base text-slate-900">{user.name}</h4>
                          {user.role === 'super_admin' && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-xs border border-amber-300">
                              👑 سوبر أدمن
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          <span className="font-mono text-emerald-900 font-bold">📞 {user.phone}</span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-700 font-semibold">{AuthService.getRoleLabel(user.role)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {canEditUser && (
                        <button
                          onClick={() => openEditUser(user)}
                          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                          title="تعديل البيانات والصلاحيات"
                          aria-label={`تعديل ${user.name}`}
                        >
                          <span className="material-symbols-outlined text-base">edit</span>
                        </button>
                      )}
                      {user.role !== 'super_admin' && user.id !== currentUser.id && AuthService.can('users.delete') && (
                        <button
                          onClick={() => setUserToDelete(user)}
                          className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"
                          title="حذف الحساب"
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Active Permission Profile Badge */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 text-xs block">نظام الصلاحية المطبق:</span>
                      <strong className="text-teal-900 font-bold">
                        {user.role === 'super_admin' ? 'كامل الصلاحيات (سوبر أدمن)' : userProfile ? `آخر بروفايل طُبّق: ${userProfile.name}` : 'صلاحيات محددة يدوياً'}
                      </strong>
                    </div>

                    {canGrant && user.role !== 'super_admin' && (
                      <button
                        onClick={() => setAssigningProfileUser(user)}
                        className="px-3 py-1.5 rounded-lg bg-teal-100 hover:bg-teal-200 text-teal-950 font-bold text-xs cursor-pointer flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">swap_horiz</span>
                        <span>تغيير نظام الصلاحية</span>
                      </button>
                    )}
                  </div>

                  {/* Scopes Summary (Committees & Exams) */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-xs text-slate-500 block font-bold">اللجان المسموح بها:</span>
                      <span className="text-emerald-950 font-semibold mt-0.5 block">
                        {user.role === 'super_admin' || user.role === 'admin' || user.allCommitteesAllowed
                          ? 'كل اللجان ✓'
                          : assignedLabel || 'لا توجد لجان مسندة'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-xs text-slate-500 block font-bold">الامتحانات المصرح بها:</span>
                      <span className="text-blue-950 font-semibold mt-0.5 block">
                        {user.role === 'super_admin' || user.role === 'admin' || user.allExamsAllowed
                          ? 'كل الامتحانات ✓'
                          : user.allowedExamIds && user.allowedExamIds.length > 0
                          ? `${user.allowedExamIds.length} امتحان محدد`
                          : 'لا يفتح ملفات الامتحانات'}
                      </span>
                    </div>
                  </div>

                  {(user.role === 'sheikh' || user.role === 'committee_head') && (
                    <UserAssignmentsPanel userId={user.id} roleLabel={AuthService.getRoleLabel(user.role)} />
                  )}

                  {/* Committees and ceremonies this person is placed on (sheikhs and committee heads) */}
                  {(user.role === 'sheikh' || user.role === 'committee_head') && (
                    <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200 text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-emerald-950">
                          {placed.committees.length} لجنة · {placed.ceremonies.length} حفل
                        </span>
                        {canPlace && (
                          <button
                            type="button"
                            onClick={() => setAssigningUser(user)}
                            className="px-3 py-1.5 rounded-lg bg-brand text-white font-bold cursor-pointer flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-sm">event_available</span>
                            <span>اللجان والحفلات</span>
                          </button>
                        )}
                      </div>
                      {placed.ceremonies.length > 0 && (
                        <p className="text-slate-600">
                          الحفلات: {placed.ceremonies.map((c) => `لجنة ${c.committeeNumber}${c.ceremonyDetails?.ceremonyDate ? ` (${c.ceremonyDetails.ceremonyDate})` : ''}`).join('، ')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Super Admin Promotion / Demotion Action (Only Super Admin can do this) */}
                  {isSuperAdmin && currentUser.id !== user.id && (
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-xs text-slate-500">التحكم في رتبة السوبر أدمن:</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (user.role === 'super_admin') {
                            setDemoteTo('admin');
                            setDemotingUser(user);
                          } else {
                            void handleToggleSuperAdmin(user);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition-all flex items-center gap-1 ${
                          user.role === 'super_admin'
                            ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                            : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-300'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">
                          {user.role === 'super_admin' ? 'remove_moderator' : 'military_tech'}
                        </span>
                        <span>{user.role === 'super_admin' ? 'تنزيل من سوبر أدمن' : 'ترقية إلى سوبر أدمن'}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: PERMISSION PROFILES BUILDER (مركز بناء وتصميم أنظمة الصلاحيات) */}
      {activeTab === 'profiles' && (
        <div className="space-y-5">
          <div className="bg-gradient-to-l from-teal-50 to-teal-50 border-2 border-teal-300 p-5 rounded-3xl space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-base text-teal-950 flex items-center gap-2">
                  <span className="material-symbols-outlined text-teal-700">tune</span>
                  <span>أنظمة الصلاحيات المخصصة (Permission Profiles Builder)</span>
                </h3>
                <p className="text-xs text-teal-900 mt-1 max-w-2xl leading-relaxed">
                  البروفايل قالب جاهز: عند تطبيقه على مستخدم ينسخ الخادم صلاحياته ولجانه والامتحانات المسموح بها، والخادم هو من يطبقها. تعديل البروفايل لاحقاً لا يغيّر من طُبّق عليهم حتى يُطبَّق مرة أخرى.
                </p>
              </div>

              {canGrant && (
                <button
                  onClick={handleOpenCreateProfile}
                  className="px-5 py-2.5 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white font-black text-xs sm:text-sm cursor-pointer shadow-md flex items-center gap-1.5 active:scale-95 transition-all shrink-0"
                >
                  <span className="material-symbols-outlined text-base">add_circle</span>
                  <span>+ إنشاء نظام صلاحية جديد</span>
                </button>
              )}
            </div>
          </div>

          {/* Profiles Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {effectiveProfiles.map((prof) => {
              const assignedCount = users.filter((u) => u.profileId === prof.id).length;

              return (
                <div
                  key={prof.id}
                  className="bg-white rounded-3xl border-2 border-slate-200 hover:border-teal-300 p-6 shadow-xs hover:shadow-md transition-all space-y-4 text-right flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-black text-base text-slate-900">{prof.name}</h4>
                          {prof.isDefault && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-bold">
                              نظام أساسي
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{prof.description}</p>
                      </div>

                      <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-teal-100 text-teal-900 border border-teal-200 shrink-0">
                        {assignedCount} مستخدم
                      </span>
                    </div>

                    {/* Profile Details & Scope Matrix */}
                    <div className="py-3 space-y-2.5 text-xs">
                      {/* Permissions granted by the profile */}
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                        <span className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm text-teal-700">key</span>
                          <span>الصلاحيات:</span>
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {prof.permissions.length === 0 && <span className="text-xs text-slate-400">بدون صلاحيات إضافية</span>}
                          {prof.permissions.map((pid) => (
                            <span key={pid} className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs font-bold">
                              {customPermissions.find((cp) => cp.id === pid)?.label || pid}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Allowed Committees Scope */}
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                        <span className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm text-emerald-700">groups</span>
                          <span>نطاق اللجان الميدانية:</span>
                        </span>
                        <span className="text-xs font-semibold text-emerald-950">
                          {prof.allCommitteesAllowed
                            ? '✓ كل اللجان في كل الدورات'
                            : (prof.allowedCommitteeIds ?? []).length > 0
                            ? `مقتصر على: ${committeeLabel(prof.allowedCommitteeIds)}`
                            : 'لا توجد لجان محددة'}
                        </span>
                      </div>

                      {/* Allowed Exams Scope */}
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                        <span className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm text-blue-700">description</span>
                          <span>نطاق الامتحانات وبنك الأسئلة:</span>
                        </span>
                        <span className="text-xs font-semibold text-blue-950">
                          {prof.allExamsAllowed
                            ? '✓ مسموح بكافة الامتحانات والنماذج'
                            : prof.allowedExamIds && prof.allowedExamIds.length > 0
                            ? `مقتصر على (${prof.allowedExamIds.length}) امتحانات محددة فقط`
                            : 'لا يفتح ملفات الامتحانات'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleOpenEditProfile(prof)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-teal-100 text-slate-800 hover:text-teal-950 font-bold text-xs cursor-pointer flex items-center gap-1 transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">edit_note</span>
                      <span>تعديل هذا النظام</span>
                    </button>

                    {!prof.isDefault && (
                      <button
                        onClick={() => {
                          if (window.confirm(`هل أنت متأكد من حذف نظام الصلاحية "${prof.name}"؟`)) {
                            if (onDeleteProfile) onDeleteProfile(prof.id);
                            else AuthService.deleteProfile(prof.id);
                          }
                        }}
                        className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 cursor-pointer"
                        title="حذف هذا النظام"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 3: JOIN REQUESTS & RECRUITMENT HUB */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap pb-1">
            <button
              onClick={() => setRequestsSubFilter('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer border ${
                requestsSubFilter === 'all'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              كافة الطلبات ({joinRequests.length})
            </button>

            <button
              onClick={() => setRequestsSubFilter('pending')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer border ${
                requestsSubFilter === 'pending'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-amber-50'
              }`}
            >
              ⏳ قيد المراجعة ({pendingRequests.length})
            </button>

            <button
              onClick={() => setRequestsSubFilter('interview')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer border ${
                requestsSubFilter === 'interview'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-blue-50'
              }`}
            >
              🎙️ المقابلات والاختبارات ({interviewRequests.length})
            </button>

            <button
              onClick={() => setRequestsSubFilter('rejected')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer border ${
                requestsSubFilter === 'rejected'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-rose-50'
              }`}
            >
              ❌ المعتذر لهم ({rejectedRequests.length})
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredRequests.map((user) => (
              <div
                key={user.id}
                className={`bg-white rounded-3xl border-2 p-5 shadow-sm space-y-4 flex flex-col justify-between transition-all ${
                  user.status === 'pending'
                    ? 'border-amber-400 bg-amber-50/10'
                    : user.status === 'interview'
                    ? 'border-blue-400 bg-blue-50/10'
                    : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-lg shadow-xs ${
                          user.status === 'pending'
                            ? 'bg-amber-100 text-amber-900'
                            : user.status === 'interview'
                            ? 'bg-blue-100 text-blue-900'
                            : 'bg-rose-100 text-rose-900'
                        }`}
                      >
                        <span className="material-symbols-outlined">
                          {user.status === 'interview' ? 'mic' : user.status === 'rejected' ? 'person_cancel' : 'person_pin'}
                        </span>
                      </span>
                      <div>
                        <h4 className="font-bold text-sm sm:text-base text-slate-900">{user.name}</h4>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          <span className="font-mono text-emerald-900 font-bold">📞 {user.phone}</span>
                          {user.requestCode && (
                            <span className="font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-xs">
                              {user.requestCode}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {user.status === 'pending' && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shrink-0 animate-pulse">
                        قيد دراسة المشرف
                      </span>
                    )}
                    {user.status === 'interview' && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300 shrink-0">
                        مقابلة مجدولة
                      </span>
                    )}
                    {user.status === 'rejected' && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300 shrink-0">
                        معتذر عنه
                      </span>
                    )}
                  </div>

                  <div className="py-3 space-y-2 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                      <div>
                        <span className="text-slate-500 text-xs">مقدار حفظ القرآن: </span>
                        <strong className="text-emerald-950 font-bold">{user.quranLevel || 'حافظ لكامل القرآن'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 text-xs">الدور المرغوب: </span>
                        <strong className="text-brand font-bold">{AuthService.getRoleLabel(user.role)}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleOpenApproveModal(user)}
                    className="flex-1 py-2 px-3 rounded-xl bg-brand hover:bg-brand-deep text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer shadow-xs active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">how_to_reg</span>
                    <span>✓ قبول واعتماد</span>
                  </button>

                  <button
                    onClick={() => handleOpenInterviewModal(user)}
                    className="py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">mic</span>
                    <span>مقابلة</span>
                  </button>

                  <button
                    onClick={() => setDossierUser(user)}
                    className="py-2 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">visibility</span>
                    <span>الملف</span>
                  </button>

                  <button
                    onClick={() => handleOpenRejectModal(user)}
                    className="py-2 px-2.5 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                    <span>اعتذار</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CREATE / EDIT PERMISSION PROFILE MODAL (بناء وتصميم الصلاحية المخصصة) */}
      {isProfileModalOpen && (
        <PermissionProfileModal
          profile={editingProfile}
          committees={committees}
          exams={effectiveExams}
          customPermissions={customPermissions}
          currentUserName={currentUser.name}
          onSave={(prof) => (onSaveProfile ? onSaveProfile(prof) : AuthService.saveProfile(prof))}
          onClose={() => setIsProfileModalOpen(false)}
        />
      )}

      {/* ASSIGN PROFILE QUICK MODAL */}
      {assigningProfileUser && (
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-right">
          <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto border border-teal-200 p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-black text-base text-slate-900">
                  تطبيق نظام صلاحية على: {assigningProfileUser.name}
                </h3>
                <p className="text-xs text-slate-500">اختر البروفايل الذي تريد منحه لهذا المستخدم</p>
              </div>
              <button
                onClick={() => setAssigningProfileUser(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              {effectiveProfiles.map((prof) => {
                const isSelected = assigningProfileUser.profileId === prof.id;
                return (
                  <button
                    key={prof.id}
                    type="button"
                    disabled={saving}
                    onClick={() => void handleAssignProfileToUser(assigningProfileUser, prof.id)}
                    className={`w-full p-3 rounded-2xl border text-right cursor-pointer transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-teal-50 border-teal-500 text-teal-950 font-bold ring-2 ring-teal-200'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div>
                      <span className="block font-bold text-xs">{prof.name}</span>
                      <span className="text-xs text-slate-500">{prof.description}</span>
                    </div>
                    {isSelected && <span className="text-teal-700 font-bold">✓ المطبق حالياً</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* APPROVE APPLICANT MODAL */}
      {approvingUser && (
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto text-right">
          <div className="bg-white max-w-lg w-full rounded-3xl shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto animate-in fade-in">
            <div className="p-5 bg-gradient-to-l from-emerald-50 to-teal-50 border-b border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center font-bold shadow-xs">
                  <span className="material-symbols-outlined text-xl">how_to_reg</span>
                </span>
                <div>
                  <h3 className="font-black text-sm sm:text-base text-slate-900">
                    اعتماد وتفعيل المتقدم: {approvingUser.name}
                  </h3>
                  <p className="text-xs text-slate-500">اختر نظام الصلاحية أو حدد الصلاحيات الميدانية</p>
                </div>
              </div>
              <button
                onClick={() => setApprovingUser(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmApproval} className="p-5 space-y-4 text-xs">
              {canGrant ? (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1" htmlFor="approval-role">الدور في المنظومة:</label>
                    <select
                      id="approval-role"
                      value={approvalRole}
                      onChange={(e) => setApprovalRole(e.target.value as UserRole)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-brand outline-none"
                    >
                      <RoleOptions />
                    </select>
                    {approvingUser.role !== approvalRole && (
                      <p className="mt-1 text-slate-500">طلب المتقدم دور: {AuthService.getRoleLabel(approvingUser.role)}</p>
                    )}
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1" htmlFor="approval-profile">تطبيق بروفايل صلاحيات (اختياري):</label>
                    <select
                      id="approval-profile"
                      value={approvalProfileId}
                      onChange={(e) => setApprovalProfileId(e.target.value)}
                      className="w-full bg-teal-50 border border-teal-300 rounded-xl px-3 py-2 text-xs font-bold text-teal-950 outline-none"
                    >
                      <option value="">بدون بروفايل (حدد أدناه)</option>
                      {effectiveProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <p className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
                  يُعتمد الحساب بدور «{AuthService.getRoleLabel(approvingUser.role)}». تحديد الصلاحيات والأدوار من صلاحيات المشرف العام؛ يمكنك إسناد لجانك فقط.
                </p>
              )}

              {!approvalProfileId && (
                <>
                  {canGrant && (
                    <label className="flex items-center gap-2 font-bold cursor-pointer text-slate-800">
                      <input type="checkbox" checked={approvalAllCommittees} onChange={(e) => setApprovalAllCommittees(e.target.checked)} />
                      <span>كل اللجان في كل الدورات</span>
                    </label>
                  )}
                  {!approvalAllCommittees && (
                    <CommitteePicker
                      label="إسناد اللجان:"
                      committees={committees}
                      selectedIds={approvalCommittees}
                      onChange={setApprovalCommittees}
                      canSelect={canAssign}
                    />
                  )}

                  {canGrant && (
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                      <span className="font-bold text-slate-900 block">صلاحيات إضافية (لا شيء محدد افتراضياً):</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {customPermissions.map((perm) => (
                          <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={approvalPermissions.includes(perm.id)}
                              onChange={(e) => {
                                setApprovalPermissions((prev) =>
                                  e.target.checked ? [...prev, perm.id] : prev.filter((p) => p !== perm.id)
                                );
                              }}
                              className="rounded text-brand focus:ring-brand"
                            />
                            <span>{perm.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setApprovingUser(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 border border-slate-300 hover:bg-slate-50 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-deep text-white font-black shadow-md cursor-pointer disabled:opacity-60"
                >
                  {saving ? 'جارٍ الاعتماد…' : 'اعتماد الحساب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEMOTE SUPER ADMIN: the new role is chosen, not assumed (WEB-14) */}
      {demotingUser && (
        <div role="dialog" aria-modal="true" aria-labelledby="demote-title" className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 text-right">
          <div className="bg-white max-w-sm w-full rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto border border-rose-200 p-6 space-y-4">
            <h3 id="demote-title" className="font-black text-base text-slate-900">تنزيل {demotingUser.name} من المشرف العام</h3>
            <label className="block text-xs font-bold text-slate-700">
              الدور الجديد
              <select value={demoteTo} onChange={(e) => setDemoteTo(e.target.value as UserRole)} className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs">
                <option value="admin">أدمن</option>
                <option value="committee_head">رئيس لجنة</option>
                <option value="sheikh">شيخ</option>
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDemotingUser(null)} className="px-4 py-2 rounded-xl text-slate-600 border border-slate-300 font-bold text-xs">
                إلغاء
              </button>
              <button
                type="button"
                onClick={async () => {
                  const u = demotingUser;
                  setDemotingUser(null);
                  await handleToggleSuperAdmin(u, demoteTo);
                }}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs cursor-pointer"
              >
                تنزيل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCHEDULE INTERVIEW MODAL */}
      {interviewingUser && (
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-right">
          <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto border border-slate-200 p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-black text-sm sm:text-base text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600">event</span>
                <span>جدولة مقابلة شخصية واختبار: {interviewingUser.name}</span>
              </h3>
              <button
                onClick={() => setInterviewingUser(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmInterview} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">موعد وتوقيت المقابلة:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: الثلاثاء 6 أكتوبر الساعة 5 مساءً"
                  value={interviewDate}
                  onChange={(e) => setInterviewDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات وتعليمات المشرف للمتقدم:</label>
                <textarea
                  rows={3}
                  value={interviewNotes}
                  onChange={(e) => setInterviewNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs outline-none focus:border-blue-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setInterviewingUser(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 border border-slate-300 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black shadow-md cursor-pointer"
                >
                  حفظ وتأكيد الموعد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECTION MODAL */}
      {rejectingUser && (
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-right">
          <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto border border-rose-200 p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-black text-sm sm:text-base text-rose-950 flex items-center gap-2">
                <span className="material-symbols-outlined text-rose-600">person_cancel</span>
                <span>الاعتذار عن طلب المتقدم: {rejectingUser.name}</span>
              </h3>
              <button
                onClick={() => setRejectingUser(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmReject} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">سبب الاعتذار الموجه للمتقدم:</label>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs outline-none focus:border-rose-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectingUser(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 border border-slate-300 font-bold"
                >
                  تراجع
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black shadow-md cursor-pointer"
                >
                  تأكيد الاعتذار
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULL APPLICANT DOSSIER MODAL */}
      {dossierUser && (
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto text-right">
          <div className="bg-white max-w-lg w-full rounded-3xl shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto animate-in fade-in">
            <div className="p-5 bg-gradient-to-l from-slate-900 to-slate-800 text-white flex items-center justify-between">
              <div>
                <h3 className="font-black text-base">ملف وسيرة المتقدم: {dossierUser.name}</h3>
                <span className="text-xs text-slate-300 font-mono">
                  كود الطلب: {dossierUser.requestCode || '—'} • تاريخ التقديم: {dossierUser.createdAt}
                </span>
              </div>
              <button
                onClick={() => setDossierUser(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-slate-500 block text-xs">رقم الجوال:</span>
                  <strong className="font-mono text-slate-900 font-bold">{dossierUser.phone}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">الواتساب:</span>
                  <strong className="font-mono text-slate-900 font-bold">{dossierUser.whatsapp || dossierUser.phone}</strong>
                </div>
              </div>

              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="font-bold text-emerald-950 block text-xs">مقدار حفظ القرآن الكريم والإجازات:</span>
                  <p className="text-emerald-900 font-semibold mt-0.5">{dossierUser.quranLevel || 'حافظ لكامل القرآن'}</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="font-bold text-slate-700 block text-xs">المؤهل العلمي والتخصص:</span>
                  <p className="text-slate-900 mt-0.5">{dossierUser.qualification || 'شريعة / دراسات إسلامية'}</p>
                </div>
              </div>

              <div className="pt-3 border-t flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">print</span>
                  <span>طباعة الملف</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDossierUser(null);
                    handleOpenApproveModal(dossierUser);
                  }}
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-deep text-white font-black shadow-md cursor-pointer"
                >
                  قبول واعتماد الآن
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DIRECT ADD USER MODAL */}
      {isAddModalOpen && (
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto text-right">
          <div className="bg-white max-w-lg w-full rounded-3xl shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto animate-in fade-in">
            <div className="p-5 bg-gradient-to-l from-emerald-50 to-teal-50 border-b border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center font-bold shadow-xs">
                  <span className="material-symbols-outlined text-xl">person_add</span>
                </span>
                <div>
                  <h3 className="font-black text-sm sm:text-base text-slate-900">إضافة وتفعيل مستخدم مباشر</h3>
                  <p className="text-xs text-slate-500">تفعيل فوري وتطبيق نظام الصلاحيات</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">الاسم الرباعي <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="الاسم الكامل..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  كلمة المرور الأولية <span className="text-rose-500">*</span>
                  <span className="font-normal text-slate-500"> (8 أحرف على الأقل، حروف وأرقام؛ أبلغها للمستخدم ليغيرها بعد الدخول)</span>
                </label>
                <input
                  type="text"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand font-mono text-left"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم الجوال <span className="text-rose-500">*</span></label>
                  <input
                    type="tel"
                    required
                    placeholder="05xxxxxxxx"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand font-mono text-left"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الدور الوظيفي</label>
                  <select
                    value={canGrant ? newRole : 'sheikh'}
                    disabled={!canGrant}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-brand outline-none disabled:opacity-70"
                  >
                    <RoleOptions />
                  </select>
                </div>
              </div>

              {canGrant && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تطبيق بروفايل صلاحيات (اختياري):</label>
                  <select
                    value={newProfileId}
                    onChange={(e) => setNewProfileId(e.target.value)}
                    className="w-full bg-teal-50 border border-teal-300 rounded-xl px-3 py-2 text-xs font-bold text-teal-950 outline-none"
                  >
                    <option value="">بدون بروفايل</option>
                    {effectiveProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {canGrant && !newProfileId && (
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                  <span className="font-bold text-slate-900 block">الصلاحيات:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {customPermissions.map((perm) => (
                      <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newPermissions.includes(perm.id)}
                          onChange={(e) => setNewPermissions((prev) => (e.target.checked ? [...prev, perm.id] : prev.filter((x) => x !== perm.id)))}
                          className="rounded text-brand focus:ring-brand"
                        />
                        <span>{perm.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {!newProfileId && (
                <CommitteePicker
                  label="اللجان المسندة:"
                  committees={committees}
                  selectedIds={newAssignedCommittees}
                  onChange={setNewAssignedCommittees}
                  canSelect={canAssign}
                />
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 border border-slate-300 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-deep text-white font-black shadow-md cursor-pointer"
                >
                  حفظ وتفعيل الحساب فوراً
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {editingUser && (
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto text-right">
          <div className="bg-white max-w-lg w-full rounded-3xl shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto animate-in fade-in">
            <div className="p-5 bg-gradient-to-l from-slate-100 to-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-black text-base text-slate-900">تعديل بيانات وصلاحيات: {editingUser.name}</h3>
              <button
                onClick={() => setEditingUser(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الاسم الكامل</label>
                  <input
                    type="text"
                    required
                    value={editingUser.name}
                    onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم الهاتف</label>
                  <input
                    type="tel"
                    required
                    value={editingUser.phone}
                    onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand font-mono text-left"
                  />
                </div>
              </div>

              {editAccess && editingUser.id !== currentUser.id && editingUser.role !== 'super_admin' && (
                <>
                  {canGrant && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1" htmlFor="edit-role">الدور في المنظومة</label>
                        <select
                          id="edit-role"
                          value={editAccess.role}
                          disabled={Boolean(editAccess.profileId)}
                          onChange={(e) => setEditAccess({ ...editAccess, role: e.target.value as UserRole })}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-brand outline-none"
                        >
                          <RoleOptions />
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1" htmlFor="edit-profile">تطبيق بروفايل</label>
                        <select
                          id="edit-profile"
                          value={editAccess.profileId}
                          onChange={(e) => setEditAccess({ ...editAccess, profileId: e.target.value })}
                          className="w-full bg-teal-50 border border-teal-300 rounded-xl px-3 py-2 text-xs font-bold text-teal-950 outline-none"
                        >
                          <option value="">بدون (تعديل يدوي أدناه)</option>
                          {effectiveProfiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {!editAccess.profileId && (
                    <>
                      {canGrant && (
                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                          <span className="font-bold text-slate-900 block">الصلاحيات:</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {customPermissions.map((perm) => (
                              <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editAccess.permissions.includes(perm.id)}
                                  onChange={(e) =>
                                    setEditAccess({
                                      ...editAccess,
                                      permissions: e.target.checked
                                        ? [...editAccess.permissions, perm.id]
                                        : editAccess.permissions.filter((x) => x !== perm.id),
                                    })
                                  }
                                  className="rounded text-brand focus:ring-brand"
                                />
                                <span>{perm.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {canGrant && (
                        <label className="flex items-center gap-2 font-bold cursor-pointer text-slate-800">
                          <input type="checkbox" checked={editAccess.allCommittees} onChange={(e) => setEditAccess({ ...editAccess, allCommittees: e.target.checked })} />
                          <span>كل اللجان في كل الدورات</span>
                        </label>
                      )}
                      {!editAccess.allCommittees && (
                        <CommitteePicker
                          label="اللجان المسندة:"
                          committees={committees}
                          selectedIds={editAccess.committeeIds}
                          onChange={(ids) => setEditAccess({ ...editAccess, committeeIds: ids })}
                          canSelect={canAssign}
                        />
                      )}

                      {/* Which exams this person opens: committee heads, and anyone given «الامتحانات ونماذج الـ PDF». */}
                      {canGrant && (editAccess.role === 'committee_head' || editAccess.permissions.includes('exams_pdf')) && (
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 font-bold cursor-pointer text-slate-800">
                            <input type="checkbox" checked={editAccess.allExams} onChange={(e) => setEditAccess({ ...editAccess, allExams: e.target.checked })} />
                            <span>يفتح كل ملفات الامتحانات</span>
                          </label>
                          {!editAccess.allExams && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                              {effectiveExams.map((ex) => (
                                <label key={ex.id} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={editAccess.examIds.includes(ex.id)}
                                    onChange={(e) =>
                                      setEditAccess({
                                        ...editAccess,
                                        examIds: e.target.checked ? [...editAccess.examIds, ex.id] : editAccess.examIds.filter((x) => x !== ex.id),
                                      })
                                    }
                                  />
                                  <span>{ex.title}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {canGrant && onResetPassword && editingUser.id !== currentUser.id && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                  <span className="font-bold text-amber-950 block">إعادة تعيين كلمة المرور</span>
                  <p className="text-amber-900">
                    كلمة مؤقتة يستخدمها مرة واحدة؛ يُطلب منه اختيار كلمة جديدة عند الدخول، وتُنهى جلساته الحالية.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      aria-label="كلمة المرور المؤقتة"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      minLength={8}
                      placeholder="8 أحرف على الأقل، حروف وأرقام"
                      className="flex-1 bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-mono"
                    />
                    <button type="button" onClick={() => setResetPassword(generateTemporaryPassword())} className="px-3 py-2 rounded-xl border border-amber-300 bg-white font-bold cursor-pointer">
                      توليد
                    </button>
                    <button
                      type="button"
                      disabled={saving || resetPassword.length < 8}
                      onClick={() => void handleResetPassword()}
                      className="px-3 py-2 rounded-xl bg-amber-600 text-white font-bold cursor-pointer disabled:opacity-50"
                    >
                      إعادة التعيين
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 border border-slate-300 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-deep text-white font-black shadow-md cursor-pointer disabled:opacity-60"
                >
                  {saving ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {userToDelete && (
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-right">
          <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto border border-rose-200 p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center gap-3 border-b border-rose-100 pb-3">
              <span className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold">
                <span className="material-symbols-outlined">delete_forever</span>
              </span>
              <div>
                <h3 className="font-black text-base text-rose-950">تأكيد حذف الحساب</h3>
                <p className="text-xs text-rose-700">{userToDelete.name}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              هل أنت متأكد من رغبتك في حذف حساب <strong>{userToDelete.name}</strong> نهائياً وسحب كافة صلاحياته؟
            </p>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl text-slate-600 border border-slate-300 font-bold text-xs"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteAssistant(userToDelete.id);
                  setUserToDelete(null);
                }}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md cursor-pointer"
              >
                حذف نهائي
              </button>
            </div>
          </div>
        </div>
      )}

      {assigningUser && (
        <PersonAssignmentsModal
          user={assigningUser}
          committees={committees}
          onClose={() => setAssigningUser(null)}
          onChanged={(c) => onCommitteeChanged?.(c)}
        />
      )}
    </div>
  );
};
