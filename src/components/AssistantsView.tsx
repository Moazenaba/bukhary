import React, { useState } from 'react';
import {
  AppUser,
  AssistantPermission,
  Committee,
  PermissionDefinition,
  UserRole,
  PermissionProfile,
  ExamItem,
} from '../types';
import { AuthService } from '../services/AuthService';

interface AssistantsViewProps {
  users: AppUser[];
  committees: Committee[];
  exams?: ExamItem[];
  currentUser: AppUser;
  profiles?: PermissionProfile[];
  onSaveProfile?: (profile: PermissionProfile) => void;
  onDeleteProfile?: (profileId: string) => void;
  onAssignProfile?: (userId: string, profileId: string) => void;
  onSetSuperAdmin?: (userId: string, isSuper: boolean) => Promise<{ success: boolean; message: string }>;
  onApproveAssistant: (
    userId: string,
    permissions: AssistantPermission[],
    assignedCommittees: number[],
    role?: UserRole
  ) => void;
  onScheduleInterview?: (userId: string, date: string, notes?: string) => void;
  onRejectAssistant: (userId: string, reason?: string) => void;
  onUpdateAssistantPermissions: (
    userId: string,
    permissions: AssistantPermission[],
    assignedCommittees: number[]
  ) => void;
  onUpdateAssistantUser: (updatedUser: AppUser) => void;
  onAddAssistantDirect: (user: Omit<AppUser, 'id' | 'createdAt'> & { password: string }) => unknown;
  onDeleteAssistant: (userId: string) => void;
  onOpenAuthModal: () => void;
  onOpenCommitteeDetails?: (committee: Committee) => void;
  customPermissions: PermissionDefinition[];
  onAddCustomPermission: (label: string) => void;
  onDeleteCustomPermission: (id: string) => void;
}

