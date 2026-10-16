import React from 'react';
import { CourseTableRow } from '../types/table';

interface MergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  newRows: CourseTableRow[];
  existingCount: number;
  onConfirmMerge: () => void;
  onConfirmReplace: () => void;
}

export const MergeModal: React.FC<MergeModalProps> = ({
  isOpen,
  onClose,
  newRows,
  existingCount,
  onConfirmMerge,
  onConfirmReplace,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 text-right space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-[#005c55] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-2xl" aria-hidden="true">call_merge</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              تم استخراج {newRows.length} صفاً جديداً بنجاح
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              لديك حالياً {existingCount} صفاً في جدول الدورة العلمية. كيف تود تطبيق البيانات الجديدة؟
            </p>
          </div>
        </div>

        {/* Preview of first 3 extracted rows */}
        <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200">
          <span className="text-[11px] font-bold text-slate-600 block mb-2">
            معاينة سريعة للصفوف المستخرجة حديثاً:
          </span>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {newRows.slice(0, 4).map((r, idx) => (
              <div
                key={idx}
                className="text-xs bg-white p-2 rounded-xl border border-slate-200 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-500 text-[11px]">#{r.number}</span>
                  <span className="font-bold text-slate-800">{r.sheikh_name}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span>{r.place}</span>
                  <span>•</span>
                  <span className="text-[#005c55] font-semibold">{r.book}</span>
                </div>
              </div>
            ))}
            {newRows.length > 4 && (
              <p className="text-[11px] text-slate-500 text-center pt-1 font-semibold">
                + {newRows.length - 4} صفوف إضافية...
              </p>
            )}
          </div>
        </div>

        {/* Action Choice Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Choice 1: Merge */}
          <button
            type="button"
            onClick={onConfirmMerge}
            className="p-4 rounded-2xl border-2 border-emerald-500 bg-emerald-50/60 hover:bg-emerald-100/70 text-right transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-emerald-900 text-sm">دمج الصفوف (الموصى به)</span>
                <span className="material-symbols-outlined text-emerald-700" aria-hidden="true">playlist_add</span>
              </div>
              <p className="text-xs text-emerald-800/80 leading-relaxed">
                إضافة الـ {newRows.length} صفاً الجديدة إلى نهاية الجدول الحالي مع الحفاظ على البيانات القديمة ({existingCount} صفاً).
              </p>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 mt-3 block group-hover:underline">
              اضغط للدمج الآن ←
            </span>
          </button>

          {/* Choice 2: Replace */}
          <button
            type="button"
            onClick={onConfirmReplace}
            className="p-4 rounded-2xl border-2 border-slate-200 hover:border-rose-400 bg-slate-50 hover:bg-rose-50/50 text-right transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-slate-800 group-hover:text-rose-900 text-sm">
                  استبدال البيانات القديمة
                </span>
                <span className="material-symbols-outlined text-slate-400 group-hover:text-rose-600" aria-hidden="true">
                  find_replace
                </span>
              </div>
              <p className="text-xs text-slate-500 group-hover:text-rose-800/80 leading-relaxed">
                مسح الصفوف الحالية بالكامل واعتماد الكشف الجديد فقط كجدول وحيد.
              </p>
            </div>
            <span className="text-[11px] font-bold text-slate-600 group-hover:text-rose-700 mt-3 block group-hover:underline">
              اضغط للاستبدال ←
            </span>
          </button>
        </div>

        {/* Footer cancel */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            إلغاء التغييرات
          </button>
        </div>
      </div>
    </div>
  );
};
