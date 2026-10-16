import React, { useState } from 'react';
import { ExamItem, AppUser } from '../types';
import { AuthService } from '../services/AuthService';

interface ExamsViewProps {
  exams: ExamItem[];
  savedBooks: string[];
  currentUser?: AppUser;
  onOpenAddExam: () => void;
  onOpenAddBook: () => void;
  onDeleteExam: (examId: string) => void;
  onDeleteBook?: (bookName: string) => void;
}

export const ExamsView: React.FC<ExamsViewProps> = ({
  exams,
  savedBooks,
  currentUser,
  onOpenAddExam,
  onOpenAddBook,
  onDeleteExam,
  onDeleteBook,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'exams' | 'books'>('exams');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBook, setSelectedBook] = useState<string>('all');
  const [viewingExam, setViewingExam] = useState<ExamItem | null>(null);

  const isRestrictedScope =
    currentUser &&
    currentUser.role !== 'super_admin' &&
    !currentUser.allExamsAllowed &&
    currentUser.allowedExamIds &&
    currentUser.allowedExamIds.length > 0;

  // Filtered exams with Permission enforcement
  const filteredExams = exams.filter((e) => {
    if (currentUser && !AuthService.canAccessExam(e.id, currentUser)) return false;
    if (selectedBook !== 'all' && e.book !== selectedBook) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = e.title.toLowerCase().includes(q);
      const matchBook = e.book.toLowerCase().includes(q);
      const matchBranch = e.branch.toLowerCase().includes(q);
      if (!matchTitle && !matchBook && !matchBranch) return false;
    }
    return true;
  });

  // Filtered books
  const filteredBooks = savedBooks.filter((b) => {
    if (searchQuery.trim()) {
      return b.toLowerCase().includes(searchQuery.toLowerCase().trim());
    }
    return true;
  });

  const handleOpenPdf = (exam: ExamItem) => {
    if (exam.pdfDataUrl) {
      const win = window.open();
      if (win) {
        win.document.write(
          `<iframe src="${exam.pdfDataUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
        );
      }
    } else {
      setViewingExam(exam);
    }
  };

  const handleDownloadMockPdf = (exam: ExamItem) => {
    const textContent = `مسابقات مسجد البخاري العلمية في متون العقيدة
اسم الامتحان: ${exam.title}
الكتاب المقرر: ${exam.book}
الفرع: ${exam.branch}
الدرجة الكلية: ${exam.totalMarks} درجة | المدة: ${exam.durationMinutes} دقيقة
عدد الأسئلة: ${exam.questionsCount || 5} أسئلة
تاريخ الاعتماد: ${exam.uploadedAt}

تعليمات الامتحان:
${exam.notes || 'الإجابة بوضوح واستحضار الأدلة من الكتاب والسنة وأقوال أهل العلم.'}
`;
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exam.pdfFileName || `${exam.title}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6 text-right">
      {/* Header Bar with Add Book & Add Exam Buttons */}
      <div className="bg-gradient-to-l from-emerald-800 to-[#005c55] rounded-2xl p-6 text-white shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-white/20 text-white">
              <span className="material-symbols-outlined text-2xl" aria-hidden="true">menu_book</span>
            </span>
            <h2 className="text-xl sm:text-2xl font-bold">
              الامتحانات والكتب المقررة (PDF)
            </h2>
          </div>
          <p className="text-xs text-teal-100 mt-1 max-w-2xl leading-relaxed">
            قسم متكامل لإضافة المتون والكتب المقررة، ورفع نماذج الامتحانات الرسمية المعتمدة بصيغة PDF لكل كتاب.
          </p>
        </div>

        {/* Action Buttons: Add Book + Add Exam side by side */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* 1. Add Book Button (Golden/Amber theme) */}
          <button
            onClick={onOpenAddBook}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg active:scale-[0.98] transition-all cursor-pointer shrink-0 border border-amber-400/50"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">library_add</span>
            <span>+ إضافة كتاب مقرر</span>
          </button>

          {/* 2. Add Exam & Upload PDF Button */}
          <button
            onClick={onOpenAddExam}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-[#005c55] hover:bg-emerald-50 text-xs sm:text-sm font-bold shadow-md active:scale-[0.98] transition-all cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-xl text-emerald-600" aria-hidden="true">upload_file</span>
            <span>+ إضافة امتحان ورفع PDF</span>
          </button>
        </div>
      </div>

      {/* Subtabs Switcher: Exams vs Books */}
      <div className="flex items-center justify-between border-b border-[#bdc9c6]/40 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('exams')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'exams'
                ? 'bg-[#005c55] text-white shadow-xs'
                : 'bg-white text-[#3e4947] border border-[#bdc9c6]/60 hover:bg-[#eff4ff]'
            }`}
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">picture_as_pdf</span>
            <span>نماذج الامتحانات وPDF</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono">
              {exams.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('books')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'books'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-[#3e4947] border border-[#bdc9c6]/60 hover:bg-amber-50'
            }`}
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">auto_stories</span>
            <span>الكتب والمتون المقررة</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-900 font-mono">
              {savedBooks.length}
            </span>
          </button>
        </div>

        {/* Quick action helper */}
        {activeSubTab === 'books' ? (
          <button
            onClick={onOpenAddBook}
            className="text-xs text-amber-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">add_circle</span>
            <span>إضافة متن جديد</span>
          </button>
        ) : (
          <button
            onClick={onOpenAddExam}
            className="text-xs text-[#005c55] font-bold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">upload_file</span>
            <span>رفع نموذج امتحان</span>
          </button>
        )}
      </div>

      {/* VIEW 1: EXAMS LIST */}
      {activeSubTab === 'exams' && (
        <>
          {/* Scope Restriction Alert Banner */}
          {isRestrictedScope && (
            <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-300 text-purple-950 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-700 text-lg" aria-hidden="true">lock_person</span>
                <span>
                  <strong>نطاق الصلاحية المخصص:</strong> يظهر لك فقط الامتحانات المصرح لك بالدخول على تفاصيلها وتصحيحها ({filteredExams.length} من أصل {exams.length}).
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-200 text-purple-950 text-[10px] font-bold">
                مصحح معتمد
              </span>
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-[#bdc9c6]/40 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] text-[#6e7977] block font-semibold">إجمالي نماذج الامتحانات</span>
                <span className="text-2xl font-mono font-bold text-[#005c55]">{exams.length}</span>
              </div>
              <span className="w-10 h-10 rounded-xl bg-[#eff4ff] text-[#005c55] flex items-center justify-center font-bold">
                <span className="material-symbols-outlined" aria-hidden="true">description</span>
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-[#bdc9c6]/40 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] text-[#6e7977] block font-semibold">الكتب المقررة المعتمدة</span>
                <span className="text-2xl font-mono font-bold text-amber-600">{savedBooks.length}</span>
              </div>
              <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                <span className="material-symbols-outlined" aria-hidden="true">auto_stories</span>
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-[#bdc9c6]/40 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] text-[#6e7977] block font-semibold">ملفات PDF المرفوعة</span>
                <span className="text-2xl font-mono font-bold text-blue-700">{exams.length} ملفات</span>
              </div>
              <span className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                <span className="material-symbols-outlined" aria-hidden="true">file_present</span>
              </span>
            </div>
          </div>

          {/* Filter and Search */}
          <div className="bg-white p-4 rounded-2xl border border-[#bdc9c6]/50 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:flex-1">
              <span className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-[#6e7977]">
                <span className="material-symbols-outlined text-lg" aria-hidden="true">search</span>
              </span>
              <input
                type="text"
                placeholder="بحث في الامتحانات بالاسم أو الكتاب أو الفرع..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl pr-10 pl-3 py-2 text-xs outline-none focus:border-[#005c55]"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <span className="text-xs font-semibold text-[#6e7977] whitespace-nowrap">
                تصفية بالكتاب:
              </span>
              <select
                value={selectedBook}
                onChange={(e) => setSelectedBook(e.target.value)}
                className="bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55] w-full md:w-60"
              >
                <option value="all">كافة الكتب ({exams.length})</option>
                {savedBooks.map((b, i) => (
                  <option key={i} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Exams Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredExams.map((exam) => (
              <div
                key={exam.id}
                className="bg-white rounded-2xl border border-[#bdc9c6]/60 hover:border-[#005c55]/50 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-[#bdc9c6]/30">
                    <div>
                      <h3 className="font-bold text-sm text-[#0d1c2e] leading-snug">
                        {exam.title}
                      </h3>
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#005c55] font-semibold mt-1">
                        <span className="material-symbols-outlined text-xs" aria-hidden="true">auto_stories</span>
                        <span>{exam.book}</span>
                      </span>
                    </div>

                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#eff4ff] text-[#005c55] border border-[#9cf2e8] shrink-0">
                      {exam.branch}
                    </span>
                  </div>

                  {/* Meta stats */}
                  <div className="grid grid-cols-3 gap-2 bg-[#f8f9ff] p-3 rounded-xl border border-[#bdc9c6]/30 mb-4 text-center text-xs">
                    <div>
                      <span className="text-[10px] text-[#6e7977] block">الدرجة الكلية</span>
                      <span className="font-mono font-bold text-[#0d1c2e]">{exam.totalMarks} د</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#6e7977] block">مدة الامتحان</span>
                      <span className="font-mono font-bold text-[#0d1c2e]">{exam.durationMinutes} دقيقة</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#6e7977] block">عدد الأسئلة</span>
                      <span className="font-mono font-bold text-[#0d1c2e]">{exam.questionsCount || 5} أسئلة</span>
                    </div>
                  </div>

                  {/* PDF File Box */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/60 border border-emerald-200 mb-4">
                    <div className="flex items-center gap-2.5">
                      <span className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0">
                        <span className="material-symbols-outlined text-xl" aria-hidden="true">picture_as_pdf</span>
                      </span>
                      <div className="text-right">
                        <span className="font-bold text-xs text-emerald-950 block truncate max-w-[200px]">
                          {exam.pdfFileName || 'ورقة_الامتحان.pdf'}
                        </span>
                        <span className="text-[11px] text-emerald-700">
                          {exam.pdfFileSize || '1.4 MB'} • رُفع في: {exam.uploadedAt}
                        </span>
                      </div>
                    </div>

                    <span className="text-[10px] bg-emerald-200/60 text-emerald-900 font-bold px-2 py-0.5 rounded-full">
                      معتمد
                    </span>
                  </div>

                  {/* Notes */}
                  {exam.notes && (
                    <p className="text-[11px] text-[#6e7977] bg-white p-2.5 rounded-xl border border-[#bdc9c6]/30 mb-4 italic leading-relaxed">
                      <strong className="text-[#0d1c2e] not-italic">تعليمات: </strong>
                      {exam.notes}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-[#bdc9c6]/30 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenPdf(exam)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#005c55] text-white text-xs font-bold hover:bg-[#1b6b51] transition-colors shadow-xs active:scale-[0.98] cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">visibility</span>
                    <span>معاينة ورقة الامتحان (PDF)</span>
                  </button>

                  <button
                    onClick={() => handleDownloadMockPdf(exam)}
                    title="تنزيل الملف"
                    className="p-2 rounded-xl border border-[#bdc9c6] text-[#3e4947] hover:bg-[#eff4ff] transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base" aria-hidden="true">download</span>
                  </button>

                  <button
                    onClick={() => {
                      if (window.confirm(`هل أنت متأكد من حذف "${exam.title}"؟`)) {
                        onDeleteExam(exam.id);
                      }
                    }}
                    title="حذف الامتحان"
                    className="p-2 rounded-xl border border-[#bdc9c6] text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base" aria-hidden="true">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {filteredExams.length === 0 && (
            <div className="bg-white rounded-2xl p-12 text-center border border-[#bdc9c6]/40 shadow-xs">
              <span className="material-symbols-outlined text-4xl text-[#6e7977] mb-2 block" aria-hidden="true">
                find_in_page
              </span>
              <h3 className="font-bold text-base text-[#0d1c2e] mb-1">لا توجد امتحانات مطابقة للبحث</h3>
              <p className="text-xs text-[#6e7977] mb-4">
                يمكنك إضافة أول نموذج امتحان ورفع ملف PDF الخاص به بسهولة.
              </p>
              <button
                onClick={onOpenAddExam}
                className="px-4 py-2 rounded-xl bg-[#005c55] text-white text-xs font-bold hover:bg-[#1b6b51] cursor-pointer"
              >
                + إضافة امتحان الآن
              </button>
            </div>
          )}
        </>
      )}

      {/* VIEW 2: BOOKS & COURSES LIST */}
      {activeSubTab === 'books' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-[#bdc9c6]/50 shadow-xs flex items-center justify-between">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-[#6e7977]">
                <span className="material-symbols-outlined text-lg" aria-hidden="true">search</span>
              </span>
              <input
                type="text"
                placeholder="بحث في الكتب والمتون المقررة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl pr-10 pl-3 py-2 text-xs outline-none focus:border-amber-600"
              />
            </div>
            <button
              onClick={onOpenAddBook}
              className="mr-3 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">library_add</span>
              <span>+ إضافة كتاب جديد</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBooks.map((bookName, idx) => {
              const bookExams = exams.filter((e) => e.book === bookName);
              return (
                <div
                  key={idx}
                  className="bg-white p-4 rounded-2xl border border-[#bdc9c6]/50 hover:border-amber-500 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
                        #{idx + 1}
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        معتمد في المسابقة
                      </span>
                    </div>

                    <h4 className="font-bold text-sm text-[#0d1c2e] mb-1.5 leading-snug">
                      {bookName}
                    </h4>

                    <div className="text-[11px] text-[#6e7977] space-y-1 mb-3 bg-[#f8f9ff] p-2.5 rounded-xl border border-[#bdc9c6]/30">
                      <div className="flex justify-between">
                        <span>نماذج الامتحانات المرفوعة:</span>
                        <strong className="text-[#0d1c2e] font-mono">{bookExams.length} نماذج</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>التصنيف:</span>
                        <strong className="text-amber-800">متون العقيدة والتوحيد</strong>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#bdc9c6]/20 flex items-center justify-between text-xs">
                    <button
                      onClick={() => {
                        setSelectedBook(bookName);
                        setActiveSubTab('exams');
                      }}
                      className="text-[#005c55] font-bold hover:underline cursor-pointer"
                    >
                      عرض امتحانات الكتاب &larr;
                    </button>

                    {onDeleteBook && idx > 3 && (
                      <button
                        onClick={() => {
                          if (window.confirm(`هل أنت متأكد من حذف "${bookName}"؟`)) {
                            onDeleteBook(bookName);
                          }
                        }}
                        className="text-gray-400 hover:text-red-600 p-1"
                        title="حذف هذا الكتاب"
                      >
                        <span className="material-symbols-outlined text-sm" aria-hidden="true">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PDF View Modal */}
      {viewingExam && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl border border-[#bdc9c6]/50 text-right animate-in fade-in">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#bdc9c6]/30">
              <div className="flex items-center gap-2 text-[#005c55]">
                <span className="material-symbols-outlined text-2xl" aria-hidden="true">picture_as_pdf</span>
                <h3 className="font-bold text-base text-[#0d1c2e]">{viewingExam.title}</h3>
              </div>
              <button
                onClick={() => setViewingExam(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
              </button>
            </div>

            <div className="bg-[#f8f9ff] p-5 rounded-2xl border border-[#bdc9c6]/40 space-y-3 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-[#bdc9c6]/30">
                <span className="font-bold text-[#005c55]">مسابقات مسجد البخاري العلمية</span>
                <span className="font-mono text-[#6e7977]">{viewingExam.uploadedAt}</span>
              </div>

              <div>
                <span className="font-bold text-sm text-[#0d1c2e] block mb-1">{viewingExam.title}</span>
                <p className="text-[#3e4947]">
                  <strong>الكتاب المقرر:</strong> {viewingExam.book} | <strong>الفرع:</strong> {viewingExam.branch}
                </p>
                <p className="text-[#3e4947]">
                  <strong>الدرجة الكلية:</strong> {viewingExam.totalMarks} درجة | <strong>المدة:</strong> {viewingExam.durationMinutes} دقيقة
                </p>
              </div>

              <div className="p-4 bg-white rounded-xl border border-[#bdc9c6]/30 space-y-2">
                <span className="font-bold text-xs text-[#005c55] block">
                  📄 مستند الامتحان المرفوع ({viewingExam.pdfFileName})
                </span>
                <p className="text-[12px] text-[#3e4947] leading-relaxed">
                  تم اعتماد نموذج الأسئلة الرسمي وتوثيق ورقة الاختبار بنجاح في أرشيف لجان مسجد البخاري.
                </p>
                {viewingExam.notes && (
                  <p className="text-[11px] text-[#6e7977] border-t border-gray-100 pt-2">
                    <strong>التعليمات:</strong> {viewingExam.notes}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[#bdc9c6]/30 flex justify-between items-center">
              <button
                onClick={() => handleDownloadMockPdf(viewingExam)}
                className="px-4 py-2 bg-emerald-700 text-white rounded-xl font-bold text-xs hover:bg-emerald-800 flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm" aria-hidden="true">download</span>
                <span>تنزيل ورقة الامتحان</span>
              </button>

              <button
                onClick={() => setViewingExam(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-semibold text-xs hover:bg-gray-200 cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