export const AssistantsView: React.FC<AssistantsViewProps> = ({
  users,
  committees,
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
  onUpdateAssistantPermissions,
  onUpdateAssistantUser,
  onAddAssistantDirect,
  onDeleteAssistant,
  onOpenAuthModal,
  onOpenCommitteeDetails,
  customPermissions,
  onAddCustomPermission,
  onDeleteCustomPermission,
}) => {
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

  // Profile Builder Modal State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<PermissionProfile | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileDescription, setProfileDescription] = useState('');
  const [profileBadgeColor, setProfileBadgeColor] = useState<'emerald' | 'blue' | 'purple' | 'amber' | 'rose' | 'teal'>('emerald');
  const [profileAllowedTabs, setProfileAllowedTabs] = useState<string[]>([
    'summer_course',
    'committees',
    'daily_alerts',
  ]);
  const [profileAllCommittees, setProfileAllCommittees] = useState(true);
  const [profileAllowedCommittees, setProfileAllowedCommittees] = useState<number[]>([]);
  const [profileAllExams, setProfileAllExams] = useState(true);
  const [profileAllowedExamIds, setProfileAllowedExamIds] = useState<string[]>([]);
  const [profilePermissions, setProfilePermissions] = useState<AssistantPermission[]>([
    'database_sheets',
    'manage_committees',
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [superAdminAlert, setSuperAdminAlert] = useState<string | null>(null);

  // Interview state
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewNotes, setInterviewNotes] = useState('يرجى الحضور لمقر إدارة لجان المسابقة لإجراء اختبار حفظ القرآن والمقابلة الشخصية.');

  // Rejection state
  const [rejectionReason, setRejectionReason] = useState('نعتذر عن قبول الطلب حالياً لاكتمال النصاب المطلوب في لجان هذه الدورة، مع تمنياتنا بالتوفيق في الدورات القادمة.');

  // Approval modal custom state
  const [approvalRole, setApprovalRole] = useState<UserRole>('assistant');
  const [approvalProfileId, setApprovalProfileId] = useState<string>('');
  const [approvalPermissions, setApprovalPermissions] = useState<AssistantPermission[]>([
    'database_sheets',
    'manage_committees',
    'calendar_schedule',
  ]);
  const [approvalCommittees, setApprovalCommittees] = useState<number[]>([]);

  // Form state for adding direct assistant
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('assistant');
  const [newProfileId, setNewProfileId] = useState<string>('');
  const [newPermissions, setNewPermissions] = useState<AssistantPermission[]>([]);
  const [newAssignedCommittees, setNewAssignedCommittees] = useState<number[]>([]);

  // Available All Tabs Meta
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
    { id: 'assistants', label: 'المعاونون والصلاحيات', icon: 'badge', desc: 'إدارة المستخدمين وبناء الصلاحيات (للسوبر أدمن)' },
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
    setProfileName('');
    setProfileDescription('');
    setProfileBadgeColor('emerald');
    setProfileAllowedTabs(['summer_course', 'committees', 'daily_alerts']);
    setProfileAllCommittees(true);
    setProfileAllowedCommittees([1, 2]);
    setProfileAllExams(true);
    setProfileAllowedExamIds([]);
    setProfilePermissions(['database_sheets', 'manage_committees']);
    setIsProfileModalOpen(true);
  };

  const handleOpenEditProfile = (profile: PermissionProfile) => {
    setEditingProfile(profile);
    setProfileName(profile.name);
    setProfileDescription(profile.description);
    setProfileBadgeColor(profile.badgeColor || 'emerald');
    setProfileAllowedTabs(profile.allowedTabs || ['summer_course', 'committees']);
    setProfileAllCommittees(Boolean(profile.allCommitteesAllowed));
    setProfileAllowedCommittees(profile.allowedCommittees || []);
    setProfileAllExams(Boolean(profile.allExamsAllowed));
    setProfileAllowedExamIds(profile.allowedExamIds || []);
    setProfilePermissions(profile.permissions || []);
    setIsProfileModalOpen(true);
  };

  const handleSaveProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) return;

    const newProf: PermissionProfile = {
      id: editingProfile ? editingProfile.id : `profile_${Date.now()}`,
      name: profileName.trim(),
      description: profileDescription.trim(),
      badgeColor: profileBadgeColor,
      allowedTabs: profileAllowedTabs,
      allowedCommittees: profileAllCommittees ? [] : profileAllowedCommittees,
      allCommitteesAllowed: profileAllCommittees,
      allowedExamIds: profileAllExams ? [] : profileAllowedExamIds,
      allExamsAllowed: profileAllExams,
      permissions: profilePermissions,
      createdAt: editingProfile ? editingProfile.createdAt : new Date().toLocaleDateString('ar-EG'),
      createdBy: currentUser.name,
      isDefault: editingProfile ? editingProfile.isDefault : false,
    };

    if (onSaveProfile) {
      onSaveProfile(newProf);
    } else {
      AuthService.saveProfile(newProf);
    }

    setIsProfileModalOpen(false);
  };

  const handleToggleSuperAdmin = async (targetUser: AppUser) => {
    if (!isSuperAdmin) {
      alert('عذراً، فقط المشرف العام (سوبر أدمن) يملك صلاحية تغيير رتبة السوبر أدمن.');
      return;
    }

    const willBeSuper = targetUser.role !== 'super_admin';
    const result = await (onSetSuperAdmin
      ? onSetSuperAdmin(targetUser.id, willBeSuper)
      : AuthService.setSuperAdmin(targetUser.id, willBeSuper));

    if (!result.success) {
      setSuperAdminAlert(result.message);
      setTimeout(() => setSuperAdminAlert(null), 5000);
    } else {
      setSuperAdminAlert(result.message);
      setTimeout(() => setSuperAdminAlert(null), 4000);
    }
  };

  const handleAssignProfileToUser = (targetUser: AppUser, profileId: string) => {
    if (onAssignProfile) {
      onAssignProfile(targetUser.id, profileId);
    } else {
      AuthService.assignProfileToUser(targetUser.id, profileId);
    }
    const prof = effectiveProfiles.find((p) => p.id === profileId);
    if (prof && onUpdateAssistantUser) {
      onUpdateAssistantUser({
        ...targetUser,
        profileId,
        permissions: prof.permissions,
        assignedCommittees: prof.allCommitteesAllowed ? [] : prof.allowedCommittees,
        allCommitteesAllowed: prof.allCommitteesAllowed,
        allowedExamIds: prof.allowedExamIds,
        allExamsAllowed: prof.allExamsAllowed,
      });
    }
    setAssigningProfileUser(null);
  };

  const handleOpenApproveModal = (user: AppUser) => {
    setApprovingUser(user);
    setApprovalRole(user.role || 'assistant');
    setApprovalProfileId(user.profileId || '');
    setApprovalPermissions(
      user.permissions && user.permissions.length > 0
        ? user.permissions
        : ['database_sheets', 'manage_committees', 'calendar_schedule']
    );
    setApprovalCommittees(
      user.assignedCommittees && user.assignedCommittees.length > 0
        ? user.assignedCommittees
        : user.preferredCommittees && user.preferredCommittees.length > 0
        ? user.preferredCommittees
        : [1]
    );
  };

  const handleConfirmApproval = (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvingUser) return;

    if (approvalProfileId) {
      const prof = effectiveProfiles.find((p) => p.id === approvalProfileId);
      if (prof) {
        onApproveAssistant(
          approvingUser.id,
          prof.permissions,
          prof.allCommitteesAllowed ? [] : prof.allowedCommittees,
          approvalRole
        );
        handleAssignProfileToUser(approvingUser, approvalProfileId);
        setApprovingUser(null);
        return;
      }
    }

    onApproveAssistant(
      approvingUser.id,
      approvalPermissions,
      approvalCommittees,
      approvalRole
    );
    setApprovingUser(null);
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

    let perms = newPermissions;
    let comms = newAssignedCommittees;
    let allComms = true;
    let examIds: string[] = [];
    let allExams = true;

    if (newProfileId) {
      const prof = effectiveProfiles.find((p) => p.id === newProfileId);
      if (prof) {
        perms = prof.permissions;
        comms = prof.allCommitteesAllowed ? [] : prof.allowedCommittees;
        allComms = prof.allCommitteesAllowed;
        examIds = prof.allowedExamIds || [];
        allExams = prof.allExamsAllowed;
      }
    }

    const created = await onAddAssistantDirect({
      password: newPassword,
      name: newName.trim(),
      phone: newPhone.trim(),
      email: newEmail.trim(),
      role: newRole,
      profileId: newProfileId || undefined,
      status: 'approved',
      assignedCommittees: comms,
      allCommitteesAllowed: allComms,
      allowedExamIds: examIds,
      allExamsAllowed: allExams,
      permissions: perms,
      notes: newNotes.trim() || undefined,
    });
    if (!created) return;

    setIsAddModalOpen(false);
    setNewName('');
    setNewPhone('');
    setNewEmail('');
    setNewPassword('');
    setNewNotes('');
    setNewAssignedCommittees([]);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    let updated = { ...editingUser };
    if (updated.profileId) {
      const prof = effectiveProfiles.find((p) => p.id === updated.profileId);
      if (prof) {
        updated.permissions = prof.permissions;
        updated.assignedCommittees = prof.allCommitteesAllowed ? [] : prof.allowedCommittees;
        updated.allCommitteesAllowed = prof.allCommitteesAllowed;
        updated.allowedExamIds = prof.allowedExamIds || [];
        updated.allExamsAllowed = prof.allExamsAllowed;
      }
    }
    onUpdateAssistantUser(updated);
    setEditingUser(null);
  };

  return (
    <div className="space-y-6 text-right font-sans">
      {/* Header Banner */}
      <div className="bg-gradient-to-l from-brand via-emerald-800 to-brand-deep rounded-3xl p-6 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="p-2 rounded-2xl bg-white/20 text-white shadow-inner">
              <span className="material-symbols-outlined text-2xl">admin_panel_settings</span>
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-wide">
              نظام الصلاحيات والأدوار وإدارة الكوادر
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-emerald-100 max-w-2xl leading-relaxed">
            التحكم المركزي في الصلاحيات والأدوار. يتيح للسوبر أدمن إنشاء أنظمة صلاحية مخصصة، تحديد الصفحات واللجان والامتحانات المتاحة لكل مستخدم بدقة متناهية.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {isSuperAdmin && (
            <button
              onClick={handleOpenCreateProfile}
              className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-amber-950 font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-lg">add_moderator</span>
              <span>+ إنشاء نظام صلاحية جديد</span>
            </button>
          )}

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs sm:text-sm border border-white/30 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">person_add</span>
            <span>+ إضافة مستخدم</span>
          </button>

          <button
            onClick={onOpenAuthModal}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-black/20 hover:bg-black/30 text-emerald-200 border border-emerald-400/30 text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-lg">sync_alt</span>
            <span>تبديل الحساب</span>
          </button>
        </div>
      </div>

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

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setActiveTab('approved')}
          className={`bg-white p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between shadow-2xs ${
            activeTab === 'approved' ? 'border-brand ring-2 ring-emerald-200' : 'border-slate-200'
          }`}
        >
          <div>
            <span className="text-xs text-slate-500 block font-bold">المستخدمون المعتمدون</span>
            <span className="text-2xl font-black text-emerald-800 font-mono">{approvedUsers.length}</span>
          </div>
          <span className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">group</span>
          </span>
        </div>

        <div
          onClick={() => setActiveTab('profiles')}
          className={`bg-white p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between shadow-2xs ${
            activeTab === 'profiles' ? 'border-teal-600 ring-2 ring-teal-200 bg-teal-50/20' : 'border-slate-200'
          }`}
        >
          <div>
            <span className="text-xs text-teal-900 block font-bold">أنظمة الصلاحيات المخصصة</span>
            <span className="text-2xl font-black text-teal-700 font-mono">{effectiveProfiles.length}</span>
          </div>
          <span className="w-11 h-11 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">tune</span>
          </span>
        </div>

        <div
          onClick={() => {
            setActiveTab('requests');
            setRequestsSubFilter('pending');
          }}
          className={`bg-white p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between shadow-2xs ${
            pendingRequests.length > 0 ? 'border-amber-400 bg-amber-50/40 ring-2 ring-amber-300' : 'border-slate-200'
          }`}
        >
          <div>
            <span className="text-xs text-amber-900 block font-bold">طلبات انضمام معلقة</span>
            <span className="text-2xl font-black text-amber-600 font-mono">{pendingRequests.length}</span>
          </div>
          <span className="w-11 h-11 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">pending_actions</span>
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-xs text-slate-500 block font-bold">المشرفون العامون (سوبر أدمن)</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-2xl font-black text-slate-900 font-mono">{superAdminsCount}</span>
              <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-bold">
                أقصى حد (2)
              </span>
            </div>
          </div>
          <span className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">military_tech</span>
          </span>
        </div>
      </div>

      {/* Main Tabs Navigation Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveTab('approved')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'approved'
                ? 'bg-brand text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
            }`}
          >
            <span className="material-symbols-outlined text-base">manage_accounts</span>
            <span>المستخدمون وتعيين الأدوار</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-white/20 text-white font-mono">
              {approvedUsers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('profiles')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'profiles'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-teal-50'
            }`}
          >
            <span className="material-symbols-outlined text-base">tune</span>
            <span>مركز بناء وتصميم أنظمة الصلاحيات</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-teal-200 text-teal-950 font-mono font-bold">
              {effectiveProfiles.length} نظام
            </span>
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'requests'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-amber-50'
            }`}
          >
            <span className="material-symbols-outlined text-base">how_to_reg</span>
            <span>طلبات الانضمام والمقابلات</span>
            {pendingRequests.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-amber-200 text-amber-950 font-mono font-black animate-pulse">
                {pendingRequests.length} جديد
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
              const assignedComms = committees.filter((c) =>
                user.assignedCommittees.includes(c.committeeNumber)
              );

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
                      <button
                        onClick={() => setEditingUser(user)}
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                        title="تعديل البيانات والصلاحيات"
                      >
                        <span className="material-symbols-outlined text-base">edit</span>
                      </button>
                      {user.role !== 'super_admin' && (
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
                        {userProfile ? userProfile.name : user.role === 'super_admin' ? 'كامل الصلاحيات (سوبر أدمن)' : 'صلاحيات مخصصة يدوياً'}
                      </strong>
                    </div>

                    {isSuperAdmin && (
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
                        {user.role === 'super_admin' || user.allCommitteesAllowed
                          ? 'كافة اللجان العامة ✓'
                          : assignedComms.length > 0
                          ? assignedComms.map((c) => `#${c.committeeNumber}`).join('، ')
                          : 'لا توجد لجان مسندة'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-xs text-slate-500 block font-bold">الامتحانات المصرح بها:</span>
                      <span className="text-blue-950 font-semibold mt-0.5 block">
                        {user.role === 'super_admin' || user.allExamsAllowed
                          ? 'كافة الامتحانات ✓'
                          : user.allowedExamIds && user.allowedExamIds.length > 0
                          ? `${user.allowedExamIds.length} امتحان محدد`
                          : 'كافة الامتحانات المعتمدة'}
                      </span>
                    </div>
                  </div>

                  {/* Super Admin Promotion / Demotion Action (Only Super Admin can do this) */}
                  {isSuperAdmin && currentUser.id !== user.id && (
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-xs text-slate-500">التحكم في رتبة السوبر أدمن:</span>
                      <button
                        type="button"
                        onClick={() => handleToggleSuperAdmin(user)}
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
                  يمكن للسوبر أدمن إنشاء أي بروفايل صلاحية جديد، وتحديد التابات المفتوحة، اللجان المسموح بها، والامتحانات التي يستطيع المستخدم الدخول على تفاصيلها وتصحيحها فقط.
                </p>
              </div>

              {isSuperAdmin && (
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
                      {/* Allowed Pages / Tabs */}
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                        <span className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm text-teal-700">visibility</span>
                          <span>الصفحات والتابات المفتوحة للمستخدم:</span>
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {prof.allowedTabs.map((tId) => {
                            const tabMeta = ALL_SYSTEM_TABS.find((t) => t.id === tId);
                            return (
                              <span
                                key={tId}
                                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs font-bold"
                              >
                                {tabMeta?.label || tId}
                              </span>
                            );
                          })}
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
                            ? '✓ مسموح بكافة اللجان العامة دون استثناء'
                            : prof.allowedCommittees && prof.allowedCommittees.length > 0
                            ? `مقتصر على اللجان: (${prof.allowedCommittees.map((c) => `#${c}`).join('، ')}) فقط`
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
                            : 'كافة الامتحانات المعتمدة'}
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
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto text-right">
          <div className="bg-white max-w-2xl w-full rounded-3xl shadow-2xl border border-teal-200 overflow-hidden animate-in fade-in">
            <div className="p-5 bg-gradient-to-l from-teal-700 to-teal-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-2xl bg-white/20 text-white flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-2xl">tune</span>
                </span>
                <div>
                  <h3 className="font-black text-base sm:text-lg">
                    {editingProfile ? `تعديل نظام الصلاحية: ${editingProfile.name}` : 'إنشاء وتصميم نظام صلاحية مخصص جديد'}
                  </h3>
                  <p className="text-xs text-teal-200">
                    حدد التابات واللجان والامتحانات المصرح بها بدقة متناهية
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsProfileModalOpen(false)}
                className="w-8 h-8 rounded-lg text-white/80 hover:text-white flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProfileSubmit} className="p-6 space-y-5 text-xs max-h-[80vh] overflow-y-auto">
              {/* Profile Name & Description */}
              <div className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <h4 className="font-bold text-xs text-slate-900 flex items-center gap-1.5 border-b pb-2">
                  <span className="material-symbols-outlined text-sm text-teal-700">badge</span>
                  <span>١. اسم نظام الصلاحية ووصفه:</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      اسم الصلاحية <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: مصحح متن الجزرية ولجان #1 و #2"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-teal-600 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">اللون المميز للشارة</label>
                    <select
                      value={profileBadgeColor}
                      onChange={(e) => setProfileBadgeColor(e.target.value as any)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-teal-600 font-bold"
                    >
                      <option value="emerald">أخضر زمردي (Emerald)</option>
                      <option value="blue">أزرق ملكي (Blue)</option>
                      <option value="purple">بنفسجي (Purple)</option>
                      <option value="amber">كهرماني (Amber)</option>
                      <option value="rose">وردي (Rose)</option>
                      <option value="teal">تيل مائي (Teal)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">الوصف والمهام المحددة لهذا النظام</label>
                    <input
                      type="text"
                      placeholder="وصف مختصر لما يفتحه هذا النظام..."
                      value={profileDescription}
                      onChange={(e) => setProfileDescription(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-teal-600"
                    />
                  </div>
                </div>
              </div>

              {/* Allowed View Tabs Checklist (الصفحات والتابات المفتوحة) */}
              <div className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <h4 className="font-bold text-xs text-slate-900 flex items-center gap-1.5 border-b pb-2">
                  <span className="material-symbols-outlined text-sm text-teal-700">visibility</span>
                  <span>٢. الصفحات والتابات المصرح للمستخدم برؤيتها والدخول عليها:</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ALL_SYSTEM_TABS.map((tab) => {
                    const isChecked = profileAllowedTabs.includes(tab.id);
                    return (
                      <label
                        key={tab.id}
                        className={`p-2.5 rounded-xl border cursor-pointer flex items-center gap-2.5 transition-all ${
                          isChecked
                            ? 'bg-teal-50 border-teal-300 text-teal-950 font-bold'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            setProfileAllowedTabs((prev) =>
                              e.target.checked ? [...prev, tab.id] : prev.filter((id) => id !== tab.id)
                            );
                          }}
                          className="rounded text-teal-600 focus:ring-teal-600"
                        />
                        <div>
                          <span className="block text-xs">{tab.label}</span>
                          <span className="text-xs text-slate-400 font-normal">{tab.desc}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Allowed Committees Scope (نطاق اللجان الميدانية) */}
              <div className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <h4 className="font-bold text-xs text-slate-900 flex items-center gap-1.5 border-b pb-2">
                  <span className="material-symbols-outlined text-sm text-teal-700">groups</span>
                  <span>٣. نطاق اللجان الميدانية المصرح بها:</span>
                </h4>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 font-bold cursor-pointer text-slate-800">
                    <input
                      type="radio"
                      name="allCommittees"
                      checked={profileAllCommittees}
                      onChange={() => setProfileAllCommittees(true)}
                    />
                    <span>سماح بكافة اللجان العامة (الكل)</span>
                  </label>

                  <label className="flex items-center gap-2 font-bold cursor-pointer text-slate-800">
                    <input
                      type="radio"
                      name="allCommittees"
                      checked={!profileAllCommittees}
                      onChange={() => setProfileAllCommittees(false)}
                    />
                    <span>تحديد لجان معينة فقط</span>
                  </label>
                </div>

                {!profileAllCommittees && (
                  <div className="pt-2 flex flex-wrap gap-1.5">
                    {committees.map((c) => {
                      const isSelected = profileAllowedCommittees.includes(c.committeeNumber);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setProfileAllowedCommittees((prev) =>
                              isSelected
                                ? prev.filter((num) => num !== c.committeeNumber)
                                : [...prev, c.committeeNumber].sort((a, b) => a - b)
                            );
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-teal-700 text-white border-teal-700'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          لجنة #{c.committeeNumber}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Allowed Exams Scope (نطاق الامتحانات المصرح بها) */}
              <div className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <h4 className="font-bold text-xs text-slate-900 flex items-center gap-1.5 border-b pb-2">
                  <span className="material-symbols-outlined text-sm text-teal-700">description</span>
                  <span>٤. نطاق الامتحانات وبنك الأسئلة المصرح بالدخول عليها وتصحيحها:</span>
                </h4>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 font-bold cursor-pointer text-slate-800">
                    <input
                      type="radio"
                      name="allExams"
                      checked={profileAllExams}
                      onChange={() => setProfileAllExams(true)}
                    />
                    <span>سماح بكافة الامتحانات</span>
                  </label>

                  <label className="flex items-center gap-2 font-bold cursor-pointer text-slate-800">
                    <input
                      type="radio"
                      name="allExams"
                      checked={!profileAllExams}
                      onChange={() => setProfileAllExams(false)}
                    />
                    <span>تحديد امتحانات معينة فقط (مصحح لامتحان محدد)</span>
                  </label>
                </div>

                {!profileAllExams && (
                  <div className="pt-2 space-y-2">
                    {effectiveExams.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {effectiveExams.map((ex) => {
                          const isSelected = profileAllowedExamIds.includes(ex.id);
                          return (
                            <label
                              key={ex.id}
                              className={`p-2.5 rounded-xl border cursor-pointer flex items-center gap-2 transition-all ${
                                isSelected
                                  ? 'bg-blue-50 border-blue-400 text-blue-950 font-bold'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  setProfileAllowedExamIds((prev) =>
                                    e.target.checked ? [...prev, ex.id] : prev.filter((id) => id !== ex.id)
                                  );
                                }}
                                className="rounded text-blue-600 focus:ring-blue-600"
                              />
                              <div>
                                <span className="block text-xs">{ex.title}</span>
                                <span className="text-xs text-slate-400 font-normal">الكتاب: {ex.book}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">لا توجد امتحانات مسجلة في بنك الامتحانات حالياً.</span>
                    )}
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-slate-600 border border-slate-300 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-black shadow-md cursor-pointer"
                >
                  حفظ وتثبيت نظام الصلاحية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ASSIGN PROFILE QUICK MODAL */}
      {assigningProfileUser && (
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-right">
          <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl border border-teal-200 p-6 space-y-4 animate-in fade-in">
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
                    onClick={() => handleAssignProfileToUser(assigningProfileUser, prof.id)}
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
          <div className="bg-white max-w-lg w-full rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in">
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
              <div>
                <label className="block font-bold text-slate-700 mb-1">المسمى والدور في المنظومة:</label>
                <select
                  value={approvalRole}
                  onChange={(e) => setApprovalRole(e.target.value as UserRole)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-brand outline-none"
                >
                  <option value="assistant">معاون ميداني معتمد</option>
                  <option value="teacher">معلم ومقرئ معتمد</option>
                  <option value="committee_head">رئيس لجنة ومقرئ</option>
                  <option value="auditor">مراجع ومدقق جودة</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">اختر نظام الصلاحية المخصص المطبق:</label>
                <select
                  value={approvalProfileId}
                  onChange={(e) => setApprovalProfileId(e.target.value)}
                  className="w-full bg-teal-50 border border-teal-300 rounded-xl px-3 py-2 text-xs font-bold text-teal-950 outline-none"
                >
                  <option value="">صلاحيات مخصصة يدوياً (حسب الاختيارات أدناه)</option>
                  {effectiveProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {!approvalProfileId && (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1.5">إسناد اللجان الميدانية:</label>
                    <div className="flex flex-wrap gap-1.5">
                      {committees.map((c) => {
                        const isSelected = approvalCommittees.includes(c.committeeNumber);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setApprovalCommittees((prev) =>
                                prev.includes(c.committeeNumber)
                                  ? prev.filter((n) => n !== c.committeeNumber)
                                  : [...prev, c.committeeNumber].sort((a, b) => a - b)
                              );
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                              isSelected
                                ? 'bg-brand text-white border-brand'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            لجنة #{c.committeeNumber}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                    <span className="font-bold text-slate-900 block">الصلاحيات الممنوحة:</span>
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
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-deep text-white font-black shadow-md cursor-pointer"
                >
                  اعتماد وتفعيل الصلاحيات فوراً
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SCHEDULE INTERVIEW MODAL */}
      {interviewingUser && (
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-right">
          <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in">
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
          <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl border border-rose-200 p-6 space-y-4 animate-in fade-in">
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
          <div className="bg-white max-w-lg w-full rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in">
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
          <div className="bg-white max-w-lg w-full rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in">
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
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-brand outline-none"
                  >
                    <option value="assistant">معاون ميداني</option>
                    <option value="teacher">معلم ومقرئ</option>
                    <option value="committee_head">رئيس لجنة</option>
                    <option value="auditor">مراجع ومدقق</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">تطبيق نظام صلاحية مخصص (اختياري):</label>
                <select
                  value={newProfileId}
                  onChange={(e) => setNewProfileId(e.target.value)}
                  className="w-full bg-teal-50 border border-teal-300 rounded-xl px-3 py-2 text-xs font-bold text-teal-950 outline-none"
                >
                  <option value="">صلاحيات يدوية (افتراضية)</option>
                  {effectiveProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

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
          <div className="bg-white max-w-lg w-full rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in">
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

              <div>
                <label className="block font-bold text-slate-700 mb-1">الدور في المنظومة</label>
                <select
                  value={editingUser.role}
                  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as UserRole })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-brand outline-none"
                >
                  <option value="super_admin">المشرف العام (سوبر أدمن)</option>
                  <option value="assistant">معاون ميداني</option>
                  <option value="teacher">معلم ومقرئ</option>
                  <option value="committee_head">رئيس لجنة</option>
                  <option value="auditor">مراجع ومدقق</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">نظام الصلاحية المخصص المطبق:</label>
                <select
                  value={editingUser.profileId || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, profileId: e.target.value || undefined })}
                  className="w-full bg-teal-50 border border-teal-300 rounded-xl px-3 py-2 text-xs font-bold text-teal-950 outline-none"
                >
                  <option value="">صلاحيات مخصصة يدوياً</option>
                  {effectiveProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

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
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-deep text-white font-black shadow-md cursor-pointer"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {userToDelete && (
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-right">
          <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl border border-rose-200 p-6 space-y-4 animate-in fade-in">
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
    </div>
  );
};
