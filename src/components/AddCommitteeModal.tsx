import React, { useState } from 'react';
import { Committee, StageKey, Course } from '../types';
import { todayISO } from '../utils/stageUtils';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface AddCommitteeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCommittee: (newCommittee: Committee, newBookName?: string) => unknown;
  nextCommitteeNumber: number;
  savedBooks: string[];
  courses?: Course[];
  defaultCourseId?: string;
  onAddCourse?: (newCourse: Omit<Course, 'id' | 'createdAt'>) => Promise<Course | undefined>;
}

export const AddCommitteeModal: React.FC<AddCommitteeModalProps> = ({
  isOpen,
  onClose,
  onAddCommittee,
  nextCommitteeNumber,
  savedBooks,
  courses = [],
  defaultCourseId,
  onAddCourse,
}) => {
  const [committeeName, setCommitteeName] = useState('');
  const [committeeNumber, setCommitteeNumber] = useState(nextCommitteeNumber);
  const [initialStage, setInitialStage] = useState<StageKey>('exam');
  const [selectedCourseId, setSelectedCourseId] = useState<string>(() => {
    return defaultCourseId || courses.find((c) => c.status === 'active')?.id || courses[0]?.id || '';
  });
  const [members, setMembers] = useState<string[]>(['']);
  const [associationName, setAssociationName] = useState('');
  const [branch, setBranch] = useState('');
  const [competitionBook, setCompetitionBook] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');

  // البيانات الجديدة المطلوبة
  const [isWomenCommittee, setIsWomenCommittee] = useState<boolean>(false);
  const [sheikhName, setSheikhName] = useState<string>('');
  const [sheikhPhone, setSheikhPhone] = useState<string>('');
  const [sheikhCountry, setSheikhCountry] = useState<string>('');
  const [studentsCount, setStudentsCount] = useState<number | ''>('');
  const [questionsCount, setQuestionsCount] = useState<number>(5);

  // Inline quick course creation state
  const [isCreatingInline, setIsCreatingInline] = useState(false);
  const [quickCourseName, setQuickCourseName] = useState('');

  useEscapeKey(onClose);

  if (!isOpen) return null;

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];

  const handleQuickCreateCourse = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = quickCourseName.trim();
    if (!trimmed || !onAddCourse) return;
    const created = await onAddCourse({
      name: trimmed,
      year: '',
      startDate: todayISO(),
      endDate: '',
      status: 'active',
      isDefault: false,
    });
    if (!created) return;
    setSelectedCourseId(created.id);

    setQuickCourseName('');
    setIsCreatingInline(false);
  };

  // Member management
  const handleMemberChange = (index: number, val: string) => {
    const updated = [...members];
    updated[index] = val;
    setMembers(updated);
  };

  const handleAddMemberField = () => {
    setMembers([...members, '']);
  };

  const handleRemoveMemberField = (index: number) => {
    if (members.length === 1) {
      setMembers(['']);
      return;
    }
    const updated = members.filter((_, i) => i !== index);
    setMembers(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!committeeName.trim() || !selectedCourseId) return;

    const finalMembers = members.map((m) => m.trim()).filter(Boolean);

    // The server stamps completed stages with its own time; this value is only a placeholder.
    const currentFormattedTime = new Date().toISOString();

    // Setup initial stages status based on initialStage selection
    const isInitialExam = initialStage === 'exam';
    const isInitialScoring = initialStage === 'scoring';
    const isInitialAggregation = initialStage === 'aggregation';
    const isInitialReview = initialStage === 'review';
    const isInitialSheet = initialStage === 'sheet';
    const isInitialAccreditation = initialStage === 'accreditation';
    const isInitialAnnouncement = initialStage === 'announcement';
    const isInitialCeremony = initialStage === 'ceremony';

    const newCommittee: Committee = {
      id: `comm-${crypto.randomUUID()}`,
      committeeNumber,
      committeeName: committeeName.trim(),
      associationName: associationName.trim() || undefined,
      members: finalMembers,
      branch: branch.trim(),
      competitionBook: competitionBook.trim(),
      generalNotes: generalNotes.trim(),
      stages: {
        registration: { completed: true, completedAt: currentFormattedTime },
        exam: {
          completed: !isInitialExam,
          completedAt: !isInitialExam ? currentFormattedTime : undefined,
        },
        scoring: {
          completed:
            isInitialAggregation ||
            isInitialReview ||
            isInitialSheet ||
            isInitialAccreditation ||
            isInitialAnnouncement ||
            isInitialCeremony,
          completedAt:
            isInitialAggregation ||
            isInitialReview ||
            isInitialSheet ||
            isInitialAccreditation ||
            isInitialAnnouncement ||
            isInitialCeremony
              ? currentFormattedTime
              : undefined,
        },
        aggregation: {
          completed:
            isInitialReview ||
            isInitialSheet ||
            isInitialAccreditation ||
            isInitialAnnouncement ||
            isInitialCeremony,
          completedAt:
            isInitialReview ||
            isInitialSheet ||
            isInitialAccreditation ||
            isInitialAnnouncement ||
            isInitialCeremony
              ? currentFormattedTime
              : undefined,
        },
        review: {
          completed:
            isInitialSheet ||
            isInitialAccreditation ||
            isInitialAnnouncement ||
            isInitialCeremony,
          completedAt:
            isInitialSheet ||
            isInitialAccreditation ||
            isInitialAnnouncement ||
            isInitialCeremony
              ? currentFormattedTime
              : undefined,
        },
        sheet: {
          completed:
            isInitialAccreditation ||
            isInitialAnnouncement ||
            isInitialCeremony,
          completedAt:
            isInitialAccreditation ||
            isInitialAnnouncement ||
            isInitialCeremony
              ? currentFormattedTime
              : undefined,
        },
        accreditation: {
          completed: isInitialAnnouncement || isInitialCeremony,
          completedAt:
            isInitialAnnouncement || isInitialCeremony
              ? currentFormattedTime
              : undefined,
        },
        announcement: {
          completed: isInitialCeremony,
          completedAt: isInitialCeremony ? currentFormattedTime : undefined,
        },
        ceremony: {
          completed: isInitialCeremony,
          completedAt: isInitialCeremony ? currentFormattedTime : undefined,
        },
      },
      createdDate: todayISO(),
      createdAtTime: currentFormattedTime.split(' - ')[1] || '',
      courseId: selectedCourseId,
      courseName: courses.find((c) => c.id === selectedCourseId)?.name,
      sheikhName: sheikhName.trim() || undefined,
      sheikhPhone: sheikhPhone.trim() || undefined,
      sheikhCountry: sheikhCountry.trim() || undefined,
      studentsCount: typeof studentsCount === 'number' && !isNaN(studentsCount) ? studentsCount : undefined,
      isWomenCommittee,
      scoringDetails: {
        scorerName: finalMembers[0] || '',
        scoringReviewerName: finalMembers[1] || '',
        questions: Array.from({ length: questionsCount }, (_, i) => ({
          id: `q-${i + 1}`,
          questionNumber: i + 1,
          label: `السؤال ${i + 1}`,
          completed: false,
        })),
      },
      aggregationDetails: {
        aggregatorName: finalMembers[1] || finalMembers[0] || '',
        scoringReviewerName: finalMembers[0] || '',
        aggregationReviewerName: finalMembers[2] || '',
        reviewConfirmed: false,
      },
    };

    onAddCommittee(newCommittee, competitionBook.trim() || undefined);
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="إضافة لجنة جديدة" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-line/50 overflow-hidden animate-in fade-in duration-150 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-canvas border-b border-line/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-brand">
            <span className="material-symbols-outlined text-2xl">add_circle</span>
            <h3 className="font-bold text-base text-ink">إضافة لجنة جديدة</h3>
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
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-right overflow-y-auto flex-1">
          {/* 1. اسم اللجنة والدورة التابعة لها */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink mb-1">
                اسم اللجنة <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder=""
                value={committeeName}
                onChange={(e) => setCommitteeName(e.target.value)}
                className="w-full bg-canvas border border-line rounded-xl px-3.5 py-2.5 text-xs text-ink outline-none focus:border-brand focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1">
                الدورة المسابقاتية التابعة لها <span className="text-red-500">*</span>
              </label>

              <select
                required
                value={isCreatingInline ? '__new__' : selectedCourseId}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setIsCreatingInline(true);
                  } else {
                    setIsCreatingInline(false);
                    setSelectedCourseId(e.target.value);
                  }
                }}
                className="w-full bg-canvas border border-line rounded-xl px-3 py-2.5 text-xs font-bold text-brand outline-none focus:border-brand"
              >
                {courses.length > 0 ? (
                  courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name} {course.status === 'active' ? '⚡ (نشطة حالياً)' : ''}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>لا توجد دورات بعد — أضف دورة أولاً</option>
                )}
                {onAddCourse && (
                  <option value="__new__">➕ + إضافة دورة جديدة...</option>
                )}
              </select>

              {/* Inline input if user selected "+ إضافة دورة جديدة..." from the dropdown */}
              {isCreatingInline && (
                <div className="mt-1.5 p-2 bg-emerald-50 rounded-xl border border-emerald-300 flex items-center gap-1.5 animate-in fade-in duration-150">
                  <input
                    type="text"
                    placeholder="اكتب اسم الدورة الجديدة (مثال: دورة السمر 2026)..."
                    value={quickCourseName}
                    onChange={(e) => setQuickCourseName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleQuickCreateCourse();
                      }
                    }}
                    className="flex-1 bg-white border border-emerald-300 rounded-lg px-2.5 py-1.5 text-xs text-ink outline-none font-semibold focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={() => handleQuickCreateCourse()}
                    disabled={!quickCourseName.trim()}
                    className="px-3 py-1.5 rounded-lg bg-brand hover:bg-success text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-40 shrink-0 shadow-2xs"
                  >
                    حفظ وإسناد
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingInline(false);
                      setQuickCourseName('');
                    }}
                    className="p-1.5 text-gray-400 hover:text-gray-700 text-xs cursor-pointer shrink-0"
                    title="إلغاء"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Course confirmation badge */}
              {!isCreatingInline && selectedCourse && (
                <div className="mt-1.5 flex items-center justify-between text-xs text-ink-soft bg-emerald-50/70 p-1.5 rounded-lg border border-emerald-200">
                  <span className="font-semibold text-emerald-900 truncate">
                    ✓ ربط تلقائي بـ: <strong>{selectedCourse.name}</strong>
                  </span>
                  <span className="font-mono text-emerald-700 font-bold shrink-0">
                    {selectedCourse.season || ''}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* عدد الطلاب في اللجنة + خيار لجنة نسائية (اختياري) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-gradient-to-l from-slate-50 to-emerald-50/40 rounded-xl border border-line/50">
            {/* عدد الطلاب في اللجنة */}
            <div>
              <label className="block text-xs font-bold text-ink mb-1.5">
                عدد الطلاب في اللجنة
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder=""
                  value={studentsCount}
                  onChange={(e) =>
                    setStudentsCount(e.target.value === '' ? '' : parseInt(e.target.value) || 0)
                  }
                  className="flex-1 bg-white border border-line rounded-xl px-3 py-2 text-xs font-bold font-mono outline-none focus:border-brand"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setStudentsCount((prev) => Math.max(1, (Number(prev) || 0) - 1))
                    }
                    className="w-8 h-8 rounded-lg bg-white border border-line hover:bg-gray-100 text-xs font-bold cursor-pointer text-ink"
                    title="إنقاص طالب"
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setStudentsCount((prev) => (Number(prev) || 0) + 1)
                    }
                    className="w-8 h-8 rounded-lg bg-white border border-line hover:bg-gray-100 text-xs font-bold cursor-pointer text-ink"
                    title="زيادة طالب"
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setStudentsCount((prev) => (Number(prev) || 0) + 5)
                    }
                    className="px-2 h-8 rounded-lg bg-white border border-line hover:bg-gray-100 text-xs font-bold cursor-pointer text-brand"
                    title="زيادة 5 طلاب"
                  >
                    +5
                  </button>
                </div>
              </div>
              <span className="text-xs text-muted mt-1 block">
                {studentsCount ? `${studentsCount} ${isWomenCommittee ? 'طالبة مسجلة' : 'طالباً مسجلاً'}` : 'لم يُحدد'}
              </span>
            </div>

            {/* عدد الأسئلة في الاختبار */}
            <div>
              <label className="block text-xs font-bold text-ink mb-1.5">
                عدد الأسئلة في الاختبار المقرر
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={questionsCount}
                  onChange={(e) => setQuestionsCount(parseInt(e.target.value) || 5)}
                  className="flex-1 bg-white border border-line rounded-xl px-3 py-2 text-xs font-bold font-mono outline-none focus:border-brand"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setQuestionsCount((prev) => Math.max(1, prev - 1))}
                    className="w-8 h-8 rounded-lg bg-white border border-line hover:bg-gray-100 text-xs font-bold cursor-pointer"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuestionsCount((prev) => Math.min(50, prev + 1))}
                    className="w-8 h-8 rounded-lg bg-white border border-line hover:bg-gray-100 text-xs font-bold cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* خيار: لجنة نسائية (اختياري) */}
            <div className="flex flex-col justify-center">
              <label className="text-xs font-bold text-ink mb-1.5 block">
                تخصيص نسائي (اختياري)
              </label>
              <label
                className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                  isWomenCommittee
                    ? 'bg-rose-50/80 border-rose-300 ring-2 ring-rose-200'
                    : 'bg-white border-line hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isWomenCommittee}
                  onChange={(e) => setIsWomenCommittee(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 accent-rose-700 cursor-pointer"
                />
                <div className="flex items-center gap-1.5 select-none">
                  <span className="text-base">🧕</span>
                  <div>
                    <span className="text-xs font-bold text-ink block leading-tight">
                      لجنة نسائية
                    </span>
                    <span className="text-xs text-muted block">
                      (تفعيل في حال كانت اللجنة مخصصة للطالبات / الأخوات)
                    </span>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* بيانات الشيخ المرسل إليه */}
          <div className="bg-canvas border border-line/60 p-3.5 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base">person_pin</span>
                <span>بيانات الشيخ المرسل إليه:</span>
              </span>
              <span className="text-xs text-muted">
                (المسؤول عن تسليم واستلام الاختبارات)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* اسم الشيخ المرسل إليه */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  اسم الشيخ المرسل إليه
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder=""
                    value={sheikhName}
                    onChange={(e) => setSheikhName(e.target.value)}
                    className="w-full bg-white border border-line rounded-xl px-3 py-2 text-xs text-ink outline-none focus:border-brand"
                  />
                </div>
              </div>

              {/* رقم هاتف الشيخ */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  رقم هاتف الشيخ
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  placeholder=""
                  value={sheikhPhone}
                  onChange={(e) => setSheikhPhone(e.target.value)}
                  className="w-full bg-white border border-line rounded-xl px-3 py-2 text-xs text-ink outline-none focus:border-brand text-right font-mono"
                />
              </div>

              {/* مكان الشيخ (المسجد / القاعة / البلد) */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  مكان الشيخ (المسجد / القاعة / البلد)
                </label>
                <input
                  type="text"
                  placeholder=""
                  value={sheikhCountry}
                  onChange={(e) => setSheikhCountry(e.target.value)}
                  className="w-full bg-white border border-line rounded-xl px-3 py-2 text-xs text-ink outline-none focus:border-brand"
                />
              </div>
            </div>
          </div>

          {/* 2. رقم اللجنة + المرحلة الأولية */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink mb-1">
                رقم اللجنة (تسلسلي تلقائي)
              </label>
              <input
                type="number"
                value={committeeNumber}
                onChange={(e) =>
                  setCommitteeNumber(parseInt(e.target.value) || nextCommitteeNumber)
                }
                className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs font-bold font-mono outline-none focus:border-brand"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1">
                المرحلة الأولية
              </label>
              <select
                value={initialStage}
                onChange={(e) => setInitialStage(e.target.value as StageKey)}
                className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-brand"
              >
                <option value="exam">🟦 في انتظار الامتحان</option>
                <option value="scoring">✅ تم الامتحان (في التصحيح)</option>
                <option value="aggregation">🔵 في التجميع</option>
                <option value="review">🟡 في المراجعة</option>
                <option value="sheet">🟣 كتابة الكشف (تمت المراجعة)</option>
                <option value="announcement">📢 إعلان النتيجة (تم الاعتماد)</option>
                <option value="ceremony">🎉 في انتظار الحفل (تم الإعلان)</option>
              </select>
            </div>
          </div>

          {/* 3. أعضاء اللجنة (أكثر من خانة ديناميكية) */}
          <div className="bg-canvas border border-line/40 p-3.5 rounded-xl space-y-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-ink">
                أعضاء اللجنة (مراقبي الامتحانات)
              </label>
              <button
                type="button"
                onClick={handleAddMemberField}
                className="text-xs text-brand font-bold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                <span>+ إضافة عضو آخر</span>
              </button>
            </div>

            {/* Quick Preset Chips for Committee Members / Exam Observers */}
            <div className="space-y-1.5 mb-2">
              <span className="text-[11px] font-bold text-slate-600 block">
                اختر من أعضاء ومراقبي الامتحانات (انقر للإضافة الفورية):
              </span>
              <div className="flex items-center gap-1.5 flex-wrap max-h-36 overflow-y-auto p-2 bg-white rounded-xl border border-line/50">
                {[
                  'أحمد الضليل',
                  'أحمد المخزنجي',
                  'أحمد سلامة الهلباوي',
                  'أحمد عبد الخالق',
                  'أحمد ماهر',
                  'أسامة عكاشة',
                  'إبراهيم أبو صقر',
                  'إبراهيم أبو موسى 2',
                  'رشاد',
                  'رضا أبو جندي 2',
                  'سلامة البنا',
                  'سلامة زلابية',
                  'سمير أبو علفة',
                  'شيخ احمد صابح',
                  'شيخ ايمن احمد البرانيه',
                  'عبد الله سيد أحمد',
                  'علاء عبد الجليل',
                  'عمر محمود مجدي',
                  'مجاهد السروي',
                  'محمد سلامة',
                  'محمد فرحات',
                  'محمود عبده عيد',
                  'هاني صبري 2',
                  'وليد عبد السلام',
                  'ياسر سلامة',
                  'يوسف المخزنجي',
                  'أدهم مقلد',
                  'محمد النحاس',
                  'محمد ضياء',
                  'معاذ أبو عنبة',
                  'محمد عماد',
                  'أحمد عطا',
                  'محمود الحراني',
                  'محمود المسلماني',
                  'بكر خالد',
                ].map((name) => {
                  const isAdded = members.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        if (isAdded) {
                          if (members.length > 1) {
                            setMembers(members.filter((m) => m !== name));
                          }
                        } else {
                          if (members.length === 1 && members[0].trim() === '') {
                            setMembers([name]);
                          } else {
                            setMembers([...members, name]);
                          }
                        }
                      }}
                      className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        isAdded
                          ? 'bg-brand text-white shadow-2xs'
                          : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 border border-slate-200'
                      }`}
                    >
                      <span>{isAdded ? '✓' : '+'}</span>
                      <span>{name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              {members.map((member, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted w-14 shrink-0">
                    {idx === 0 ? 'الرئيس:' : `عضو ${idx + 1}:`}
                  </span>
                  <input
                    type="text"
                    placeholder=""
                    value={member}
                    onChange={(e) => handleMemberChange(idx, e.target.value)}
                    className="flex-1 bg-white border border-line rounded-xl px-3 py-1.5 text-xs text-ink outline-none focus:border-brand"
                  />
                  {members.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMemberField(idx)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"
                      title="حذف هذا العضو"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 4. اسم الجمعية (إن وُجد) + الفرع (يكتبه بيده) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink mb-1">
                اسم الجمعية (إن وُجد)
              </label>
              <input
                type="text"
                placeholder=""
                value={associationName}
                onChange={(e) => setAssociationName(e.target.value)}
                className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1">
                الفرع (يكتبه بيده)
              </label>
              <input
                type="text"
                placeholder=""
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-brand"
              />
            </div>
          </div>

          {/* 5. مسار المسابقة / كتاب المسابقة (يكتبه بنفسه ومحفوظ كاقتراحات) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-ink">
                مسار المسابقة / الكتاب المقرر
              </label>
              <span className="text-xs text-muted">
                (يتم حفظ أي كتاب جديد تلقائياً في النظام)
              </span>
            </div>
            <div className="relative">
              <input
                type="text"
                list="competition-books-list"
                placeholder=""
                value={competitionBook}
                onChange={(e) => setCompetitionBook(e.target.value)}
                className="w-full bg-canvas border border-line rounded-xl px-3.5 py-2.5 text-xs text-ink outline-none focus:border-brand focus:bg-white"
              />
              <datalist id="competition-books-list">
                {savedBooks.map((b, i) => (
                  <option key={i} value={b} />
                ))}
              </datalist>
            </div>

            {/* Quick suggested chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-xs text-muted self-center">اقتراحات سريعة:</span>
              {savedBooks.slice(0, 4).map((b, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setCompetitionBook(b)}
                  className="px-2 py-0.5 rounded-lg text-xs bg-tint text-brand hover:bg-brand-light/40 border border-line/40 transition-colors"
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* 6. ملاحظات عامة نصية حرة خاصة باللجنة */}
          <div>
            <label className="block text-xs font-bold text-ink mb-1">
              ملاحظات عامة على اللجنة
            </label>
            <textarea
              rows={2}
              placeholder=""
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              className="w-full bg-canvas border border-line rounded-xl p-2.5 text-xs text-ink outline-none focus:border-brand focus:bg-white"
            />
          </div>

          {/* Submit Buttons */}
          <div className="pt-3 border-t border-line/30 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-ink-soft border border-line hover:bg-gray-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-[#0f766e] hover:bg-brand shadow-xs active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">check</span>
              <span>تسجيل لجنة</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
