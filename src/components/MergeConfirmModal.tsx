import React from 'react';
import { Layers, Replace, AlertCircle, X } from 'lucide-react';

interface MergeConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  newRowCount: number;
  existingRowCount: number;
  onMerge: () => void;
  onReplace: () => void;
}

export const MergeConfirmModal: React.FC<MergeConfirmModalProps> = ({
  isOpen,
  onClose,
  newRowCount,
  existingRowCount,
  onMerge,
  onReplace,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">
                خيارات حفظ البيانات المستخرجة
              </h3>
              <p className="text-xs text-slate-500">
                تحديد كيفية إضافة الصفوف المقروءة إلى جدولك الحالي
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق النافذة"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-700 leading-relaxed">
            تم استخراج <strong className="text-emerald-700 font-bold">{newRowCount}</strong> صفاً جديداً بنجاح عبر الذكاء الاصطناعي.
            الجدول الحالي يحتوي على <strong className="text-slate-900 font-bold">{existingRowCount}</strong> صفاً.
            كيف ترغب في إدراج البيانات؟
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {/* Merge Button */}
            <button
              type="button"
              onClick={() => {
                onMerge();
                onClose();
              }}
              className="flex flex-col items-start p-4 rounded-xl border-2 border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50 text-right transition-all group"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Layers className="w-4 h-4" />
              </div>
              <span className="font-bold text-emerald-950 text-sm mb-1">
                دمج مع البيانات الحالية
              </span>
              <span className="text-xs text-emerald-700 leading-normal">
                إضافة الصفوف الجديدة في نهاية الجدول مع الحفاظ التام على الصفوف السابقة.
              </span>
            </button>

            {/* Replace Button */}
            <button
              type="button"
              onClick={() => {
                onReplace();
                onClose();
              }}
              className="flex flex-col items-start p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-rose-50 hover:border-rose-300 text-right transition-all group"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-700 group-hover:bg-rose-600 text-white flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Replace className="w-4 h-4" />
              </div>
              <span className="font-bold text-slate-900 group-hover:text-rose-950 text-sm mb-1">
                استبدال البيانات القديمة
              </span>
              <span className="text-xs text-slate-500 group-hover:text-rose-700 leading-normal">
                مسح الصفوف القديمة بالكامل والبدء بالصفوف الجديدة المستخرجة فقط.
              </span>
            </button>
          </div>
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700"
          >
            إلغاء الأمر
          </button>
        </div>
      </div>
    </div>
  );
};
