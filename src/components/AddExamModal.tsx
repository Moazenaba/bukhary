import React, { useState, useRef } from 'react';
import { ExamItem } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';

const MAX_PDF_BYTES = 20 * 1024 * 1024;

interface AddExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The PDF (if any) is uploaded separately after the exam is saved. */
  /** Resolves to true when the exam was saved; the modal stays open otherwise. */
  onAddExam: (newExam: ExamItem, file?: File) => boolean | Promise<boolean>;
  savedBooks: string[];
}

export const AddExamModal: React.FC<AddExamModalProps> = ({
  isOpen,
  onClose,
  onAddExam,
  savedBooks,
}) => {
  const [title, setTitle] = useState('');
  const [book, setBook] = useState(savedBooks[0] || '');
  const [branch, setBranch] = useState('');
  const [totalMarks, setTotalMarks] = useState<number>(100);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [questionsCount, setQuestionsCount] = useState<number>(5);
  const [notes, setNotes] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // PDF File upload state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [pdfFileSize, setPdfFileSize] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEscapeKey(onClose);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setFileError('يرجى اختيار ملف بصيغة PDF فقط.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setFileError('حجم الملف أكبر من 20 ميجابايت.');
      return;
    }
    setPdfFile(file);
    setPdfFileName(file.name);
    setPdfFileSize(file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(file.size / 1024)} KB`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !book.trim()) return;
    const newExam: ExamItem = {
      id: `exam-${crypto.randomUUID()}`,
      title: title.trim(),
      book: book.trim(),
      branch: branch.trim(),
      totalMarks: Number(totalMarks) || 100,
      durationMinutes: Number(durationMinutes) || 60,
      questionsCount: Number(questionsCount) || undefined,
      // Set by the server (WEB-01); the display format used before was rejected.
      uploadedAt: '',
      notes: notes.trim(),
    };
    setIsSaving(true);
    const saved = await onAddExam(newExam, pdfFile ?? undefined);
    setIsSaving(false);
    if (saved) onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="إضافة امتحان" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto text-right">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-line/50 overflow-hidden animate-in fade-in duration-150 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-canvas border-b border-line/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-800">
            <span className="material-symbols-outlined text-2xl text-emerald-600">upload_file</span>
            <h3 className="font-bold text-base text-ink">
              إضافة امتحان جديد ورفع ملف PDF
            </h3>
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
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* 1. Exam Title */}
          <div>
            <label className="block font-bold text-ink mb-1">
              اسم الامتحان / عنوان النموذج <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="مثال: امتحان كتاب الأصول الثلاثة وأدلتها — النموذج (أ)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-canvas border border-line rounded-xl px-3.5 py-2.5 text-xs text-ink outline-none focus:border-brand focus:bg-white"
              required
            />
          </div>

          {/* 2. Book & Branch */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-ink mb-1">
                الكتاب المقرر / المسار
              </label>
              <input
                type="text"
                list="books-datalist"
                required
                placeholder="اختر أو اكتب اسم الكتاب..."
                value={book}
                onChange={(e) => setBook(e.target.value)}
                className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-brand"
              />
              <datalist id="books-datalist">
                {savedBooks.map((b, i) => (
                  <option key={i} value={b} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block font-bold text-ink mb-1">
                الفرع أو الفئة المستهدفة
              </label>
              <input
                type="text"
                placeholder="مثال: فرع الكبار، فرع الناشئة..."
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-brand"
              />
            </div>
          </div>

          {/* 3. Duration, Total Marks, Number of Questions */}
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block font-bold text-ink mb-1">
                الدرجة الكلية
              </label>
              <input
                type="number"
                value={totalMarks}
                onChange={(e) => setTotalMarks(parseInt(e.target.value) || 100)}
                className="w-full bg-canvas border border-line rounded-xl px-2.5 py-2 text-xs font-mono font-bold outline-none focus:border-brand text-center"
              />
            </div>

            <div>
              <label className="block font-bold text-ink mb-1">
                المدة (بالدقائق)
              </label>
              <input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 60)}
                className="w-full bg-canvas border border-line rounded-xl px-2.5 py-2 text-xs font-mono font-bold outline-none focus:border-brand text-center"
              />
            </div>

            <div>
              <label className="block font-bold text-ink mb-1">
                عدد الأسئلة
              </label>
              <input
                type="number"
                value={questionsCount}
                onChange={(e) => setQuestionsCount(parseInt(e.target.value) || 5)}
                className="w-full bg-canvas border border-line rounded-xl px-2.5 py-2 text-xs font-mono font-bold outline-none focus:border-brand text-center"
              />
            </div>
          </div>

          {/* 4. PDF File Upload Area */}
          <div className="space-y-1.5">
            <label className="block font-bold text-ink">
              رفع ملف ورقة الامتحان (PDF) <span className="text-red-500">*</span>
            </label>

            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />

            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
                pdfFileName
                  ? 'border-emerald-500 bg-emerald-50/50'
                  : 'border-line hover:border-brand bg-canvas hover:bg-tint'
              }`}
            >
              {pdfFileName ? (
                <div className="flex items-center justify-center gap-3">
                  <span className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                    <span className="material-symbols-outlined text-2xl">picture_as_pdf</span>
                  </span>
                  <div className="text-right">
                    <span className="font-bold text-xs text-emerald-900 block truncate max-w-xs">
                      {pdfFileName}
                    </span>
                    <span className="text-xs text-emerald-700">
                      تم اختيار الملف بنجاح ({pdfFileSize}) — انقر لتغييره
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <span className="w-10 h-10 rounded-xl bg-white border border-line/50 text-brand inline-flex items-center justify-center font-bold shadow-2xs">
                    <span className="material-symbols-outlined text-2xl">cloud_upload</span>
                  </span>
                  <p className="font-bold text-xs text-ink">
                    اضغط هنا لرفع ملف الامتحان (PDF) من جهازك
                  </p>
                  <p className="text-xs text-muted">
                    يدعم المستندات بصيغة PDF فقط (حجم أقصى 20 ميجابايت)
                  </p>
                </div>
              )}
            </div>
          </div>

          {fileError && (
            <div role="alert" className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">{fileError}</div>
          )}

          {/* 5. Notes / Instructions */}
          <div>
            <label className="block font-bold text-ink mb-1">
              تعليمات الامتحان ونموذج الإجابة
            </label>
            <textarea
              rows={2}
              placeholder="اكتب تعليمات خاصة للمصححين أو توزيع الدرجات..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-canvas border border-line rounded-xl p-2.5 text-xs text-ink outline-none focus:border-brand focus:bg-white"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-line/30 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl font-semibold text-ink-soft border border-line hover:bg-gray-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="disabled:opacity-60 px-5 py-2 rounded-xl font-semibold text-white bg-brand hover:bg-success shadow-xs active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">check</span>
              <span>{isSaving ? 'جاري الحفظ...' : 'حفظ الامتحان ورفع النموذج'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
