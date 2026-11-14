import React, { useState } from 'react';
import { Tag, X } from 'lucide-react';
import type { Course } from '../../types';
import { todayISO } from '../../utils/stageUtils';
import { toast } from '../Toasts';

/** «إضافة دورة جديدة» from the course sheet. Keeps its own form state; tells the sheet when a course was created. */
export const NewCourseModal: React.FC<{
  onClose: () => void;
  onAddCourse?: (newCourse: Omit<Course, 'id' | 'createdAt'>) => Promise<Course | undefined>;
  onCreated?: (course: Course) => void;
}> = ({ onClose, onAddCourse, onCreated }) => {
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseSeason, setNewCourseSeason] = useState('');
  const [newCourseYear, setNewCourseYear] = useState('');
  const [newCourseStartDate, setNewCourseStartDate] = useState(todayISO());
  const [newCourseEndDate, setNewCourseEndDate] = useState('');
  const [newCourseStatus, setNewCourseStatus] = useState<'active' | 'completed' | 'upcoming'>('active');
  const [newCourseTargetCommittees, setNewCourseTargetCommittees] = useState<number | ''>('');
  const [newCourseDescription, setNewCourseDescription] = useState('');

  // Submit Create Course Modal
  const handleCreateCourseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim()) {
      toast.error('يرجى إدخال اسم الدورة أولاً.');
      return;
    }

    if (onAddCourse) {
      const created = await onAddCourse({
        name: newCourseName.trim(),
        season: newCourseSeason,
        year: newCourseYear.trim(),
        startDate: newCourseStartDate || todayISO(),
        endDate: newCourseEndDate || '',
        status: newCourseStatus,
        targetCommitteesCount: Number(newCourseTargetCommittees) || undefined,
        description: newCourseDescription.trim(),
        isDefault: newCourseStatus === 'active',
      });
      if (!created) return;
      onCreated?.(created);
    }

    onClose();
  };

  return (
<div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150 text-right">
            <div className="px-5 py-4 bg-gradient-to-l from-emerald-800 to-brand text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-white/20 text-white">
                  <Tag className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold">إضافة دورة مسابقات علمية جديدة</h3>
                  <p className="text-xs text-emerald-100">
                    إنشاء دورة جديدة وربط اللجان والصفوف بها تلقائياً في قاعدة البيانات
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onClose()}
                className="p-1.5 rounded-lg hover:bg-white/20 text-emerald-100 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCourseSubmit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  اسم الدورة <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="مثال: دورة الصيف 1448هـ - متون العقيدة"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    الموسم
                  </label>
                  <select
                    value={newCourseSeason}
                    onChange={(e) => setNewCourseSeason(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 text-xs font-bold outline-none bg-slate-50 cursor-pointer"
                  >
                    <option value="صيفية">صيفية</option>
                    <option value="شتوية">شتوية</option>
                    <option value="رمضانية">رمضانية</option>
                    <option value="مكثفة">مكثفة</option>
                    <option value="سنوية">سنوية</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    العام الهجري / الميلادي
                  </label>
                  <input
                    type="text"
                    value={newCourseYear}
                    onChange={(e) => setNewCourseYear(e.target.value)}
                    placeholder="1448هـ / 2026م"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 text-xs font-bold outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    حالة الدورة
                  </label>
                  <select
                    value={newCourseStatus}
                    onChange={(e) => setNewCourseStatus(e.target.value as any)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 text-xs font-bold outline-none bg-slate-50 cursor-pointer"
                  >
                    <option value="active">نشطة (الحالية)</option>
                    <option value="upcoming">قادمة</option>
                    <option value="completed">مكتملة ومؤرشفة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    العدد المستهدف للجان
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newCourseTargetCommittees}
                    onChange={(e) => setNewCourseTargetCommittees(parseInt(e.target.value, 10) || 30)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 text-xs font-mono font-bold outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  وصف وملاحظات الدورة
                </label>
                <textarea
                  rows={2}
                  value={newCourseDescription}
                  onChange={(e) => setNewCourseDescription(e.target.value)}
                  placeholder="وصف مختصر لأهداف وفروع هذه الدورة..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:border-emerald-600 text-xs outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => onClose()}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 shadow-sm transition-all active:scale-[0.98] cursor-pointer"
                >
                  حفظ وإضافة الدورة
                </button>
              </div>
            </form>
          </div>
        </div>
  );
};
