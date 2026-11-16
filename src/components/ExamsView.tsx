import React, { useState } from 'react';
import { PageHeader, primaryAction, quietAction } from './ui/PageHeader';
import { ExamItem, AppUser } from '../types';
import { AuthService } from '../services/AuthService';
import { DataService } from '../services/DataService';
import { errorMessage } from '../services/api';
import { toast } from './Toasts';

interface ExamsViewProps {
  exams: ExamItem[];
  savedBooks: string[];
  currentUser?: AppUser;
  onOpenAddExam: () => void;
  onOpenAddBook: () => void;
  onDeleteExam: (examId: string) => void;
  onDeleteBook?: (bookName: string) => void;
  /** Upload or replace an exam's PDF (WEB-01: there was no way to attach a file after creation). */
  onUploadFile?: (examId: string, file: File) => void | Promise<void>;
}

const MAX_PDF_BYTES = 20 * 1024 * 1024;

function shortDate(value: string) {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? value : new Date(ms).toLocaleDateString('ar', { dateStyle: 'medium' });
}

export const ExamsView: React.FC<ExamsViewProps> = ({
  exams,
  savedBooks,
  currentUser,
  onOpenAddExam,
  onOpenAddBook,
  onDeleteExam,
  onDeleteBook,
  onUploadFile,
}) => {
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const pickFile = (examId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !onUploadFile) return;
      if (file.type !== 'application/pdf' || file.size > MAX_PDF_BYTES) {
        toast.error('اختر ملف PDF لا يزيد حجمه عن 20 ميجابايت');
        return;
      }
      setUploadingId(examId);
      try {
        await onUploadFile(examId, file);
      } finally {
        setUploadingId(null);
      }
    };
    input.click();
  };
  const [activeSubTab, setActiveSubTab] = useState<'exams' | 'books'>('exams');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBook, setSelectedBook] = useState<string>('all');
  const [viewingExam, setViewingExam] = useState<ExamItem | null>(null);

  // The server limits each user's exam files and content to their allow-list (API-06).
  const examScope = AuthService.getPermissions()?.exams;
  const isRestrictedScope = Array.isArray(examScope);
  const canWriteExams = AuthService.can('exams.write');

  const filteredExams = exams.filter((e) => {
    // Editors see every exam; others see the ones they may open.
    // (A paper locked until its exam is still listed, with the time it opens.)
    if (!canWriteExams && e.canOpen === false && !e.lockedUntil) return false;
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

  const canDownload = AuthService.can('exams.file');
  const canWrite = AuthService.can('exams.write');
  const canDelete = AuthService.can('exams.delete');
  const canEditBooks = AuthService.can('books.write');

  // The PDF is fetched with the session token and opened as a blob URL
  // (browsers block opening data: URLs in new tabs).
  const handleOpenPdf = async (exam: ExamItem) => {
    if (!exam.hasFile || !canDownload || exam.canOpen === false) {
      setViewingExam(exam);
      return;
    }
    const win = window.open('', '_blank');
    try {
      const url = await DataService.examFileUrl(exam.id);
      if (win) win.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      win?.close();
      toast.error(errorMessage(err));
    }
  };



  return (
    <div className="space-y-6 text-right">
      <PageHeader
        icon="menu_book"
        title="الامتحانات والكتب"
        subtitle={`${exams.length} امتحان`}
        actions={
          <>
            <button type="button" onClick={onOpenAddExam} hidden={!canWrite} className={primaryAction}>
              <span className="material-symbols-outlined text-lg">upload_file</span>
              <span>إضافة امتحان PDF</span>
            </button>
            <button type="button" onClick={onOpenAddBook} hidden={!canEditBooks} className={quietAction}>
              <span className="material-symbols-outlined text-lg">library_add</span>
              <span>كتاب مقرر</span>
            </button>
          </>
        }
      />

      {/* Subtabs Switcher: Exams vs Books */}
      <div className="flex items-center justify-between border-b border-line/40 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('exams')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'exams'
                ? 'bg-brand text-white shadow-xs'
                : 'bg-white text-ink-soft border border-line/60 hover:bg-tint'
            }`}
          >
            <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
            <span>نماذج الامتحانات وPDF</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-white/20 text-white font-mono">
              {exams.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('books')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'books'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-ink-soft border border-line/60 hover:bg-amber-50'
            }`}
          >
            <span className="material-symbols-outlined text-sm">auto_stories</span>
            <span>الكتب والمتون المقررة</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-900 font-mono">
              {savedBooks.length}
            </span>
          </button>
        </div>

        {/* Quick action helper */}
        {activeSubTab === 'books' ? (
          <button
            onClick={onOpenAddBook}
            hidden={!canEditBooks}
            className="text-xs text-amber-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">add_circle</span>
            <span>إضافة متن جديد</span>
          </button>
        ) : (
          <button
            onClick={onOpenAddExam}
            hidden={!canWrite}
            className="text-xs text-brand font-bold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">upload_file</span>
            <span>رفع نموذج امتحان</span>
          </button>
        )}
      </div>

      {/* VIEW 1: EXAMS LIST */}
      {activeSubTab === 'exams' && (
        <>
          {/* Scope Restriction Alert Banner */}
          {isRestrictedScope && (
            <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-300 text-teal-950 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-teal-700 text-lg">lock_person</span>
                <span>
                  <strong>نطاق الصلاحية المخصص:</strong> يظهر لك فقط الامتحانات المصرح لك بالدخول على تفاصيلها وتصحيحها ({filteredExams.length} من أصل {exams.length}).
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-teal-200 text-teal-950 text-xs font-bold">
                مصحح معتمد
              </span>
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-line/40 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-muted block font-semibold">إجمالي نماذج الامتحانات</span>
                <span className="text-2xl font-mono font-bold text-brand">{exams.length}</span>
              </div>
              <span className="w-10 h-10 rounded-xl bg-tint text-brand flex items-center justify-center font-bold">
                <span className="material-symbols-outlined">description</span>
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-line/40 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-muted block font-semibold">الكتب المقررة المعتمدة</span>
                <span className="text-2xl font-mono font-bold text-amber-600">{savedBooks.length}</span>
              </div>
              <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                <span className="material-symbols-outlined">auto_stories</span>
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-line/40 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-muted block font-semibold">ملفات PDF المرفوعة</span>
                <span className="text-2xl font-mono font-bold text-blue-700">{exams.filter((e) => e.hasFile).length} ملفات</span>
              </div>
              <span className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                <span className="material-symbols-outlined">file_present</span>
              </span>
            </div>
          </div>

          {/* Filter and Search */}
          <div className="bg-white p-4 rounded-2xl border border-line/50 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:flex-1">
              <span className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted">
                <span className="material-symbols-outlined text-lg">search</span>
              </span>
              <input
                type="text"
                placeholder="بحث في الامتحانات بالاسم أو الكتاب أو الفرع..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-canvas border border-line rounded-xl pr-10 pl-3 py-2 text-xs outline-none focus:border-brand"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <span className="text-xs font-semibold text-muted whitespace-nowrap">
                تصفية بالكتاب:
              </span>
              <select
                value={selectedBook}
                onChange={(e) => setSelectedBook(e.target.value)}
                className="bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-brand w-full md:w-60"
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
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-5">
            {filteredExams.map((exam) => (
              <div
                key={exam.id}
                className="bg-white rounded-2xl border border-line/60 hover:border-brand/50 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-line/30">
                    <div>
                      <h3 className="font-bold text-sm text-ink leading-snug">
                        {exam.title}
                      </h3>
                      <span className="inline-flex items-center gap-1 text-xs text-brand font-semibold mt-1">
                        <span className="material-symbols-outlined text-xs">auto_stories</span>
                        <span>{exam.book}</span>
                      </span>
                    </div>

                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-tint text-brand border border-brand-light shrink-0">
                      {exam.branch}
                    </span>
                  </div>

                  {/* Meta stats */}
                  <div className="grid grid-cols-3 gap-2 bg-canvas p-3 rounded-xl border border-line/30 mb-4 text-center text-xs">
                    <div>
                      <span className="text-xs text-muted block">الدرجة الكلية</span>
                      <span className="font-mono font-bold text-ink">{exam.totalMarks} د</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted block">مدة الامتحان</span>
                      <span className="font-mono font-bold text-ink">{exam.durationMinutes} دقيقة</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted block">عدد الأسئلة</span>
                      <span className="font-mono font-bold text-ink">{exam.questionsCount || 5} أسئلة</span>
                    </div>
                  </div>

                  {/* PDF File Box */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/60 border border-emerald-200 mb-4">
                    <div className="flex items-center gap-2.5">
                      <span className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0">
                        <span className="material-symbols-outlined text-xl">picture_as_pdf</span>
                      </span>
                      <div className="text-right">
                        <span title={exam.hasFile ? exam.pdfFileName : undefined} className="font-bold text-xs text-emerald-950 block truncate max-w-[200px]">
                          {exam.hasFile ? exam.pdfFileName : 'لم يُرفع ملف أسئلة بعد'}
                        </span>
                        <span className="text-xs text-emerald-700">
                          {exam.hasFile && exam.pdfFileSize ? `${exam.pdfFileSize} • ` : ''}أضيف في: {shortDate(exam.uploadedAt)}
                        </span>
                      </div>
                    </div>
                    {canWrite && onUploadFile && (
                      <button
                        type="button"
                        onClick={() => pickFile(exam.id)}
                        disabled={uploadingId === exam.id}
                        className="px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-white text-emerald-800 text-xs font-bold hover:bg-emerald-50 cursor-pointer disabled:opacity-60 shrink-0"
                      >
                        {uploadingId === exam.id ? 'جارٍ الرفع…' : exam.hasFile ? 'استبدال الملف' : 'رفع ملف PDF'}
                      </button>
                    )}
                  </div>

                  {/* Notes */}
                  {exam.notes && (
                    <p className="text-xs text-muted bg-white p-2.5 rounded-xl border border-line/30 mb-4 italic leading-relaxed">
                      <strong className="text-ink not-italic">تعليمات: </strong>
                      {exam.notes}
                    </p>
                  )}
                </div>

                {(exam.lockedUntil || exam.opensAt) && (
                  <p className={`text-xs font-bold rounded-lg px-2.5 py-1.5 border ${exam.lockedUntil ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {exam.lockedUntil
                      ? `🔒 مقفول — تُتاح الورقة ${new Date(exam.lockedUntil).toLocaleString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}`
                      : `🕒 موعد الامتحان: ${new Date(exam.opensAt!).toLocaleString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}`}
                  </p>
                )}

                {/* Actions */}
                <div className="pt-3 border-t border-line/30 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenPdf(exam)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-brand text-white text-xs font-bold hover:bg-success transition-colors shadow-xs active:scale-[0.98] cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">visibility</span>
                    <span>{exam.hasFile && canDownload && exam.canOpen !== false ? 'فتح ورقة الامتحان (PDF)' : 'تفاصيل الامتحان'}</span>
                  </button>



                  {canDelete && <button
                    onClick={() => {
                      if (window.confirm(`هل أنت متأكد من حذف "${exam.title}"؟`)) {
                        onDeleteExam(exam.id);
                      }
                    }}
                    title="حذف الامتحان"
                    aria-label="حذف الامتحان"
                    className="p-2 rounded-xl border border-line text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">delete</span>
                  </button>}
                </div>
              </div>
            ))}
          </div>

          {filteredExams.length === 0 && (
            <div className="bg-white rounded-2xl p-12 text-center border border-line/40 shadow-xs">
              <span className="material-symbols-outlined text-4xl text-muted mb-2 block">
                find_in_page
              </span>
              <h3 className="font-bold text-base text-ink mb-1">لا توجد امتحانات مطابقة للبحث</h3>
              <p className="text-xs text-muted mb-4">
                يمكنك إضافة أول نموذج امتحان ورفع ملف PDF الخاص به بسهولة.
              </p>
              <button
                onClick={onOpenAddExam}
            hidden={!canWrite}
                className="px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold hover:bg-success cursor-pointer"
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
          <div className="bg-white p-4 rounded-2xl border border-line/50 shadow-xs flex items-center justify-between">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted">
                <span className="material-symbols-outlined text-lg">search</span>
              </span>
              <input
                type="text"
                placeholder="بحث في الكتب والمتون المقررة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-canvas border border-line rounded-xl pr-10 pl-3 py-2 text-xs outline-none focus:border-amber-600"
              />
            </div>
            <button
              onClick={onOpenAddBook}
            hidden={!canEditBooks}
              className="mr-3 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">library_add</span>
              <span>+ إضافة كتاب جديد</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBooks.map((bookName, idx) => {
              const bookExams = exams.filter((e) => e.book === bookName);
              return (
                <div
                  key={idx}
                  className="bg-white p-4 rounded-2xl border border-line/50 hover:border-amber-500 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
                        #{idx + 1}
                      </span>
                      <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        معتمد في المسابقة
                      </span>
                    </div>

                    <h4 className="font-bold text-sm text-ink mb-1.5 leading-snug">
                      {bookName}
                    </h4>

                    <div className="text-xs text-muted space-y-1 mb-3 bg-canvas p-2.5 rounded-xl border border-line/30">
                      <div className="flex justify-between">
                        <span>نماذج الامتحانات المرفوعة:</span>
                        <strong className="text-ink font-mono">{bookExams.length} نماذج</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>التصنيف:</span>
                        <strong className="text-amber-800">متون علمية معتمدة</strong>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-line/20 flex items-center justify-between text-xs">
                    <button
                      onClick={() => {
                        setSelectedBook(bookName);
                        setActiveSubTab('exams');
                      }}
                      className="text-brand font-bold hover:underline cursor-pointer"
                    >
                      عرض امتحانات الكتاب &larr;
                    </button>

                    {onDeleteBook && canEditBooks && (
                      <button
                        onClick={() => {
                          if (window.confirm(`هل أنت متأكد من حذف "${bookName}"؟`)) {
                            onDeleteBook(bookName);
                          }
                        }}
                        className="text-gray-400 hover:text-red-600 p-1"
                        title="حذف هذا الكتاب"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
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
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl max-h-[92vh] overflow-y-auto border border-line/50 text-right animate-in fade-in">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-line/30">
              <div className="flex items-center gap-2 text-brand">
                <span className="material-symbols-outlined text-2xl">picture_as_pdf</span>
                <h3 className="font-bold text-base text-ink">{viewingExam.title}</h3>
              </div>
              <button
                onClick={() => setViewingExam(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="bg-canvas p-5 rounded-2xl border border-line/40 space-y-3 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-line/30">
                <span className="font-bold text-brand">مسابقات مسجد البخاري العلمية</span>
                <span className="font-mono text-muted">{viewingExam.uploadedAt}</span>
              </div>

              <div>
                <span className="font-bold text-sm text-ink block mb-1">{viewingExam.title}</span>
                <p className="text-ink-soft">
                  <strong>الكتاب المقرر:</strong> {viewingExam.book} | <strong>الفرع:</strong> {viewingExam.branch}
                </p>
                <p className="text-ink-soft">
                  <strong>الدرجة الكلية:</strong> {viewingExam.totalMarks} درجة | <strong>المدة:</strong> {viewingExam.durationMinutes} دقيقة
                </p>
              </div>

              <div className="p-4 bg-white rounded-xl border border-line/30 space-y-2">
                <span className="font-bold text-xs text-brand block">
                  📄 {viewingExam.hasFile ? `ملف الأسئلة: ${viewingExam.pdfFileName}` : 'لم يُرفع ملف أسئلة لهذا الامتحان'}
                </span>
                {viewingExam.hasFile && !canDownload && (
                  <p className="text-[12px] text-ink-soft leading-relaxed">
                    تنزيل ملف الأسئلة متاح للمشرف العام ورؤساء اللجان فقط.
                  </p>
                )}
                {viewingExam.notes && (
                  <p className="text-xs text-muted border-t border-gray-100 pt-2">
                    <strong>التعليمات:</strong> {viewingExam.notes}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-line/30 flex justify-between items-center">


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
