import React, { useState } from 'react';
import type { AssistantPermission, Committee, ExamItem, PermissionDefinition, PermissionProfile } from '../../types';
import { CommitteePicker } from '../CommitteePicker';

/** «نظام صلاحية»: create a new permission profile, or edit `profile`. */
export const PermissionProfileModal: React.FC<{
  profile: PermissionProfile | null;
  committees: Committee[];
  exams: ExamItem[];
  customPermissions: PermissionDefinition[];
  currentUserName: string;
  onSave: (profile: PermissionProfile) => unknown;
  onClose: () => void;
}> = ({ profile, committees, exams, customPermissions, currentUserName, onSave, onClose }) => {
  const [profileName, setProfileName] = useState(profile?.name ?? '');
  const [profileDescription, setProfileDescription] = useState(profile?.description ?? '');
  const [profileBadgeColor, setProfileBadgeColor] = useState<'emerald' | 'blue' | 'purple' | 'amber' | 'rose' | 'teal'>((profile?.badgeColor as any) || 'emerald');
  const [profileAllCommittees, setProfileAllCommittees] = useState(profile ? Boolean(profile.allCommitteesAllowed) : false);
  const [profileAllowedCommitteeIds, setProfileAllowedCommitteeIds] = useState<string[]>(profile?.allowedCommitteeIds ?? []);
  const [profileAllExams, setProfileAllExams] = useState(profile ? Boolean(profile.allExamsAllowed) : true);
  const [profileAllowedExamIds, setProfileAllowedExamIds] = useState<string[]>(profile?.allowedExamIds || []);
  const [profilePermissions, setProfilePermissions] = useState<AssistantPermission[]>(profile?.permissions || []);
  const [saving, setSaving] = useState(false);

  const handleSaveProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) return;
    const ids = profileAllCommittees ? [] : profileAllowedCommitteeIds;
    const newProf: PermissionProfile = {
      id: profile ? profile.id : `profile_${crypto.randomUUID()}`,
      name: profileName.trim(),
      description: profileDescription.trim(),
      badgeColor: profileBadgeColor,
      allowedCommitteeIds: ids,
      allowedCommittees: committees.filter((c) => ids.includes(c.id)).map((c) => c.committeeNumber),
      allCommitteesAllowed: profileAllCommittees,
      allowedExamIds: profileAllExams ? [] : profileAllowedExamIds,
      allExamsAllowed: profileAllExams,
      permissions: profilePermissions,
      createdAt: profile ? profile.createdAt : new Date().toISOString(),
      createdBy: currentUserName,
      isDefault: profile ? profile.isDefault : false,
    };
    setSaving(true);
    try {
      await onSave(newProf);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto text-right">
          <div className="bg-white max-w-2xl w-full rounded-3xl shadow-2xl border border-teal-200 overflow-hidden animate-in fade-in">
            <div className="p-5 bg-gradient-to-l from-teal-700 to-teal-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-2xl bg-white/20 text-white flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-2xl">tune</span>
                </span>
                <div>
                  <h3 className="font-black text-base sm:text-lg">
                    {profile ? `تعديل نظام الصلاحية: ${profile.name}` : 'إنشاء وتصميم نظام صلاحية مخصص جديد'}
                  </h3>
                  <p className="text-xs text-teal-200">
                    حدد التابات واللجان والامتحانات المصرح بها بدقة متناهية
                  </p>
                </div>
              </div>
              <button
                onClick={() => onClose()}
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

              {/* Permissions (system permissions only) */}
              <div className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <h4 className="font-bold text-xs text-slate-900 flex items-center gap-1.5 border-b pb-2">
                  <span className="material-symbols-outlined text-sm text-teal-700">key</span>
                  <span>٢. الصلاحيات التي يمنحها البروفايل:</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {customPermissions.map((perm) => (
                    <label key={perm.id} className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={profilePermissions.includes(perm.id)}
                        onChange={(e) =>
                          setProfilePermissions((prev) => (e.target.checked ? [...prev, perm.id] : prev.filter((x) => x !== perm.id)))
                        }
                        className="rounded text-teal-600 focus:ring-teal-600"
                      />
                      <span>{perm.label}</span>
                    </label>
                  ))}
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
                  <div className="pt-2">
                    <CommitteePicker committees={committees} selectedIds={profileAllowedCommitteeIds} onChange={setProfileAllowedCommitteeIds} />
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
                    {exams.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {exams.map((ex) => {
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
                  onClick={() => onClose()}
                  className="px-5 py-2.5 rounded-xl text-slate-600 border border-slate-300 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-black shadow-md cursor-pointer disabled:opacity-60"
                >
                  {saving ? 'جارٍ الحفظ…' : 'حفظ نظام الصلاحية'}
                </button>
              </div>
            </form>
          </div>
        </div>
  );
};
