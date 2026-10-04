import React, { useState } from 'react';
import { AppUser, AssistantPermission, Committee, PermissionDefinition } from '../types';

interface AssistantsViewProps {
  users: AppUser[];
  committees: Committee[];
  currentUser: AppUser;
  onApproveAssistant: (userId: string, permissions: AssistantPermission[], assignedCommittees: number[]) => void;
  onRejectAssistant: (userId: string) => void;
  onUpdateAssistantPermissions: (userId: string, permissions: AssistantPermission[], assignedCommittees: number[]) => void;
  onUpdateAssistantUser: (updatedUser: AppUser) => void;
  onAddAssistantDirect: (user: Omit<AppUser, 'id' | 'createdAt'>) => void;
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
  currentUser,
  onApproveAssistant,
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
  const [activeTab, setActiveTab] = useState<'approved' | 'pending' | 'permissions'>('approved');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Custom permission input state
  const [newCustomPermInput, setNewCustomPermInput] = useState('');

  // Form state for adding direct assistant
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newPermissions, setNewPermissions] = useState<AssistantPermission[]>([
    'database_sheets',
    'manage_committees',
  ]);
  const [newAssignedCommittees, setNewAssignedCommittees] = useState<number[]>([]);

  // Filtering
  const approvedUsers = users.filter((u) => u.role !== 'super_admin' && u.status === 'approved');
  const pendingUsers = users.filter((u) => u.status === 'pending');

  const filteredApproved = approvedUsers.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.phone.includes(q) || u.email.toLowerCase().includes(q);
  });

  const filteredPending = pendingUsers.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.phone.includes(q) || u.email.toLowerCase().includes(q);
  });

  const togglePermission = (
    user: AppUser,
    perm: AssistantPermission,
    currentPerms: AssistantPermission[],
    currentAssigned: number[]
  ) => {
    const updatedPerms = currentPerms.includes(perm)
      ? currentPerms.filter((p) => p !== perm)
      : [...currentPerms, perm];
    onUpdateAssistantPermissions(user.id, updatedPerms, currentAssigned);
  };

  const toggleCommitteeAssignment = (
    user: AppUser,
    commNum: number,
    currentPerms: AssistantPermission[],
    currentAssigned: number[]
  ) => {
    const updatedAssigned = currentAssigned.includes(commNum)
      ? currentAssigned.filter((c) => c !== commNum)
      : [...currentAssigned, commNum];
    onUpdateAssistantPermissions(user.id, currentPerms, updatedAssigned);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    onAddAssistantDirect({
      name: newName.trim(),
      phone: newPhone.trim() || '0500000000',
      email: newEmail.trim() || `${Date.now()}@bukhari.org`,
      role: 'assistant',
      status: 'approved',
      assignedCommittees: newAssignedCommittees,
      permissions: newPermissions,
      approvedAt: new Date().toLocaleDateString('ar-EG'),
      approvedBy: currentUser.name,
      notes: newNotes.trim() || 'معاون مضاف ومفعل مباشرة من المشرف العام',
    });

    setIsAddModalOpen(false);
    setNewName('');
    setNewPhone('');
    setNewEmail('');
    setNewNotes('');
    setNewAssignedCommittees([]);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    onUpdateAssistantUser(editingUser);
    setEditingUser(null);
  };

  const handleCreateCustomPermission = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCustomPermInput.trim();
    if (!trimmed) return;
    onAddCustomPermission(trimmed);
    setNewCustomPermInput('');
  };

  // Helper to get questions not yet scored in a committee
  const getUnscoredQuestions = (committee: Committee) => {
    if (!committee.scoringDetails?.questions) return [];
    return committee.scoringDetails.questions.filter((q) => !q.completed);
  };

  return (
    <div className="space-y-6 text-right">
      {/* Header Banner */}
      <div className="bg-gradient-to-l from-[#005c55] to-emerald-800 rounded-2xl p-6 text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-white/20 text-white">
              <span className="material-symbols-outlined text-2xl">badge</span>
            </span>
            <h2 className="text-xl sm:text-2xl font-bold">
              إدارة المعاونين وتعيين الصلاحيات
            </h2>
          </div>
          <p className="text-xs text-teal-100 mt-1 max-w-2xl leading-relaxed">
            منظومة التحكم بالمعاونين الميدانيين وتعديل بياناتهم (الاسم، الجوال، البريد)، وإسناد اللجان والأسئلة غير المكتملة، وإضافة صلاحيات مخصصة يحددها المشرف العام.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-[#005c55] hover:bg-emerald-50 text-xs sm:text-sm font-bold shadow-md active:scale-[0.98] transition-all cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-xl text-emerald-600">person_add</span>
            <span>+ إضافة معاون مباشرة</span>
          </button>

          <button
            onClick={onOpenAuthModal}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-lg">sync_alt</span>
            <span>تبديل الحساب</span>
          </button>
        </div>
      </div>

      {/* Stats Cluster */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#bdc9c6]/40 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#6e7977] block font-semibold">المعاونون المعتمدون</span>
            <span className="text-2xl font-mono font-bold text-[#005c55]">{approvedUsers.length}</span>
          </div>
          <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <span className="material-symbols-outlined">verified_user</span>
          </span>
        </div>

        <div
          onClick={() => setActiveTab('pending')}
          className={`bg-white p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
            pendingUsers.length > 0
              ? 'border-amber-400 bg-amber-50/30 ring-2 ring-amber-300/40'
              : 'border-[#bdc9c6]/40 shadow-xs'
          }`}
        >
          <div>
            <span className="text-[11px] text-amber-800 block font-semibold">
              طلبات الانضمام قيد الاعتماد
            </span>
            <span className="text-2xl font-mono font-bold text-amber-600">
              {pendingUsers.length}
            </span>
          </div>
          <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold">
            <span className="material-symbols-outlined">pending_actions</span>
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#bdc9c6]/40 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#6e7977] block font-semibold">صلاحيات مخصصة بالنظام</span>
            <span className="text-2xl font-mono font-bold text-[#005c55]">
              {customPermissions.length}
            </span>
          </div>
          <span className="w-10 h-10 rounded-xl bg-[#eff4ff] text-[#005c55] flex items-center justify-center font-bold">
            <span className="material-symbols-outlined">tune</span>
          </span>
        </div>
      </div>

      {/* Custom Permission Quick Add Bar (أنا عايز أضيف صلاحية أكتبها أنا بمزاجي) */}
      <div className="bg-gradient-to-l from-emerald-50/70 to-teal-50/50 p-4 rounded-2xl border border-emerald-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-[#005c55] text-white flex items-center justify-center text-sm font-bold">
              <span className="material-symbols-outlined text-base">add_moderator</span>
            </span>
            <div>
              <span className="font-bold text-xs text-[#0d1c2e] block">
                إضافة صلاحيات جديدة ومخصصة للمسجد:
              </span>
              <span className="text-[11px] text-[#6e7977]">
                اكتب أي صلاحية بمزاجك (مثل: استلام أوراق الإجابة، ختم الأسئلة، مراجعة توقيع الطلاب...)
              </span>
            </div>
          </div>

          <form onSubmit={handleCreateCustomPermission} className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="اكتب اسم الصلاحية الجديدة هنا..."
              value={newCustomPermInput}
              onChange={(e) => setNewCustomPermInput(e.target.value)}
              className="bg-white border border-[#bdc9c6] rounded-xl px-3 py-1.5 text-xs outline-none focus:border-[#005c55] w-full sm:w-64 text-[#0d1c2e]"
            />
            <button
              type="submit"
              disabled={!newCustomPermInput.trim()}
              className="px-3.5 py-1.5 rounded-xl bg-[#005c55] hover:bg-[#1b6b51] disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition-all shrink-0"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              <span>إضافة الصلاحية</span>
            </button>
          </form>
        </div>

        {/* Existing Custom Permissions Badges */}
        <div className="mt-3 pt-3 border-t border-emerald-200/60 flex items-center gap-1.5 flex-wrap text-xs">
          <span className="text-[11px] font-bold text-[#3e4947]">الصلاحيات المتاحة حالياً:</span>
          {customPermissions.map((perm) => (
            <span
              key={perm.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#bdc9c6] text-[#0d1c2e] text-[11px] font-semibold shadow-2xs"
            >
              <span>{perm.label}</span>
              {perm.isCustom && (
                <button
                  type="button"
                  onClick={() => onDeleteCustomPermission(perm.id)}
                  className="text-gray-400 hover:text-red-600 cursor-pointer p-0.5"
                  title="حذف هذه الصلاحية المخصصة"
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Tabs Switcher: Approved vs Pending */}
      <div className="flex items-center justify-between border-b border-[#bdc9c6]/40 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('approved')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'approved'
                ? 'bg-[#005c55] text-white shadow-xs'
                : 'bg-white text-[#3e4947] border border-[#bdc9c6]/60 hover:bg-[#eff4ff]'
            }`}
          >
            <span className="material-symbols-outlined text-sm">verified</span>
            <span>المعاونون المعتمدون</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono">
              {approvedUsers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'pending'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-[#3e4947] border border-[#bdc9c6]/60 hover:bg-amber-50'
            }`}
          >
            <span className="material-symbols-outlined text-sm">hourglass_top</span>
            <span>طلبات الانضمام قيد الاعتماد</span>
            {pendingUsers.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-900 font-mono animate-pulse font-bold">
                {pendingUsers.length} جديد
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative w-48 sm:w-64">
          <span className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-[#6e7977]">
            <span className="material-symbols-outlined text-sm">search</span>
          </span>
          <input
            type="text"
            placeholder="بحث بالاسم أو الهاتف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-[#bdc9c6] rounded-xl pr-9 pl-3 py-1.5 text-xs outline-none focus:border-[#005c55]"
          />
        </div>
      </div>

      {/* VIEW 1: APPROVED ASSISTANTS */}
      {activeTab === 'approved' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {filteredApproved.map((user) => {
              // Find committees assigned to this assistant
              const assignedComms = committees.filter((c) =>
                user.assignedCommittees.includes(c.committeeNumber)
              );

              return (
                <div
                  key={user.id}
                  className="bg-white rounded-2xl border border-[#bdc9c6]/60 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Assistant Header with Edit Button */}
                    <div className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-[#bdc9c6]/30">
                      <div className="flex items-center gap-3">
                        <span className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                          user.role === 'committee_head' ? 'bg-blue-100 text-blue-800' :
                          user.role === 'teacher' ? 'bg-indigo-100 text-indigo-800' :
                          user.role === 'auditor' ? 'bg-purple-100 text-purple-800' :
                          'bg-emerald-100 text-emerald-800'
                        }`}>
                          <span className="material-symbols-outlined text-xl">
                            {user.role === 'auditor' ? 'policy' : user.role === 'teacher' ? 'school' : 'person'}
                          </span>
                        </span>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-sm text-[#0d1c2e] leading-snug">
                              {user.name}
                            </h4>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              user.role === 'committee_head' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                              user.role === 'teacher' ? 'bg-indigo-50 text-indigo-800 border-indigo-200' :
                              user.role === 'auditor' ? 'bg-purple-50 text-purple-800 border-purple-200' :
                              'bg-amber-50 text-amber-800 border-amber-200'
                            }`}>
                              {user.role === 'committee_head' ? 'رئيس لجنة' :
                               user.role === 'teacher' ? 'معلم ومقرئ' :
                               user.role === 'auditor' ? 'مدقق جودة' : 'معاون ميداني'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-[#6e7977] mt-0.5 flex-wrap">
                            {user.passportNumber && (
                              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-300 text-slate-800 text-[10px]">
                                🛂 {user.passportNumber}
                              </span>
                            )}
                            <span className="font-mono">📞 {user.phone}</span>
                            <span>•</span>
                            <span>✉️ {user.email}</span>
                            {user.password && (
                              <>
                                <span>•</span>
                                <span className="text-emerald-700 font-mono text-[10px]">🔑 {user.password}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Notes / Bio */}
                    {user.notes && (
                      <p className="text-[11px] text-[#3e4947] bg-[#f8f9ff] p-2.5 rounded-xl border border-[#bdc9c6]/30 mb-3.5">
                        {user.notes}
                      </p>
                    )}

                    {/* Permissions Badges */}
                    <div className="bg-[#f8f9ff] p-3 rounded-xl border border-[#bdc9c6]/40 mb-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-[#0d1c2e] flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm text-[#005c55]">security</span>
                          <span>الصلاحيات الممنوحة للمعاون ({user.permissions.length}):</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        {user.permissions.length > 0 ? (
                          user.permissions.map((pId) => {
                            const def = customPermissions.find((cp) => cp.id === pId);
                            const label = def ? def.label : pId;
                            return (
                              <span
                                key={pId}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-950 border border-emerald-300 text-[11px] font-bold"
                              >
                                <span>✓</span>
                                <span>{label}</span>
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">
                            لم تُمنح له صلاحيات بعد (اضغط على "تعديل البيانات والصلاحيات" لإضافة صلاحيات)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Committee Inspection & Uncorrected Questions Section */}
                    <div className="space-y-2 mb-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-[#0d1c2e] flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm text-amber-600">assignment_turned_in</span>
                          <span>اللجان المسندة وحالة تصحيح أسئلتها:</span>
                        </span>
                        <span className="text-[10px] text-[#6e7977]">
                          (انقر على أي لجنة للدخول والعمل عليها)
                        </span>
                      </div>

                      {assignedComms.length > 0 ? (
                        <div className="space-y-2">
                          {assignedComms.map((comm) => {
                            const unscoredQuestions = getUnscoredQuestions(comm);
                            const totalQuestions = comm.scoringDetails?.questions?.length || 0;
                            const isFullyScored = totalQuestions > 0 && unscoredQuestions.length === 0;

                            return (
                              <div
                                key={comm.id}
                                className={`p-3 rounded-xl border transition-all text-xs ${
                                  unscoredQuestions.length > 0
                                    ? 'bg-amber-50/50 border-amber-300/80 hover:bg-amber-50'
                                    : 'bg-emerald-50/40 border-emerald-300/70'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-md bg-[#005c55] text-white flex items-center justify-center font-bold text-[10px]">
                                      #{comm.committeeNumber}
                                    </span>
                                    <span className="font-bold text-[#0d1c2e]">
                                      {comm.committeeName}
                                    </span>
                                    <span className="text-[10px] text-[#6e7977]">
                                      ({comm.competitionBook})
                                    </span>
                                  </div>

                                  {onOpenCommitteeDetails && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenCommitteeDetails(comm)}
                                      className="px-2.5 py-1 rounded-lg bg-[#005c55] hover:bg-[#1b6b51] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                    >
                                      <span>فتح اللجنة والعمل عليها</span>
                                      <span className="material-symbols-outlined text-xs">arrow_forward</span>
                                    </button>
                                  )}
                                </div>

                                {/* Questions Breakdown */}
                                {totalQuestions > 0 ? (
                                  <div className="pt-1.5 border-t border-gray-200/50">
                                    {isFullyScored ? (
                                      <span className="text-emerald-800 font-bold flex items-center gap-1 text-[11px]">
                                        <span>✓</span>
                                        <span>تم تصحيح كافة الأسئلة بنجاح ({totalQuestions} أسئلة)</span>
                                      </span>
                                    ) : (
                                      <div className="space-y-1">
                                        <div className="flex items-center justify-between text-[11px]">
                                          <span className="text-amber-900 font-bold">
                                            ⚠️ أسئلة لم يتم تصحيحها بعد ({unscoredQuestions.length} من {totalQuestions}):
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          {unscoredQuestions.map((uq) => (
                                            <span
                                              key={uq.id}
                                              onClick={() => onOpenCommitteeDetails && onOpenCommitteeDetails(comm)}
                                              className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-bold border border-amber-300 text-[10px] cursor-pointer hover:bg-amber-200 transition-colors"
                                              title="اضغط للدخول وتصحيح هذا السؤال"
                                            >
                                              ✎ {uq.label} (غير مصحح)
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-gray-400">
                                    لم يتم إعداد أسئلة التصحيح بعد لهذه اللجنة
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-gray-50 border border-dashed border-gray-300 text-center text-[11px] text-gray-500">
                          لم يتم إسناد لجان لهذا المعاون حتى الآن.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs mt-3 flex-wrap gap-2">
                    <span className="text-[11px] text-slate-500 font-medium">
                      تاريخ الاعتماد: {user.approvedAt || user.createdAt}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingUser(user)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95"
                        title="تعديل بيانات المعاون والصلاحيات واللجان"
                      >
                        <span className="material-symbols-outlined text-sm text-amber-700">edit</span>
                        <span>تعديل الصلاحيات</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setUserToDelete(user)}
                        className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-800 font-bold px-2.5 py-1.5 rounded-xl hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer active:scale-95"
                        title="حذف هذا المعاون"
                      >
                        <span className="material-symbols-outlined text-sm">delete_outline</span>
                        <span>حذف المعاون</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredApproved.length === 0 && (
            <div className="bg-white rounded-2xl p-10 text-center border border-[#bdc9c6]/40">
              <span className="material-symbols-outlined text-4xl text-[#6e7977] mb-2 block">
                group_off
              </span>
              <p className="text-sm font-bold text-[#0d1c2e]">لا يوجد معاونون معتمدون مطابقون للبحث</p>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: PENDING APPROVAL REQUESTS */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-xl text-amber-600 shrink-0">
              admin_panel_settings
            </span>
            <span>
              <strong>تنبيه المشرف العام:</strong> هؤلاء المتقدمون سجلوا كمعاونين ولن يتمكنوا من دخول لوحة اللجان أو اتخاذ أي إجراء إلا بعد موافقتك واعتمادهم رسمياً وتحديد صلاحياتهم.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredPending.map((user) => (
              <div
                key={user.id}
                className="bg-white rounded-2xl border-2 border-amber-300/80 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-[#bdc9c6]/30">
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold text-sm shrink-0">
                        <span className="material-symbols-outlined text-xl">person_pin</span>
                      </span>
                      <div>
                        <h4 className="font-bold text-sm text-[#0d1c2e]">{user.name}</h4>
                        <div className="flex items-center gap-2 text-[11px] text-[#6e7977] mt-0.5">
                          <span className="font-mono text-emerald-900 font-bold">📞 {user.phone}</span>
                        </div>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shrink-0 animate-pulse">
                      قيد اعتماد المشرف
                    </span>
                  </div>

                  <p className="text-xs text-[#3e4947] bg-[#f8f9ff] p-3 rounded-xl border border-[#bdc9c6]/30 mb-3.5 leading-relaxed">
                    <strong className="text-[#0d1c2e]">بيان الطلب: </strong>
                    {user.notes || 'طلب انضمام جديد للعمل في لجان مسجد البخاري.'}
                  </p>

                  <div className="text-[11px] text-[#6e7977] mb-3">
                    <span>تاريخ تقديم الطلب: </span>
                    <strong className="text-[#0d1c2e] font-mono">{user.createdAt}</strong>
                  </div>
                </div>

                {/* Approval & Reject buttons */}
                <div className="pt-3 border-t border-[#bdc9c6]/30 flex flex-wrap items-center justify-between gap-2">
                  <button
                    onClick={() =>
                      setEditingUser({
                        ...user,
                        status: 'approved',
                        role: user.role || 'assistant',
                        permissions: user.permissions.length > 0 ? user.permissions : ['database_sheets', 'manage_committees'],
                        assignedCommittees: user.assignedCommittees.length > 0 ? user.assignedCommittees : [1],
                      })
                    }
                    className="flex-1 py-2 px-3 rounded-xl bg-[#005c55] hover:bg-[#1b6b51] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-[0.98] transition-all"
                    title="فتح نافذة اختيار الدور وتحديد الصلاحيات واللجان للمتقدم"
                  >
                    <span className="material-symbols-outlined text-sm">how_to_reg</span>
                    <span>✓ قبول وتحديد الدور والصلاحيات</span>
                  </button>

                  <button
                    onClick={() =>
                      onApproveAssistant(
                        user.id,
                        ['database_sheets', 'manage_committees'],
                        [1]
                      )
                    }
                    className="py-2 px-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                    title="قبول فوري بصلاحيات معاون ميداني"
                  >
                    <span className="material-symbols-outlined text-sm">done_all</span>
                    <span>قبول فوري</span>
                  </button>

                  <button
                    onClick={() => {
                      if (window.confirm(`هل أنت متأكد من رفض طلب المعاون "${user.name}"؟`)) {
                        onRejectAssistant(user.id);
                      }
                    }}
                    className="py-2 px-3 rounded-xl border border-red-300 text-red-600 hover:bg-red-50 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                    <span>رفض</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {filteredPending.length === 0 && (
            <div className="bg-white rounded-2xl p-10 text-center border border-[#bdc9c6]/40">
              <span className="material-symbols-outlined text-4xl text-emerald-600 mb-2 block">
                task_alt
              </span>
              <p className="text-sm font-bold text-[#0d1c2e]">لا توجد طلبات انضمام معلقة حالياً</p>
              <p className="text-xs text-[#6e7977] mt-1">كافة طلبات المعاونين تم اعتمادها رسمياً.</p>
            </div>
          )}
        </div>
      )}

      {/* FULL EDIT ASSISTANT MODAL (تعديل بيانات وصلاحيات معاذ بن سعد العتيبي أو أي معاون) */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto text-right">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-[#bdc9c6]/50 overflow-hidden animate-in fade-in duration-150">
            <div className="px-5 py-4 bg-gradient-to-l from-amber-50 to-[#eff4ff] border-b border-[#bdc9c6]/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center font-bold shadow-xs">
                  <span className="material-symbols-outlined text-xl">edit</span>
                </span>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-[#0d1c2e]">
                    تعديل بيانات وصلاحيات: {editingUser.name}
                  </h3>
                  <p className="text-[11px] text-[#6e7977]">
                    تعديل الاسم، رقم الجوال المحدث، اللجان المسندة، والصلاحيات
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#0d1c2e] mb-1">
                    اسم المعاون / العضو <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editingUser.name}
                    onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                    className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-[#005c55] font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#0d1c2e] mb-1">
                    رقم الهاتف / الجوال <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={editingUser.phone}
                    onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                    className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-[#005c55] font-mono text-left font-bold"
                    required
                  />
                </div>
              </div>

              {/* Role Selection by Super Admin */}
              <div>
                <label className="block font-bold text-[#0d1c2e] mb-1">
                  الدور الوظيفي في المنظومة (يحدده المشرف العام) <span className="text-red-500">*</span>:
                </label>
                <select
                  value={editingUser.role}
                  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as any })}
                  className="w-full bg-emerald-50 border border-emerald-300 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-[#005c55] font-bold text-emerald-950"
                >
                  <option value="assistant">معاون ميداني تنفيذي (استلام وتجهيز اللجان وتوزيع الامتحانات)</option>
                  <option value="teacher">معلم ومقرئ معتمد (اختبار الطلاب ورصد وتصحيح الدرجات)</option>
                  <option value="committee_head">رئيس لجنة واختبارات (إشراف ميداني واعتماد جاهزية وتدقيق)</option>
                  <option value="auditor">مراجع ومدقق جودة (رقابي وإحصائي)</option>
                </select>
              </div>

              {/* Permissions Checklist in Edit Modal */}
              <div className="bg-[#f8f9ff] p-3 rounded-xl border border-[#bdc9c6]/40 space-y-2">
                <span className="font-bold text-[#0d1c2e] block">
                  الصلاحيات الممنوحة لهذا المعاون (حدد ما تشاء):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {customPermissions.map((perm) => {
                    const isChecked = editingUser.permissions.includes(perm.id);
                    return (
                      <label
                        key={perm.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                          isChecked ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold' : 'bg-white border-gray-200 text-gray-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const updated = e.target.checked
                              ? [...editingUser.permissions, perm.id]
                              : editingUser.permissions.filter((p) => p !== perm.id);
                            setEditingUser({ ...editingUser, permissions: updated });
                          }}
                        />
                        <span>{perm.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Committee Assignment in Edit Modal */}
              <div>
                <label className="block font-bold text-[#0d1c2e] mb-1.5">
                  اللجان المسندة لهذا المعاون لمتابعتها وتصحيحها:
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {committees.map((c) => {
                    const isSelected = editingUser.assignedCommittees.includes(c.committeeNumber);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          const updated = isSelected
                            ? editingUser.assignedCommittees.filter((num) => num !== c.committeeNumber)
                            : [...editingUser.assignedCommittees, c.committeeNumber];
                          setEditingUser({ ...editingUser, assignedCommittees: updated });
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[#005c55] text-white border-[#005c55]'
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        لجنة #{c.committeeNumber}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#0d1c2e] mb-1">ملاحظات / تكليفات</label>
                <textarea
                  rows={2}
                  value={editingUser.notes || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, notes: e.target.value })}
                  className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl p-2.5 text-xs outline-none focus:border-[#005c55]"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUserToDelete(editingUser);
                  }}
                  className="px-3.5 py-2 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-base">delete</span>
                  <span>حذف هذا المعاون</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2 rounded-xl text-slate-600 border border-slate-300 hover:bg-slate-50 font-bold text-xs cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-[#005c55] hover:bg-[#004742] text-white font-bold text-xs cursor-pointer shadow-xs active:scale-[0.98]"
                  >
                    حفظ التعديلات فوراً
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DIRECT ADD ASSISTANT MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto text-right">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-[#bdc9c6]/50 overflow-hidden animate-in fade-in duration-150">
            <div className="px-5 py-4 bg-gradient-to-l from-emerald-50 to-[#eff4ff] border-b border-[#bdc9c6]/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-[#005c55] text-white flex items-center justify-center font-bold shadow-xs">
                  <span className="material-symbols-outlined text-xl">person_add</span>
                </span>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-[#0d1c2e]">
                    إضافة معاون جديد وتحديد صلاحياته
                  </h3>
                  <p className="text-[11px] text-[#6e7977]">
                    تفعيل الحساب مباشرة ومنحه صلاحيات استلام اللجان وتصحيح الأسئلة
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[#0d1c2e] mb-1">
                  اسم المعاون ثلاثياً <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="مثال: الشيخ عبد الرحمن بن صالح..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-[#005c55] font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#0d1c2e] mb-1">رقم الهاتف / الجوال</label>
                  <input
                    type="tel"
                    placeholder="05xxxxxxxx"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#0d1c2e] mb-1">البريد الإلكتروني</label>
                  <input
                    type="email"
                    placeholder="assistant@bukhari.org"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
                  />
                </div>
              </div>

              {/* Permissions checklist */}
              <div className="bg-[#f8f9ff] p-3 rounded-xl border border-[#bdc9c6]/40 space-y-2">
                <span className="font-bold text-[#0d1c2e] block">الصلاحيات المبدئية:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {customPermissions.map((perm) => (
                    <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newPermissions.includes(perm.id)}
                        onChange={(e) => {
                          if (e.target.checked) setNewPermissions([...newPermissions, perm.id]);
                          else setNewPermissions(newPermissions.filter((p) => p !== perm.id));
                        }}
                      />
                      <span>{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Committee assignment */}
              <div>
                <label className="block font-bold text-[#0d1c2e] mb-1.5">
                  إسناد لجان أولية للمعاون:
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {committees.map((c) => {
                    const isSelected = newAssignedCommittees.includes(c.committeeNumber);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setNewAssignedCommittees(newAssignedCommittees.filter((num) => num !== c.committeeNumber));
                          } else {
                            setNewAssignedCommittees([...newAssignedCommittees, c.committeeNumber]);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                          isSelected
                            ? 'bg-[#005c55] text-white border-[#005c55]'
                            : 'bg-white text-gray-600 border-gray-300'
                        }`}
                      >
                        لجنة #{c.committeeNumber}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#0d1c2e] mb-1">ملاحظات / تكليفات</label>
                <textarea
                  rows={2}
                  placeholder="مهام المعاون في القاعة أو توجيهات المشرف العام..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl p-2.5 text-xs outline-none focus:border-[#005c55]"
                />
              </div>

              <div className="pt-3 border-t border-[#bdc9c6]/30 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-gray-600 border border-gray-300 hover:bg-gray-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#005c55] hover:bg-[#1b6b51] text-white font-bold cursor-pointer"
                >
                  حفظ وتفعيل المعاون فوراً
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* DELETE CONFIRMATION MODAL (No window.confirm!) */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto text-right animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-rose-200 overflow-hidden">
            <div className="p-5 bg-rose-50 border-b border-rose-100 flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                <span className="material-symbols-outlined text-2xl">delete_forever</span>
              </span>
              <div>
                <h3 className="font-extrabold text-base text-rose-950">
                  تأكيد حذف حساب المعاون
                </h3>
                <p className="text-xs text-rose-700 mt-0.5">
                  هذا الإجراء سيقوم بمسح الحساب وسحب كافة الصلاحيات
                </p>
              </div>
            </div>

            <div className="p-5 space-y-3 text-xs text-slate-700">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <p className="font-bold text-slate-900 text-sm">{userToDelete.name}</p>
                <p className="text-slate-500 text-[11px] mt-1">الهاتف: {userToDelete.phone || 'غير مسجل'}</p>
                <p className="text-slate-500 text-[11px]">اسم الدخول: {userToDelete.email}</p>
              </div>
              <p className="text-rose-600 font-bold text-xs leading-relaxed">
                ⚠️ هل أنت متأكد تماماً من رغبتك في حذف هذا الحساب نهائياً من قاعدة بيانات المسجد؟
              </p>
            </div>

            <div className="px-5 py-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-200/80 font-bold text-xs cursor-pointer transition-colors"
              >
                تراجع وإلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteAssistant(userToDelete.id);
                  if (editingUser?.id === userToDelete.id) {
                    setEditingUser(null);
                  }
                  setUserToDelete(null);
                }}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-900/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">delete</span>
                <span>نعم، حذف الحساب فوراً</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
