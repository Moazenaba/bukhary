import React, { useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface AddBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBook: (bookName: string, author?: string, notes?: string) => void;
  existingBooks: string[];
}

export const AddBookModal: React.FC<AddBookModalProps> = ({
  isOpen,
  onClose,
  onAddBook,
  existingBooks,
}) => {
  useEscapeKey(onClose);
  if (!isOpen) return null;

  const [bookName, setBookName] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('متون العقيدة والتوحيد');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = bookName.trim();
    if (!trimmed) {
      setErrorMsg('يرجى كتابة اسم الكتاب المقرر.');
      return;
    }

    if (existingBooks.some((b) => b.toLowerCase() === trimmed.toLowerCase())) {
      setErrorMsg('هذا الكتاب مضاف ومسجل بالفعل في قائمة الكتب.');
      return;
    }

    onAddBook(trimmed, author.trim() || undefined, notes.trim() || undefined);
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="إضافة كتاب" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto text-right">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-line/50 max-h-[92vh] overflow-y-auto animate-in fade-in duration-150">
        {/* Header with warm Amber/Gold scholar styling */}
        <div className="px-5 py-4 bg-gradient-to-l from-amber-50 to-amber-100/60 border-b border-amber-200/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-amber-900">
            <span className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
              <span className="material-symbols-outlined text-xl">library_add</span>
            </span>
            <div>
              <h3 className="font-bold text-base text-amber-950">إضافة كتاب مقرر جديد</h3>
              <p className="text-xs text-amber-800">
                إدراج متن علمي أو كتاب شرعي معتمد في مسابقات مسجد البخاري
              </p>
            </div>
          </div>
          <button
            aria-label="إغلاق"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 font-semibold">
              {errorMsg}
            </div>
          )}

          {/* Book Title */}
          <div>
            <label className="block font-bold text-ink mb-1">
              اسم الكتاب أو المتن المقرر <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="مثال: كتاب الأصول الثلاثة، كتاب التوحيد، متن العقيدة الواسطية..."
              value={bookName}
              onChange={(e) => {
                setBookName(e.target.value);
                setErrorMsg('');
              }}
              className="w-full bg-canvas border border-line rounded-xl px-3.5 py-2.5 text-xs text-ink outline-none focus:border-amber-600 focus:bg-white"
              required
            />
          </div>

          {/* Author / Scholar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-ink mb-1">
                المصنّف / المؤلف (اختياري)
              </label>
              <input
                type="text"
                placeholder="مثال: شيخ الإسلام محمد بن عبد الوهاب"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="block font-bold text-ink mb-1">
                التصنيف العلمي
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-600 focus:bg-white font-semibold"
              >
                <option value="متون العقيدة والتوحيد">متون العقيدة والتوحيد</option>
                <option value="متون الحديث والأثر">متون الحديث والأثر</option>
                <option value="أصول الفقه والقواعد">أصول الفقه والقواعد</option>
                <option value="متون عامة وتأصيلية">متون عامة وتأصيلية</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-bold text-ink mb-1">
              ملاحظات أو عدد الأبواب المقررة
            </label>
            <textarea
              rows={2}
              placeholder="مثال: يختبر الطالب في حفظ المتن كاملاً مع ضبط الألفاظ وأدلة الأصول الثلاثة..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-canvas border border-line rounded-xl p-2.5 text-xs text-ink outline-none focus:border-amber-600 focus:bg-white"
            />
          </div>

          {/* Quick Info Box */}
          <div className="bg-amber-50/70 border border-amber-200/60 rounded-xl p-3 text-xs text-amber-900 leading-relaxed flex items-start gap-2">
            <span className="material-symbols-outlined text-base text-amber-600 shrink-0">info</span>
            <span>
              عند إضافة الكتاب سيظهر فوراً كخيار معتمد في كافة نماذج تسجيل اللجان، وتصفية البيانات، ورفع نماذج الامتحانات.
            </span>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-line/30 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl font-semibold text-ink-soft border border-line hover:bg-gray-50 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-xs active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">library_add</span>
              <span>حفظ الكتاب واعتماده</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
