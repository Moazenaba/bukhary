import React, { useState } from 'react';
import { Committee, StageKey, Course } from '../types';
import { getCurrentFormattedDateTime } from '../utils/stageUtils';

interface AddCommitteeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCommittee: (newCommittee: Committee, newBookName?: string) => void;
  nextCommitteeNumber: number;
  savedBooks: string[];
  courses?: Course[];
  defaultCourseId?: string;
  onAddCourse?: (newCourse: Omit<Course, 'id' | 'createdAt'>) => Course | void;
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
  if (!isOpen) return null;

  const [committeeName, setCommitteeName] = useState('');
  const [committeeNumber, setCommitteeNumber] = useState(nextCommitteeNumber);
  const [initialStage, setInitialStage] = useState<StageKey>('exam');
  const [selectedCourseId, setSelectedCourseId] = useState<string>(() => {
    return defaultCourseId || courses.find((c) => c.status === 'active')?.id || courses[0]?.id || 'course-summer-1447';
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
  const [studentsCount, setStudentsCount] = useState<number | ''>(20);

  // Inline quick course creation state
  const [isCreatingInline, setIsCreatingInline] = useState(false);
  const [quickCourseName, setQuickCourseName] = useState('');

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];

  const handleQuickCreateCourse = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = quickCourseName.trim();
    if (!trimmed) return;

    if (onAddCourse) {
      const created = onAddCourse({
        name: trimmed,
        season: 'موسمية',
        year: '1448هـ / 2026م',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        status: 'active',
        targetCommitteesCount: 30,
        isDefault: false,
        description: `دورة ${trimmed} المخصصة لمسابقات ولجان مسجد البخاري`,
      });
      if (created && created.id) {
        setSelectedCourseId(created.id);
      }
    }

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
    if (!committeeName.trim()) return;

    const filteredMembers = members.map((m) => m.trim()).filter(Boolean);
    const finalMembers =
      filteredMembers.length > 0 ? filteredMembers : ['فضيلة الشيخ رئيس اللجنة'];

    const currentFormattedTime = getCurrentFormattedDateTime();

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
      id: String(committeeNumber),
      committeeNumber,
      committeeName: committeeName.trim(),
      associationName: associationName.trim() || undefined,
      members: finalMembers,
      branch: branch.trim() || 'الفرع العام',
      competitionBook: competitionBook.trim() || 'مسابقة كتاب الأصول الثلاثة',
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
      createdDate: new Date().toISOString().slice(0, 10),
      createdAtTime: currentFormattedTime.split(' - ')[1] || 'الآن',
      courseId: selectedCourseId || selectedCourse?.id || 'course-summer-1447',
      courseName: courses.find((c) => c.id === selectedCourseId)?.name || selectedCourse?.name || 'دورة الصيف 1447هـ',
      sheikhName: sheikhName.trim() || undefined,
      sheikhPhone: sheikhPhone.trim() || undefined,
      sheikhCountry: sheikhCountry.trim() || undefined,
      studentsCount: typeof studentsCount === 'number' && !isNaN(studentsCount) ? studentsCount : undefined,
      isWomenCommittee,
      scoringDetails: {
        scorerName: finalMembers[0] || 'الشيخ المصحح',
        scoringReviewerName: finalMembers[1] || 'الشيخ مراجع التصحيح',
        questions: [
          { id: 'q-1', questionNumber: 1, label: 'السؤال الأول', completed: false },
          { id: 'q-2', questionNumber: 2, label: 'السؤال الثاني', completed: false },
          { id: 'q-3', questionNumber: 3, label: 'السؤال الثالث', completed: false },
          { id: 'q-4', questionNumber: 4, label: 'السؤال الرابع', completed: false },
          { id: 'q-5', questionNumber: 5, label: 'السؤال الخامس', completed: false },
        ],
      },
      aggregationDetails: {
        aggregatorName: finalMembers[1] || finalMembers[0] || 'مجمع الدرجات',
        scoringReviewerName: finalMembers[0] || 'مراجع التصحيح',
        aggregationReviewerName: finalMembers[2] || 'مراجع التجميع',
        reviewConfirmed: false,
      },
    };

    onAddCommittee(newCommittee, competitionBook.trim() || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-[#bdc9c6]/50 overflow-hidden animate-in fade-in duration-150 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-[#f8f9ff] border-b border-[#bdc9c6]/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#005c55]">
            <span className="material-symbols-outlined text-2xl" aria-hidden="true">add_circle</span>
            <h3 className="font-bold text-base text-[#0d1c2e]">إضافة لجنة جديدة</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-right overflow-y-auto flex-1">
          {/* 1. اسم اللجنة والدورة التابعة لها */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#0d1c2e] mb-1">
                اسم اللجنة <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder=""
                value={committeeName}
                onChange={(e) => setCommitteeName(e.target.value)}
                className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3.5 py-2.5 text-xs text-[#0d1c2e] outline-none focus:border-[#005c55] focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0d1c2e] mb-1">
                الدورة المسابقاتية التابعة لها <span className="text-red-500">*</span>
              </label>

              <select
                value={isCreatingInline ? '__new__' : selectedCourseId}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setIsCreatingInline(true);
                  } else {
                    setIsCreatingInline(false);
                    setSelectedCourseId(e.target.value);
                  }
                }}
                className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2.5 text-xs font-bold text-[#005c55] outline-none focus:border-[#005c55]"
              >
                {courses.length > 0 ? (
                  courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name} {course.status === 'active' ? '⚡ (نشطة حالياً)' : ''}
                    </option>
                  ))
                ) : (
                  <option value="course-summer-1447">دورة الصيف 1447هـ - متون العقيدة والتوحيد</option>
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
                    className="flex-1 bg-white border border-emerald-300 rounded-lg px-2.5 py-1.5 text-xs text-[#0d1c2e] outline-none font-semibold focus:border-[#005c55]"
                  />
                  <button
                    type="button"
                    onClick={() => handleQuickCreateCourse()}
                    disabled={!quickCourseName.trim()}
                    className="px-3 py-1.5 rounded-lg bg-[#005c55] hover:bg-[#1b6b51] text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-40 shrink-0 shadow-2xs"
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
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#3e4947] bg-emerald-50/70 p-1.5 rounded-lg border border-emerald-200">
                  <span className="font-semibold text-emerald-900 truncate">
                    ✓ ربط تلقائي بـ: <strong>{selectedCourse.name}</strong>
                  </span>
                  <span className="font-mono text-emerald-700 font-bold shrink-0">
                    {selectedCourse.season || 'موسمية'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* عدد الطلاب في اللجنة + خيار لجنة نسائية (اختياري) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-gradient-to-l from-slate-50 to-emerald-50/40 rounded-xl border border-[#bdc9c6]/50">
            {/* عدد الطلاب في اللجنة */}
            <div>
              <label className="block text-xs font-bold text-[#0d1c2e] mb-1.5">
                عدد الطلاب في اللجنة
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={500}
                  placeholder=""
                  value={studentsCount}
                  onChange={(e) =>
                    setStudentsCount(e.target.value === '' ? '' : parseInt(e.target.value) || 0)
                  }
                  className="flex-1 bg-white border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs font-bold font-mono outline-none focus:border-[#005c55]"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setStudentsCount((prev) => Math.max(1, (Number(prev) || 0) - 1))
                    }
                    className="w-8 h-8 rounded-lg bg-white border border-[#bdc9c6] hover:bg-gray-100 text-xs font-bold cursor-pointer text-[#0d1c2e]"
                    title="إنقاص طالب"
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setStudentsCount((prev) => (Number(prev) || 0) + 1)
                    }
                    className="w-8 h-8 rounded-lg bg-white border border-[#bdc9c6] hover:bg-gray-100 text-xs font-bold cursor-pointer text-[#0d1c2e]"
                    title="زيادة طالب"
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setStudentsCount((prev) => (Number(prev) || 0) + 5)
                    }
                    className="px-2 h-8 rounded-lg bg-white border border-[#bdc9c6] hover:bg-gray-100 text-[11px] font-bold cursor-pointer text-[#005c55]"
                    title="زيادة 5 طلاب"
                  >
                    +5
                  </button>
                </div>
              </div>
              <span className="text-[10px] text-[#6e7977] mt-1 block">
                {studentsCount ? `${studentsCount} ${isWomenCommittee ? 'طالبة مسجلة' : 'طالباً مسجلاً'}` : 'لم يُحدد'}
              </span>
            </div>

            {/* خيار: لجنة نسائية (اختياري) */}
            <div className="flex flex-col justify-center">
              <label className="text-xs font-bold text-[#0d1c2e] mb-1.5 block">
                تخصيص نسائي (اختياري)
              </label>
              <label
                className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                  isWomenCommittee
                    ? 'bg-rose-50/80 border-rose-300 ring-2 ring-rose-200'
                    : 'bg-white border-[#bdc9c6] hover:bg-gray-50'
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
                    <span className="text-xs font-bold text-[#0d1c2e] block leading-tight">
                      لجنة نسائية
                    </span>
                    <span className="text-[10px] text-[#6e7977] block">
                      (تفعيل في حال كانت اللجنة مخصصة للطالبات / الأخوات)
                    </span>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* بيانات الشيخ المرسل إليه */}
          <div className="bg-[#f8f9ff] border border-[#bdc9c6]/60 p-3.5 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#005c55] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base" aria-hidden="true">person_pin</span>
                <span>بيانات الشيخ المرسل إليه:</span>
              </span>
              <span className="text-[10px] text-[#6e7977]">
                (المسؤول عن تسليم واستلام الاختبارات)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* اسم الشيخ المرسل إليه */}
              <div>
                <label className="block text-[11px] font-bold text-[#0d1c2e] mb-1">
                  اسم الشيخ المرسل إليه
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder=""
                    value={sheikhName}
                    onChange={(e) => setSheikhName(e.target.value)}
                    className="w-full bg-white border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs text-[#0d1c2e] outline-none focus:border-[#005c55]"
                  />
                </div>
              </div>

              {/* رقم هاتف الشيخ */}
              <div>
                <label className="block text-[11px] font-bold text-[#0d1c2e] mb-1">
                  رقم هاتف الشيخ
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  placeholder=""
                  value={sheikhPhone}
                  onChange={(e) => setSheikhPhone(e.target.value)}
                  className="w-full bg-white border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs text-[#0d1c2e] outline-none focus:border-[#005c55] text-right font-mono"
                />
              </div>

              {/* البلد التي منها الشيخ */}
              <div>
                <label className="block text-[11px] font-bold text-[#0d1c2e] mb-1">
                  البلد التي منها الشيخ
                </label>
                <input
                  type="text"
                  placeholder=""
                  value={sheikhCountry}
                  onChange={(e) => setSheikhCountry(e.target.value)}
                  className="w-full bg-white border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs text-[#0d1c2e] outline-none focus:border-[#005c55]"
                />
              </div>
            </div>
          </div>

          {/* 2. رقم اللجنة + المرحلة الأولية */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#0d1c2e] mb-1">
                رقم اللجنة (تسلسلي تلقائي)
              </label>
              <input
                type="number"
                value={committeeNumber}
                onChange={(e) =>
                  setCommitteeNumber(parseInt(e.target.value) || nextCommitteeNumber)
                }
                className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs font-bold font-mono outline-none focus:border-[#005c55]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0d1c2e] mb-1">
                المرحلة الأولية
              </label>
              <select
                value={initialStage}
                onChange={(e) => setInitialStage(e.target.value as StageKey)}
                className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-[#005c55]"
              >
                <option value="exam">🟦 جاري الامتحان الآن</option>
                <option value="scoring">🟠 في التصحيح</option>
                <option value="aggregation">🔵 في التجميع</option>
                <option value="sheet">🟣 كتابة الكشف</option>
                <option value="review">🟡 في المراجعة</option>
                <option value="announcement">📢 إعلان النتيجة</option>
                <option value="ceremony">🟢 تم الحفل</option>
              </select>
            </div>
          </div>

          {/* 3. أعضاء اللجنة (أكثر من خانة ديناميكية) */}
          <div className="bg-[#f8f9ff] border border-[#bdc9c6]/40 p-3.5 rounded-xl space-y-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-[#0d1c2e]">
                أعضاء اللجنة
              </label>
              <button
                type="button"
                onClick={handleAddMemberField}
                className="text-xs text-[#005c55] font-bold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm" aria-hidden="true">add</span>
                <span>+ إضافة عضو آخر</span>
              </button>
            </div>

            <div className="space-y-2">
              {members.map((member, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-[#6e7977] w-14 shrink-0">
                    {idx === 0 ? 'الرئيس:' : `عضو ${idx + 1}:`}
                  </span>
                  <input
                    type="text"
                    placeholder=""
                    value={member}
                    onChange={(e) => handleMemberChange(idx, e.target.value)}
                    className="flex-1 bg-white border border-[#bdc9c6] rounded-xl px-3 py-1.5 text-xs text-[#0d1c2e] outline-none focus:border-[#005c55]"
                  />
                  {members.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMemberField(idx)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"
                      title="حذف هذا العضو"
                    >
                      <span className="material-symbols-outlined text-sm" aria-hidden="true">delete</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 4. اسم الجمعية (إن وُجد) + الفرع (يكتبه بيده) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#0d1c2e] mb-1">
                اسم الجمعية (إن وُجد)
              </label>
              <input
                type="text"
                placeholder=""
                value={associationName}
                onChange={(e) => setAssociationName(e.target.value)}
                className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0d1c2e] mb-1">
                الفرع (يكتبه بيده)
              </label>
              <input
                type="text"
                placeholder=""
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
              />
            </div>
          </div>

          {/* 5. مسار المسابقة / كتاب المسابقة (يكتبه بنفسه ومحفوظ كاقتراحات) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-[#0d1c2e]">
                مسار المسابقة / الكتاب المقرر
              </label>
              <span className="text-[10px] text-[#6e7977]">
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
                className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3.5 py-2.5 text-xs text-[#0d1c2e] outline-none focus:border-[#005c55] focus:bg-white"
              />
              <datalist id="competition-books-list">
                {savedBooks.map((b, i) => (
                  <option key={i} value={b} />
                ))}
              </datalist>
            </div>

            {/* Quick suggested chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[10px] text-[#6e7977] self-center">اقتراحات سريعة:</span>
              {savedBooks.slice(0, 4).map((b, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setCompetitionBook(b)}
                  className="px-2 py-0.5 rounded-lg text-[10px] bg-[#eff4ff] text-[#005c55] hover:bg-[#9cf2e8]/40 border border-[#bdc9c6]/40 transition-colors"
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* 6. ملاحظات عامة نصية حرة خاصة باللجنة */}
          <div>
            <label className="block text-xs font-bold text-[#0d1c2e] mb-1">
              ملاحظات عامة على اللجنة
            </label>
            <textarea
              rows={2}
              placeholder=""
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl p-2.5 text-xs text-[#0d1c2e] outline-none focus:border-[#005c55] focus:bg-white"
            />
          </div>

          {/* Submit Buttons */}
          <div className="pt-3 border-t border-[#bdc9c6]/30 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#3e4947] border border-[#bdc9c6] hover:bg-gray-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-[#0f766e] hover:bg-[#005c55] shadow-xs active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">check</span>
              <span>تسجيل اللجنة واعتمادها</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
