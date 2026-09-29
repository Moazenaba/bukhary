import React, { useState, useRef } from 'react';
import { ExamItem } from '../types';
import { getCurrentFormattedDateTime } from '../utils/stageUtils';

interface AddExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddExam: (newExam: ExamItem) => void;
  savedBooks: string[];
}

export const AddExamModal: React.FC<AddExamModalProps> = ({
  isOpen,
  onClose,
  onAddExam,
  savedBooks,
}) => {
  if (!isOpen) return null;

  const [title, setTitle] = useState('');
  const [book, setBook] = useState(savedBooks[0] || 'مسابقة كتاب الأصول الثلاثة');
  const [branch, setBranch] = useState('فرع الكبار');
  const [totalMarks, setTotalMarks] = useState<number>(100);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [questionsCount, setQuestionsCount] = useState<number>(5);
  const [notes, setNotes] = useState('');

  // PDF File upload state
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [pdfFileSize, setPdfFileSize] = useState<string>('');
  const [pdfDataUrl, setPdfDataUrl] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        alert('يرجى اختيار ملف بصيغة PDF فقط.');
        return;
      }
      setPdfFileName(file.name);
      setPdfFileSize(
        file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.round(file.size / 1024)} KB`
      );

      const reader = new FileReader();
      reader.onload = (event) => {
        setPdfDataUrl(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newExam: ExamItem = {
      id: `exam-${Date.now()}`,
      title: title.trim(),
      book: book.trim() || 'مسابقة كتاب الأصول الثلاثة',
      branch: branch.trim() || 'الفرع العام',
      totalMarks: Number(totalMarks) || 100,
      durationMinutes: Number(durationMinutes) || 60,
      questionsCount: Number(questionsCount) || 5,
      pdfFileName: pdfFileName || 'نموذج_الامتحان_المعتمد.pdf',
      pdfFileSize: pdfFileSize || '1.2 MB',
      pdfDataUrl: pdfDataUrl || undefined,
      uploadedAt: getCurrentFormattedDateTime(),
      notes: notes.trim(),
    };

    onAddExam(newExam);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto text-right">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-[#bdc9c6]/50 overflow-hidden animate-in fade-in duration-150 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-[#f8f9ff] border-b border-[#bdc9c6]/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-800">
            <span className="material-symbols-outlined text-2xl text-emerald-600">upload_file</span>
            <h3 className="font-bold text-base text-[#0d1c2e]">
              إضافة امتحان جديد ورفع ملف PDF
            </h3>
          </div>
          <button
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
            <label className="block font-bold text-[#0d1c2e] mb-1">
              اسم الامتحان / عنوان النموذج <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="مثال: امتحان كتاب الأصول الثلاثة وأدلتها — النموذج (أ)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3.5 py-2.5 text-xs text-[#0d1c2e] outline-none focus:border-[#005c55] focus:bg-white"
              required
            />
          </div>

          {/* 2. Book & Branch */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-[#0d1c2e] mb-1">
                الكتاب المقرر / المسار
              </label>
              <input
                type="text"
                list="books-datalist"
                placeholder="اختر أو اكتب اسم الكتاب..."
                value={book}
                onChange={(e) => setBook(e.target.value)}
                className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
              />
              <datalist id="books-datalist">
                {savedBooks.map((b, i) => (
                  <option key={i} value={b} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block font-bold text-[#0d1c2e] mb-1">
                الفرع أو الفئة المستهدفة
              </label>
              <input
                type="text"
                placeholder="مثال: فرع الكبار، فرع الناشئة..."
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
              />
            </div>
          </div>

          {/* 3. Duration, Total Marks, Number of Questions */}
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block font-bold text-[#0d1c2e] mb-1">
                الدرجة الكلية
              </label>
              <input
                type="number"
                value={totalMarks}
                onChange={(e) => setTotalMarks(parseInt(e.target.value) || 100)}
                className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-2.5 py-2 text-xs font-mono font-bold outline-none focus:border-[#005c55] text-center"
              />
            </div>

            <div>
              <label className="block font-bold text-[#0d1c2e] mb-1">
                المدة (بالدقائق)
              </label>
              <input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 60)}
                className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-2.5 py-2 text-xs font-mono font-bold outline-none focus:border-[#005c55] text-center"
              />
            </div>

            <div>
              <label className="block font-bold text-[#0d1c2e] mb-1">
                عدد الأسئلة
              </label>
              <input
                type="number"
                value={questionsCount}
                onChange={(e) => setQuestionsCount(parseInt(e.target.value) || 5)}
                className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-2.5 py-2 text-xs font-mono font-bold outline-none focus:border-[#005c55] text-center"
              />
            </div>
          </div>

          {/* 4. PDF File Upload Area */}
          <div className="space-y-1.5">
            <label className="block font-bold text-[#0d1c2e]">
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
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
                pdfFileName
                  ? 'border-emerald-500 bg-emerald-50/50'
                  : 'border-[#bdc9c6] hover:border-[#005c55] bg-[#f8f9ff] hover:bg-[#eff4ff]'
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
                    <span className="text-[11px] text-emerald-700">
                      تم اختيار الملف بنجاح ({pdfFileSize}) — انقر لتغييره
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <span className="w-10 h-10 rounded-xl bg-white border border-[#bdc9c6]/50 text-[#005c55] inline-flex items-center justify-center font-bold shadow-2xs">
                    <span className="material-symbols-outlined text-2xl">cloud_upload</span>
                  </span>
                  <p className="font-bold text-xs text-[#0d1c2e]">
                    اضغط هنا لرفع ملف الامتحان (PDF) من جهازك
                  </p>
                  <p className="text-[11px] text-[#6e7977]">
                    يدعم المستندات بصيغة PDF فقط (حجم أقصى 25 ميجابايت)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 5. Notes / Instructions */}
          <div>
            <label className="block font-bold text-[#0d1c2e] mb-1">
              تعليمات الامتحان ونموذج الإجابة
            </label>
            <textarea
              rows={2}
              placeholder="اكتب تعليمات خاصة للمصححين أو توزيع الدرجات..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl p-2.5 text-xs text-[#0d1c2e] outline-none focus:border-[#005c55] focus:bg-white"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-[#bdc9c6]/30 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl font-semibold text-[#3e4947] border border-[#bdc9c6] hover:bg-gray-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl font-semibold text-white bg-[#005c55] hover:bg-[#1b6b51] shadow-xs active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">check</span>
              <span>حفظ الامتحان ورفع النموذج</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
