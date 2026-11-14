import React, { useState } from 'react';
import { PlusCircle, Tag, X } from 'lucide-react';
import type { Committee, Course } from '../../types';
import { todayISO } from '../../utils/stageUtils';
import { toast } from '../Toasts';

/** «إضافة صف جديد»: creates the committee (the sheet then shows it). Keeps its own form state. */
export const NewSheetRowModal: React.FC<{
  courses: Course[];
  defaultCourseId?: string;
  nextNumber: number;
  onClose: () => void;
  onAddCommittee?: (newComm: Committee) => Promise<Committee | undefined>;
  onOpenNewCourse: () => void;
}> = ({ courses, defaultCourseId, nextNumber, onClose, onAddCommittee, onOpenNewCourse }) => {
  const [newRowNumber, setNewRowNumber] = useState<number>(nextNumber);
  const [newRowCourseId, setNewRowCourseId] = useState<string>(defaultCourseId ?? '');
  const [newRowSheikhName, setNewRowSheikhName] = useState<string>('');
  const [newRowPlace, setNewRowPlace] = useState<string>('');
  const [newRowBook, setNewRowBook] = useState<string>('');
  const [newRowStudentsCount, setNewRowStudentsCount] = useState<number>(0);
  const [newRowDelivered, setNewRowDelivered] = useState<boolean>(false);
  const [newRowCorrected, setNewRowCorrected] = useState<boolean>(false);
  const [newRowReviewed, setNewRowReviewed] = useState<boolean>(false);
  const [newRowAnnounced, setNewRowAnnounced] = useState<boolean>(false);
  const [newRowCeremony, setNewRowCeremony] = useState<boolean>(false);
  const [newRowNotes, setNewRowNotes] = useState<string>('');

  // Submit Add Row Modal: creates the committee; the sheet then shows it.
  const handleAddRowModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCourse = courses.find((c) => c.id === (newRowCourseId || defaultCourseId));
    if (!targetCourse) {
      toast.error('اختر الدورة أولاً');
      return;
    }
    if (!onAddCommittee) return;
    const now = new Date();
    const created = await onAddCommittee({
      id: `comm-${crypto.randomUUID()}`,
      committeeNumber: newRowNumber,
      committeeName: newRowSheikhName.trim() ? `لجنة ${newRowSheikhName.trim()}` : `لجنة #${newRowNumber}`,
      sheikhName: newRowSheikhName.trim() || undefined,
      branch: newRowPlace.trim(),
      competitionBook: newRowBook.trim(),
      studentsCount: Number(newRowStudentsCount) || 0,
      courseId: targetCourse.id,
      courseName: targetCourse.name,
      members: [],
      generalNotes: newRowNotes.trim(),
      stages: {
        registration: { completed: true, completedAt: now.toISOString() },
        exam: { completed: newRowDelivered },
        scoring: { completed: newRowCorrected },
        aggregation: { completed: false },
        review: { completed: newRowReviewed },
        sheet: { completed: false },
        accreditation: { completed: false },
        announcement: { completed: newRowAnnounced },
        ceremony: { completed: newRowCeremony },
      },
      createdDate: todayISO(now),
      createdAtTime: now.toISOString().slice(11, 16),
    });
    if (created) onClose();
  };

  return (
<div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150 text-right">
            <div className="px-5 py-4 bg-gradient-to-l from-emerald-800 to-brand text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-white/20 text-white">
                  <PlusCircle className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold">إضافة صف ولجنة جديدة إلى الكشف</h3>
                  <p className="text-xs text-emerald-100">
                    تحديد الدورة المقررة وحفظ اللجنة في قاعدة البيانات تلقائياً
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

            <form onSubmit={handleAddRowModalSubmit} className="p-5 space-y-4 text-xs">
              {/* Course Selector in Form */}
              <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200/80">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-emerald-700" />
                    <span>الدورة التابعة لها هذه اللجنة:</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => onOpenNewCourse()}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>+ إضافة دورة جديدة</span>
                  </button>
                </div>

                <select
                  value={newRowCourseId || defaultCourseId || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__new__') {
                      onOpenNewCourse();
                    } else {
                      setNewRowCourseId(val);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-emerald-300 bg-white text-xs font-bold text-slate-800 focus:border-emerald-600 outline-none cursor-pointer"
                >
                  {courses.map((crs) => (
                    <option key={crs.id} value={crs.id}>
                      {crs.name} ({crs.season} - {crs.year}) {crs.isDefault ? '⭐' : ''}
                    </option>
                  ))}
                  <option value="__new__">➕ إضافة دورة جديدة...</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رقم تسلسلي (م)
                  </label>
                  <input
                    type="number"
                    value={newRowNumber}
                    onChange={(e) => setNewRowNumber(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 font-mono font-bold text-center text-xs outline-none"
                    required
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم فضيلة الشيخ <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="اسم الشيخ المشرف على اللجنة..."
                    value={newRowSheikhName}
                    onChange={(e) => setNewRowSheikhName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 text-xs font-bold outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    المكان / القاعة
                  </label>
                  <input
                    type="text"
                    value={newRowPlace}
                    onChange={(e) => setNewRowPlace(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 text-xs outline-none"
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الكتاب المقرر
                  </label>
                  <input
                    type="text"
                    value={newRowBook}
                    onChange={(e) => setNewRowBook(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 text-xs font-bold text-emerald-800 outline-none"
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    عدد الطلاب
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newRowStudentsCount}
                    onChange={(e) => setNewRowStudentsCount(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 text-xs font-mono font-bold text-center outline-none"
                  />
                </div>
              </div>

              {/* Initial Stages */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2">
                <span className="block text-xs font-bold text-slate-700">
                  مراحل الإنجاز الحالية للجنة:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newRowDelivered}
                      onChange={(e) => setNewRowDelivered(e.target.checked)}
                      className="rounded accent-emerald-600"
                    />
                    <span className="font-semibold text-emerald-900">1. تم الامتحان</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newRowCorrected}
                      onChange={(e) => setNewRowCorrected(e.target.checked)}
                      className="rounded accent-teal-600"
                    />
                    <span className="font-semibold text-teal-900">2. تم التصحيح</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newRowReviewed}
                      onChange={(e) => setNewRowReviewed(e.target.checked)}
                      className="rounded accent-blue-600"
                    />
                    <span className="font-semibold text-blue-900">3. تم المراجعة</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newRowAnnounced}
                      onChange={(e) => setNewRowAnnounced(e.target.checked)}
                      className="rounded accent-teal-600"
                    />
                    <span className="font-semibold text-teal-900">4. تم الإعلان</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newRowCeremony}
                      onChange={(e) => setNewRowCeremony(e.target.checked)}
                      className="rounded accent-amber-600"
                    />
                    <span className="font-semibold text-amber-900">5. تم الحفل</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ملاحظات
                </label>
                <input
                  type="text"
                  value={newRowNotes}
                  onChange={(e) => setNewRowNotes(e.target.value)}
                  placeholder="أي ملاحظات خاصة باللجنة..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 text-xs outline-none"
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
                  إضافة الصف واللجنة
                </button>
              </div>
            </form>
          </div>
        </div>
  );
};
