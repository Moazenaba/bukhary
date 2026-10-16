import React, { useState } from 'react';
import {
  Committee,
  StageKey,
  STAGES_LIST,
  QuestionScoringItem,
  ScoringStageDetails,
  AggregationStageDetails,
  CeremonyStageDetails,
  AppUser,
  Course,
} from '../types';
import {
  calculateCurrentStage,
  getCurrentFormattedDateTime,
  createDefaultQuestions,
  getScoringProgress,
} from '../utils/stageUtils';

interface CommitteeDetailModalProps {
  committee: Committee | null;
  onClose: () => void;
  onSaveCommittee: (updated: Committee) => void;
  currentUser?: AppUser;
  courses?: Course[];
  onReceiveCommittee?: (committeeId: string) => void;
  onApproveExamReadiness?: (committeeId: string) => void;
}

export const CommitteeDetailModal: React.FC<CommitteeDetailModalProps> = ({
  committee,
  onClose,
  onSaveCommittee,
  currentUser,
  courses = [],
  onReceiveCommittee,
  onApproveExamReadiness,
}) => {
  if (!committee) return null;

  // Local state for stages and notes
  const [stages, setStages] = useState(committee.stages);
  const [generalNotes, setGeneralNotes] = useState(committee.generalNotes || '');
  const [committeeName, setCommitteeName] = useState(committee.committeeName);
  const [branch, setBranch] = useState(committee.branch);
  const [associationName, setAssociationName] = useState(committee.associationName || '');
  const [competitionBook, setCompetitionBook] = useState(committee.competitionBook);
  const [courseId, setCourseId] = useState<string>(
    committee.courseId || courses.find((c) => c.status === 'active')?.id || 'course-summer-1447'
  );
  // البيانات الجديدة
  const [isWomenCommittee, setIsWomenCommittee] = useState<boolean>(committee.isWomenCommittee || false);
  const [sheikhName, setSheikhName] = useState<string>(committee.sheikhName || '');
  const [sheikhPhone, setSheikhPhone] = useState<string>(committee.sheikhPhone || '');
  const [sheikhCountry, setSheikhCountry] = useState<string>(committee.sheikhCountry || '');
  const [studentsCount, setStudentsCount] = useState<number | ''>(committee.studentsCount ?? '');
  const [isSavedToast, setIsSavedToast] = useState(false);

  // Scoring state
  const [scoringDetails, setScoringDetails] = useState<ScoringStageDetails>(() => {
    return (
      committee.scoringDetails || {
        scorerName: committee.members[0] || 'الشيخ المصحح',
        scoringReviewerName: committee.members[1] || 'الشيخ مراجع التصحيح',
        questions: createDefaultQuestions(5),
      }
    );
  });

  // Aggregation state
  const [aggregationDetails, setAggregationDetails] = useState<AggregationStageDetails>(() => {
    return (
      committee.aggregationDetails || {
        aggregatorName: committee.members[1] || committee.members[0] || 'مجمع الدرجات',
        scoringReviewerName: committee.scoringDetails?.scoringReviewerName || 'مراجع التصحيح',
        aggregationReviewerName: committee.members[2] || 'مراجع التجميع',
        reviewConfirmed: committee.stages.aggregation?.completed || false,
      }
    );
  });

  // State to expand/collapse special stage details
  const [isScoringExpanded, setIsScoringExpanded] = useState(true);
  const [isAggregationExpanded, setIsAggregationExpanded] = useState(true);
  const [isCeremonyExpanded, setIsCeremonyExpanded] = useState(true);
  const [newScorerInputs, setNewScorerInputs] = useState<Record<string, string>>({});
  const [newSheikhInput, setNewSheikhInput] = useState('');

  // Ceremony stage state
  const [ceremonyDetails, setCeremonyDetails] = useState<CeremonyStageDetails>(() => {
    return (
      committee.ceremonyDetails || {
        honoredStudentsCount: committee.studentsCount || 15,
        attendingSheikhs: committee.sheikhName ? [committee.sheikhName] : ['الشيخ المشرف'],
        ceremonyDate: committee.stages.ceremony?.completedAt?.split(' ')[0] || '2026-10-05',
        ceremonyTime: '4 العصر',
        ceremonyPlace: committee.associationName || 'القاعة الكبرى - مسجد الإمام البخاري',
        notes: '',
      }
    );
  });

  const handleAddSheikh = () => {
    const trimmed = newSheikhInput.trim();
    if (!trimmed) return;
    if (!ceremonyDetails.attendingSheikhs.includes(trimmed)) {
      const updated: CeremonyStageDetails = {
        ...ceremonyDetails,
        attendingSheikhs: [...ceremonyDetails.attendingSheikhs, trimmed],
      };
      setCeremonyDetails(updated);
      onSaveCommittee({
        ...committee,
        ceremonyDetails: updated,
      });
    }
    setNewSheikhInput('');
  };

  const handleRemoveSheikh = (index: number) => {
    const updated: CeremonyStageDetails = {
      ...ceremonyDetails,
      attendingSheikhs: ceremonyDetails.attendingSheikhs.filter((_, i) => i !== index),
    };
    setCeremonyDetails(updated);
    onSaveCommittee({
      ...committee,
      ceremonyDetails: updated,
    });
  };

  // Scorer management per question
  const handleAddScorerToQuestion = (qId: string, scorerName: string) => {
    const trimmed = scorerName.trim();
    if (!trimmed) return;

    const updatedQuestions = scoringDetails.questions.map((q) => {
      if (q.id === qId) {
        const currentScorers = q.scorers || [];
        if (!currentScorers.includes(trimmed)) {
          return {
            ...q,
            scorers: [...currentScorers, trimmed],
          };
        }
      }
      return q;
    });

    const updatedScoring: ScoringStageDetails = {
      ...scoringDetails,
      questions: updatedQuestions,
    };
    setScoringDetails(updatedScoring);

    // Clear input for this question
    setNewScorerInputs((prev) => ({ ...prev, [qId]: '' }));

    onSaveCommittee({
      ...committee,
      stages,
      scoringDetails: updatedScoring,
      aggregationDetails,
    });
  };

  const handleRemoveScorerFromQuestion = (qId: string, scorerToRemove: string) => {
    const updatedQuestions = scoringDetails.questions.map((q) => {
      if (q.id === qId) {
        return {
          ...q,
          scorers: (q.scorers || []).filter((s) => s !== scorerToRemove),
        };
      }
      return q;
    });

    const updatedScoring: ScoringStageDetails = {
      ...scoringDetails,
      questions: updatedQuestions,
    };
    setScoringDetails(updatedScoring);

    onSaveCommittee({
      ...committee,
      stages,
      scoringDetails: updatedScoring,
      aggregationDetails,
    });
  };

  // Toggle standard stage handler
  const handleToggleStage = (key: StageKey) => {
    const isCurrentlyDone = stages[key]?.completed;
    const nowStamp = getCurrentFormattedDateTime();

    const updatedStages = {
      ...stages,
      [key]: {
        completed: !isCurrentlyDone,
        completedAt: !isCurrentlyDone ? nowStamp : undefined,
      },
    };

    setStages(updatedStages);

    const selCourse = courses.find((c) => c.id === courseId);
    const updatedCommittee: Committee = {
      ...committee,
      committeeName,
      branch,
      associationName: associationName.trim() || undefined,
      competitionBook,
      generalNotes,
      courseId,
      courseName: selCourse?.name || committee.courseName || 'دورة الصيف 1447هـ',
      sheikhName: sheikhName.trim() || undefined,
      sheikhPhone: sheikhPhone.trim() || undefined,
      sheikhCountry: sheikhCountry.trim() || undefined,
      studentsCount: typeof studentsCount === 'number' && !isNaN(studentsCount) ? studentsCount : undefined,
      isWomenCommittee,
      stages: updatedStages,
      scoringDetails,
      aggregationDetails,
      ceremonyDetails,
    };
    onSaveCommittee(updatedCommittee);
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 2000);
  };

  // Toggle individual question in scoring
  const handleToggleQuestion = (qId: string) => {
    const nowStamp = getCurrentFormattedDateTime();
    const updatedQuestions = scoringDetails.questions.map((q) => {
      if (q.id === qId) {
        const nextState = !q.completed;
        return {
          ...q,
          completed: nextState,
          completedAt: nextState ? nowStamp : undefined,
        };
      }
      return q;
    });

    const allDone = updatedQuestions.every((q) => q.completed);
    const updatedScoring: ScoringStageDetails = {
      ...scoringDetails,
      questions: updatedQuestions,
    };
    setScoringDetails(updatedScoring);

    // If all questions done, automatically mark scoring stage completed
    const updatedStages = {
      ...stages,
      scoring: {
        completed: allDone,
        completedAt: allDone ? (stages.scoring?.completedAt || nowStamp) : undefined,
      },
    };
    setStages(updatedStages);

    const updatedCommittee: Committee = {
      ...committee,
      stages: updatedStages,
      scoringDetails: updatedScoring,
      aggregationDetails,
    };
    onSaveCommittee(updatedCommittee);
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 2000);
  };

  // Add new question to scoring list
  const handleAddQuestion = () => {
    const nextNum = scoringDetails.questions.length + 1;
    const arabicNumbers = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر'];
    const newQ: QuestionScoringItem = {
      id: `q-${Date.now()}`,
      questionNumber: nextNum,
      label: `السؤال ${arabicNumbers[nextNum - 1] || nextNum}`,
      completed: false,
    };

    const updatedQuestions = [...scoringDetails.questions, newQ];
    const updatedScoring = { ...scoringDetails, questions: updatedQuestions };
    setScoringDetails(updatedScoring);

    onSaveCommittee({
      ...committee,
      stages,
      scoringDetails: updatedScoring,
      aggregationDetails,
    });
  };

  // Delete question
  const handleDeleteQuestion = (qId: string) => {
    if (scoringDetails.questions.length <= 1) return;
    const updatedQuestions = scoringDetails.questions.filter((q) => q.id !== qId);
    const updatedScoring = { ...scoringDetails, questions: updatedQuestions };
    setScoringDetails(updatedScoring);

    onSaveCommittee({
      ...committee,
      stages,
      scoringDetails: updatedScoring,
      aggregationDetails,
    });
  };

  // Explicit save for notes and info
  const handleSave = () => {
    const selCourse = courses.find((c) => c.id === courseId);
    const updatedCommittee: Committee = {
      ...committee,
      committeeName,
      branch,
      associationName: associationName.trim() || undefined,
      competitionBook,
      generalNotes,
      courseId,
      courseName: selCourse?.name || committee.courseName || 'دورة الصيف 1447هـ',
      sheikhName: sheikhName.trim() || undefined,
      sheikhPhone: sheikhPhone.trim() || undefined,
      sheikhCountry: sheikhCountry.trim() || undefined,
      studentsCount: typeof studentsCount === 'number' && !isNaN(studentsCount) ? studentsCount : undefined,
      isWomenCommittee,
      stages,
      scoringDetails,
      aggregationDetails,
      ceremonyDetails,
    };
    onSaveCommittee(updatedCommittee);
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 2500);
  };

  const currentStatus = calculateCurrentStage(stages);
  const scoringProgress = getScoringProgress(scoringDetails);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-[#bdc9c6]/50 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in duration-150 text-right">
        {/* Header */}
        <div className="px-5 py-4 bg-[#f8f9ff] border-b border-[#bdc9c6]/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#005c55]/10 text-[#005c55] flex items-center justify-center font-bold text-base">
              #{committee.committeeNumber}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#0d1c2e]">
                  {committee.committeeName}
                </h2>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${currentStatus.badgeClass}`}
                >
                  {currentStatus.emoji} {currentStatus.label}
                </span>

                {isWomenCommittee && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-rose-50 text-rose-800 border border-rose-200">
                    🧕 لجنة نسائية
                  </span>
                )}

                {studentsCount !== '' && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-50 text-blue-800 border border-blue-200 font-mono">
                    👥 {studentsCount} {isWomenCommittee ? 'طالبة' : 'طالباً'}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#3e4947] mt-0.5">
                {committee.competitionBook} • {committee.branch}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl border border-[#bdc9c6]/40 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">close</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-6">
          {/* Quick Info Grid */}
          <div className="bg-[#f8f9ff] p-4 rounded-xl border border-[#bdc9c6]/40 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-[#6e7977] block font-semibold mb-0.5">مسار المسابقة / الكتاب:</span>
              <span className="font-bold text-[#005c55]">{committee.competitionBook}</span>
            </div>
            <div>
              <span className="text-[#6e7977] block font-semibold mb-0.5">الفرع:</span>
              <span className="font-bold text-[#0d1c2e]">{committee.branch}</span>
            </div>
            <div>
              <span className="text-[#6e7977] block font-semibold mb-0.5">الجمعية:</span>
              <span className="font-bold text-[#0d1c2e]">
                {committee.associationName || 'مسجد البخاري'}
              </span>
            </div>
            <div>
              <span className="text-[#6e7977] block font-semibold mb-0.5">الدورة التابعة لها:</span>
              {currentUser?.role === 'super_admin' && courses && courses.length > 0 ? (
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="w-full bg-white border border-[#bdc9c6] rounded-lg px-2 py-1 text-xs font-bold text-[#005c55] outline-none"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.status === 'active' ? '⚡' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-bold text-[#005c55]">
                  {committee.courseName || courses.find((c) => c.id === committee.courseId)?.name || 'دورة الصيف 1447هـ'}
                </span>
              )}
            </div>

            {/* عدد الطلاب باللجنة */}
            <div>
              <span className="text-[#6e7977] block font-semibold mb-0.5">عدد الطلاب باللجنة:</span>
              <span className="font-bold font-mono text-[#0d1c2e]">
                {studentsCount ? `${studentsCount} ${isWomenCommittee ? 'طالبة' : 'طالباً'}` : 'غير محدد'}
              </span>
            </div>

            {/* تصنيف اللجنة في حال كانت نسائية فقط */}
            {isWomenCommittee && (
              <div>
                <span className="text-[#6e7977] block font-semibold mb-0.5">التصنيف:</span>
                <span className="font-bold text-rose-700 inline-flex items-center gap-1">
                  <span>🧕</span>
                  <span>لجنة نسائية</span>
                </span>
              </div>
            )}

            {/* بيانات الشيخ المرسل إليه */}
            <div>
              <span className="text-[#6e7977] block font-semibold mb-0.5">الشيخ المرسل إليه:</span>
              <span className="font-bold text-[#005c55]">
                {sheikhName || 'لم يُحدد'}
              </span>
            </div>

            <div>
              <span className="text-[#6e7977] block font-semibold mb-0.5">رقم هاتف الشيخ:</span>
              {sheikhPhone ? (
                <a
                  href={`tel:${sheikhPhone}`}
                  className="font-bold font-mono text-[#005c55] hover:underline inline-flex items-center gap-1"
                  dir="ltr"
                >
                  <span>📞</span>
                  <span>{sheikhPhone}</span>
                </a>
              ) : (
                <span className="text-gray-400">غير مسجل</span>
              )}
            </div>

            <div>
              <span className="text-[#6e7977] block font-semibold mb-0.5">البلد التي منها الشيخ:</span>
              <span className="font-bold text-[#0d1c2e]">
                {sheikhCountry || 'غير محدد'}
              </span>
            </div>

            <div className="sm:col-span-3 pt-2 border-t border-[#bdc9c6]/20">
              <span className="text-[#6e7977] font-semibold">أعضاء اللجنة: </span>
              <span className="font-bold text-[#0d1c2e]">{committee.members.join(' — ')}</span>
            </div>
          </div>

          {/* Exam Readiness Info (if approved) */}
          {committee.examApprovedBy && (
            <div className="bg-blue-50/70 p-3.5 rounded-xl border border-blue-200 flex items-center justify-between text-xs">
              <span className="font-bold text-blue-900 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-blue-700" aria-hidden="true">verified</span>
                <span>جاهزية وتوزيع الامتحان معتمدة بواسطة: <strong>{committee.examApprovedBy.assistantName}</strong></span>
              </span>
              <span className="text-[11px] text-blue-700 font-mono">
                {committee.examApprovedBy.approvedAt}
              </span>
            </div>
          )}

          {/* Section: Stages Progression with Special Scoring & Aggregation Details */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[#0d1c2e] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#005c55]" aria-hidden="true">timeline</span>
                <span>مراحل عمل اللجنة (تبديل الحالة وتوثيق الوقت):</span>
              </h3>
              <span className="text-xs text-[#6e7977]">
                التأشير بـ "تم" يسجل الوقت والتاريخ تلقائياً
              </span>
            </div>

            <div className="space-y-3">
              {STAGES_LIST.map((stageItem) => {
                const stageData = stages[stageItem.key];
                const isCompleted = stageData?.completed;
                const isRegistration = stageItem.key === 'registration';
                const isScoring = stageItem.key === 'scoring';
                const isAggregation = stageItem.key === 'aggregation';

                // SPECIAL STAGE: SCORING (حالة التصحيح بخطوات الأسئلة)
                if (isScoring) {
                  return (
                    <div
                      key={stageItem.key}
                      className="rounded-2xl border-2 border-amber-300/80 bg-amber-50/30 overflow-hidden shadow-xs"
                    >
                      {/* Scoring Stage Header */}
                      <div className="p-4 bg-gradient-to-l from-amber-100/70 to-amber-50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl shrink-0">🟠</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-amber-950">
                                حالة التصحيح (تفصيل تصحيح الأسئلة)
                              </span>
                              <span
                                className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${
                                  isCompleted
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : scoringProgress.completed > 0
                                    ? 'bg-amber-200 text-amber-900 border-amber-300'
                                    : 'bg-gray-100 text-gray-700 border-gray-300'
                                }`}
                              >
                                {isCompleted
                                  ? 'تم التصحيح بالكامل'
                                  : `تم ${scoringProgress.completed} من ${scoringProgress.total} أسئلة (${scoringProgress.percentage}%)`}
                              </span>
                            </div>

                            {stageData?.completedAt && (
                              <div className="flex items-center gap-1 text-[11px] text-amber-800 mt-1">
                                <span className="material-symbols-outlined text-xs" aria-hidden="true">schedule</span>
                                <span>تاريخ إتمام التصحيح: {stageData.completedAt}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Toggle all */}
                          <button
                            type="button"
                            onClick={() => handleToggleStage('scoring')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              isCompleted
                                ? 'bg-emerald-700 text-white'
                                : 'bg-white text-amber-900 border border-amber-300 hover:bg-amber-100'
                            }`}
                          >
                            {isCompleted ? '✓ تم اعتماد التصحيح' : 'اعتماد يدوي'}
                          </button>

                          <button
                            type="button"
                            onClick={() => setIsScoringExpanded(!isScoringExpanded)}
                            className="p-1.5 text-amber-900 hover:bg-amber-200/50 rounded-lg cursor-pointer"
                            title="عرض / إخفاء تفاصيل الأسئلة والمصححين"
                          >
                            <span className="material-symbols-outlined text-lg" aria-hidden="true">
                              {isScoringExpanded ? 'expand_less' : 'expand_more'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Expandable Scoring Details */}
                      {isScoringExpanded && (
                        <div className="p-4 space-y-4 border-t border-amber-200/70 bg-white">
                          {/* 1. Scorer & Reviewer Inputs */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-amber-50/50 p-3 rounded-xl border border-amber-200/50">
                            <div>
                              <label className="block font-bold text-[#0d1c2e] mb-1">
                                ✍️ اسم المصحح:
                              </label>
                              <input
                                type="text"
                                placeholder="اكتب اسم المصحح المعتمد..."
                                value={scoringDetails.scorerName || ''}
                                onChange={(e) =>
                                  setScoringDetails({
                                    ...scoringDetails,
                                    scorerName: e.target.value,
                                  })
                                }
                                className="w-full bg-white border border-[#bdc9c6] rounded-xl px-3 py-1.5 text-xs outline-none focus:border-amber-600 font-semibold"
                              />
                            </div>

                            <div>
                              <label className="block font-bold text-[#0d1c2e] mb-1">
                                🔍 اسم مراجع التصحيح:
                              </label>
                              <input
                                type="text"
                                placeholder="اكتب اسم مراجع التصحيح والدرجات..."
                                value={scoringDetails.scoringReviewerName || ''}
                                onChange={(e) =>
                                  setScoringDetails({
                                    ...scoringDetails,
                                    scoringReviewerName: e.target.value,
                                  })
                                }
                                className="w-full bg-white border border-[#bdc9c6] rounded-xl px-3 py-1.5 text-xs outline-none focus:border-amber-600 font-semibold"
                              />
                            </div>
                          </div>

                          {/* 2. Questions Step-by-Step Checklist */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs text-[#0d1c2e] flex items-center gap-1">
                                <span className="material-symbols-outlined text-amber-600 text-sm" aria-hidden="true">
                                  checklist
                                </span>
                                <span>خطوات تصحيح الأسئلة (سؤال بسؤال):</span>
                              </span>
                              <button
                                type="button"
                                onClick={handleAddQuestion}
                                className="text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <span className="material-symbols-outlined text-xs" aria-hidden="true">add</span>
                                <span>إضافة سؤال</span>
                              </button>
                            </div>

                            {/* Question Progress bar */}
                            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-amber-500 h-full transition-all duration-300 rounded-full"
                                style={{ width: `${scoringProgress.percentage}%` }}
                              />
                            </div>

                            <div className="space-y-3 pt-1">
                              {scoringDetails.questions.map((q) => {
                                const questionScorers = q.scorers || [];
                                const currentInput = newScorerInputs[q.id] || '';

                                return (
                                  <div
                                    key={q.id}
                                    className={`p-3.5 rounded-xl border transition-all ${
                                      q.completed
                                        ? 'bg-emerald-50/60 border-emerald-300 shadow-2xs'
                                        : 'bg-[#f8f9ff] border-[#bdc9c6]/60 hover:bg-amber-50/40'
                                    }`}
                                  >
                                    {/* Top Row: Checkbox, Label, Timestamp, Delete */}
                                    <div className="flex items-center justify-between pb-2 border-b border-[#bdc9c6]/30">
                                      <div
                                        onClick={() => handleToggleQuestion(q.id)}
                                        className="flex items-center gap-2.5 cursor-pointer select-none"
                                      >
                                        <span
                                          className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold transition-all ${
                                            q.completed
                                              ? 'bg-emerald-600 text-white shadow-2xs'
                                              : 'border border-gray-400 bg-white'
                                          }`}
                                        >
                                          {q.completed ? '✓' : ''}
                                        </span>
                                        <span
                                          className={`text-xs ${
                                            q.completed
                                              ? 'text-emerald-950 font-bold'
                                              : 'text-[#0d1c2e] font-semibold'
                                          }`}
                                        >
                                          {q.completed ? `تم تصحيح ${q.label}` : `تصحيح ${q.label}`}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        {q.completed && q.completedAt ? (
                                          <span className="text-[11px] text-emerald-800 font-semibold bg-emerald-100/70 px-2 py-0.5 rounded-md flex items-center gap-1">
                                            <span className="material-symbols-outlined text-xs" aria-hidden="true">
                                              schedule
                                            </span>
                                            <span>{q.completedAt.split(' - ')[1] || q.completedAt}</span>
                                          </span>
                                        ) : (
                                          <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md font-medium">
                                            قيد التصحيح
                                          </span>
                                        )}

                                        {scoringDetails.questions.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteQuestion(q.id)}
                                            className="text-gray-400 hover:text-red-500 p-1 rounded-md"
                                            title="حذف هذا السؤال"
                                          >
                                            <span className="material-symbols-outlined text-sm" aria-hidden="true">
                                              close
                                            </span>
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {/* Scorers Section for this Question (مصححو هذا السؤال - يدعم أكثر من مصحح) */}
                                    <div className="mt-2.5 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold text-[#0d1c2e] flex items-center gap-1">
                                          <span className="material-symbols-outlined text-xs text-amber-700" aria-hidden="true">
                                            edit_note
                                          </span>
                                          <span>مصحح (أو مصححو) هذا السؤال:</span>
                                        </span>
                                        <span className="text-[10px] text-[#6e7977]">
                                          (يمكن إضافة أكثر من مصحح شاركوا في تصحيح السؤال)
                                        </span>
                                      </div>

                                      {/* Assigned Scorers Badges */}
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {questionScorers.length > 0 ? (
                                          questionScorers.map((scorerName, sIdx) => (
                                            <span
                                              key={sIdx}
                                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300/80 text-xs font-bold shadow-2xs"
                                            >
                                              <span className="material-symbols-outlined text-xs text-amber-800" aria-hidden="true">
                                                person
                                              </span>
                                              <span>{scorerName}</span>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleRemoveScorerFromQuestion(q.id, scorerName)
                                                }
                                                className="text-amber-700 hover:text-red-600 rounded-full p-0.5 cursor-pointer leading-none"
                                                title="إزالة هذا المصحح"
                                              >
                                                ✕
                                              </button>
                                            </span>
                                          ))
                                        ) : (
                                          <span className="text-[11px] text-gray-400 italic">
                                            لم يُحدد مصحح لهذا السؤال بعد (اضغط لإضافة مصحح)
                                          </span>
                                        )}
                                      </div>

                                      {/* Quick Add from Committee Members + Custom Input */}
                                      <div className="pt-1.5 flex flex-wrap items-center gap-2 text-xs">
                                        {/* Quick Member Suggestions */}
                                        {committee.members.map((member, mIdx) => {
                                          const isAssigned = questionScorers.includes(member);
                                          if (isAssigned) return null;
                                          return (
                                            <button
                                              key={mIdx}
                                              type="button"
                                              onClick={() =>
                                                handleAddScorerToQuestion(q.id, member)
                                              }
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-[#bdc9c6] text-[#3e4947] hover:bg-amber-50 hover:text-amber-900 text-[11px] font-semibold transition-colors cursor-pointer"
                                              title={`تعيين ${member} كمصحح لهذا السؤال`}
                                            >
                                              <span className="text-amber-600 text-xs">+</span>
                                              <span>{member}</span>
                                            </button>
                                          );
                                        })}

                                        {/* Custom Scorer Name Input */}
                                        <div className="inline-flex items-center gap-1 mt-1 sm:mt-0">
                                          <input
                                            type="text"
                                            placeholder="أو اكتب اسم مصحح آخر..."
                                            value={currentInput}
                                            onChange={(e) =>
                                              setNewScorerInputs((prev) => ({
                                                ...prev,
                                                [q.id]: e.target.value,
                                              }))
                                            }
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleAddScorerToQuestion(q.id, currentInput);
                                              }
                                            }}
                                            className="bg-white border border-[#bdc9c6] rounded-lg px-2.5 py-1 text-xs outline-none focus:border-amber-600 w-36 sm:w-44 text-[#0d1c2e]"
                                          />
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleAddScorerToQuestion(q.id, currentInput)
                                            }
                                            disabled={!currentInput.trim()}
                                            className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-xs font-bold cursor-pointer transition-all shrink-0"
                                          >
                                            إضافة
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                // SPECIAL STAGE: AGGREGATION (تجميع الدرجات ومراجع التجميع)
                if (isAggregation) {
                  return (
                    <div
                      key={stageItem.key}
                      className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/20 overflow-hidden shadow-xs"
                    >
                      <div className="p-4 bg-gradient-to-l from-indigo-100/60 to-indigo-50/30 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl shrink-0">🔵</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-indigo-950">
                                تجميع الدرجات وتدقيق المجموع
                              </span>
                              <span
                                className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${
                                  isCompleted
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-gray-100 text-gray-700 border-gray-300'
                                }`}
                              >
                                {isCompleted ? 'تم التجميع والتدقيق' : 'قيد التجميع'}
                              </span>
                            </div>

                            {stageData?.completedAt && (
                              <div className="flex items-center gap-1 text-[11px] text-indigo-800 mt-1">
                                <span className="material-symbols-outlined text-xs" aria-hidden="true">schedule</span>
                                <span>تاريخ إتمام التجميع: {stageData.completedAt}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!isCompleted}
                              onChange={() => handleToggleStage('aggregation')}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-700"></div>
                          </label>

                          <button
                            type="button"
                            onClick={() => setIsAggregationExpanded(!isAggregationExpanded)}
                            className="p-1.5 text-indigo-900 hover:bg-indigo-200/50 rounded-lg cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-lg" aria-hidden="true">
                              {isAggregationExpanded ? 'expand_less' : 'expand_more'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Expandable Aggregation Details */}
                      {isAggregationExpanded && (
                        <div className="p-4 space-y-3 border-t border-indigo-200/70 bg-white">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-indigo-50/40 p-3 rounded-xl border border-indigo-200/40">
                            <div>
                              <label className="block font-bold text-[#0d1c2e] mb-1">
                                📊 مراجع ومجمع الدرجات في التجميع:
                              </label>
                              <input
                                type="text"
                                placeholder="اسم المكلف بالتجميع..."
                                value={aggregationDetails.aggregatorName || ''}
                                onChange={(e) =>
                                  setAggregationDetails({
                                    ...aggregationDetails,
                                    aggregatorName: e.target.value,
                                  })
                                }
                                className="w-full bg-white border border-[#bdc9c6] rounded-xl px-3 py-1.5 text-xs outline-none focus:border-indigo-600 font-semibold"
                              />
                            </div>

                            <div>
                              <label className="block font-bold text-[#0d1c2e] mb-1">
                                🔍 مراجع الدرجات ومطابقتها في التصحيح:
                              </label>
                              <input
                                type="text"
                                placeholder="اسم مراجع الدرجات في التصحيح..."
                                value={aggregationDetails.scoringReviewerName || ''}
                                onChange={(e) =>
                                  setAggregationDetails({
                                    ...aggregationDetails,
                                    scoringReviewerName: e.target.value,
                                  })
                                }
                                className="w-full bg-white border border-[#bdc9c6] rounded-xl px-3 py-1.5 text-xs outline-none focus:border-indigo-600 font-semibold"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                // 3. SPECIAL STAGE: CEREMONY (مرحلة الحفل والتكريم وتوزيع الجوائز)
                if (stageItem.key === 'ceremony') {
                  return (
                    <div
                      key={stageItem.key}
                      className={`rounded-2xl border transition-all overflow-hidden ${
                        isCompleted
                          ? 'bg-emerald-50/40 border-emerald-300 shadow-xs'
                          : 'bg-amber-50/30 border-amber-300 shadow-xs'
                      }`}
                    >
                      {/* Top Banner Row */}
                      <div className="p-4 flex items-center justify-between gap-3 bg-gradient-to-l from-amber-50/70 via-white to-amber-50/30">
                        <div className="flex items-center gap-3">
                          <span className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold text-xl shrink-0 shadow-2xs">
                            🎉
                          </span>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-sm text-[#0d1c2e]">
                                مرحلة الحفل والتكريم وتوزيع الجوائز
                              </span>
                              <span
                                className={`text-[11px] px-2.5 py-0.5 rounded-full font-black ${
                                  isCompleted
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                                }`}
                              >
                                {isCompleted ? '✓ تم الحفل والتكريم' : '⏳ قيد الترتيب والجدولة'}
                              </span>
                            </div>

                            {isCompleted && stageData?.completedAt && (
                              <div className="flex items-center gap-1 text-[11px] text-emerald-800 mt-1 font-mono">
                                <span className="material-symbols-outlined text-xs" aria-hidden="true">schedule</span>
                                <span>تاريخ التمام: {stageData.completedAt}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleStage('ceremony')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              isCompleted
                                ? 'bg-emerald-700 text-white shadow-2xs'
                                : 'bg-[#005c55] text-white hover:bg-[#004742] shadow-2xs'
                            }`}
                          >
                            {isCompleted ? '✓ تم اعتماد الحفل' : 'إتمام الحفل الآن'}
                          </button>

                          <button
                            type="button"
                            onClick={() => setIsCeremonyExpanded(!isCeremonyExpanded)}
                            className="p-1.5 text-amber-900 hover:bg-amber-200/50 rounded-lg cursor-pointer"
                            title="عرض / إخفاء تفاصيل الحفل"
                          >
                            <span className="material-symbols-outlined text-lg" aria-hidden="true">
                              {isCeremonyExpanded ? 'expand_less' : 'expand_more'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Expandable Ceremony Details Form */}
                      {isCeremonyExpanded && (
                        <div className="p-4 space-y-4 border-t border-amber-200/70 bg-white">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            {/* 1. عدد الطلاب الذين سيتم تكريمهم */}
                            <div className="bg-amber-50/40 p-3 rounded-xl border border-amber-200/50 space-y-1">
                              <label className="block font-bold text-[#0d1c2e]">
                                🏆 عدد الطلاب الذين سيتم تكريمهم:
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={ceremonyDetails.honoredStudentsCount ?? ''}
                                onChange={(e) => {
                                  const updated = {
                                    ...ceremonyDetails,
                                    honoredStudentsCount:
                                      e.target.value === '' ? undefined : Number(e.target.value),
                                  };
                                  setCeremonyDetails(updated);
                                  onSaveCommittee({
                                    ...committee,
                                    ceremonyDetails: updated,
                                  });
                                }}
                                placeholder="اكتب عدد الطلاب المكرمين..."
                                className="w-full bg-white border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none focus:border-amber-600"
                              />
                              <span className="text-[10px] text-slate-500 block leading-tight">
                                * يحدد يدوياً لتوثيق الناجحين فقط (إجمالي طلاب اللجنة: {studentsCount || 0} طالب)
                              </span>
                            </div>

                            {/* 2. موعد الحفل بالتاريخ والوقت */}
                            <div className="bg-amber-50/40 p-3 rounded-xl border border-amber-200/50 space-y-2">
                              <div>
                                <label className="block font-bold text-[#0d1c2e] mb-1">
                                  📅 موعد الحفل بالتاريخ:
                                </label>
                                <input
                                  type="date"
                                  value={ceremonyDetails.ceremonyDate || '2026-10-05'}
                                  onChange={(e) => {
                                    const updated = {
                                      ...ceremonyDetails,
                                      ceremonyDate: e.target.value,
                                    };
                                    setCeremonyDetails(updated);
                                    onSaveCommittee({
                                      ...committee,
                                      ceremonyDetails: updated,
                                    });
                                  }}
                                  className="w-full bg-white border border-[#bdc9c6] rounded-xl px-3 py-1.5 text-xs font-mono font-bold outline-none focus:border-amber-600"
                                />
                              </div>

                              <div>
                                <label className="block font-bold text-[#0d1c2e] mb-1">
                                  ⏰ موعد الحفل بالوقت (اكتبه بيدك):
                                </label>
                                <input
                                  type="text"
                                  placeholder="مثال: 4 العصر، 4 المغرب، 08:00 م بعد العشاء..."
                                  value={ceremonyDetails.ceremonyTime || ''}
                                  onChange={(e) => {
                                    const updated = {
                                      ...ceremonyDetails,
                                      ceremonyTime: e.target.value,
                                    };
                                    setCeremonyDetails(updated);
                                    onSaveCommittee({
                                      ...committee,
                                      ceremonyDetails: updated,
                                    });
                                  }}
                                  className="w-full bg-white border border-[#bdc9c6] rounded-xl px-3 py-1.5 text-xs font-semibold outline-none focus:border-amber-600"
                                />
                              </div>
                            </div>
                          </div>

                          {/* 3. أسماء المشايخ الذين سيحضرون الحفل (إضافة أكثر من شيخ) */}
                          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <label className="font-bold text-xs text-[#0d1c2e] flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-sm text-[#005c55]" aria-hidden="true">
                                  person_add
                                </span>
                                <span>أسماء المشايخ والضيوف الحاضرين للحفل:</span>
                              </label>
                              <span className="text-[11px] font-bold text-slate-500 font-mono">
                                ({ceremonyDetails.attendingSheikhs.length}) مشايخ مضافين
                              </span>
                            </div>

                            {/* Added Sheikhs chips */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {ceremonyDetails.attendingSheikhs.map((sheikh, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 shadow-2xs"
                                >
                                  <span>{sheikh}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSheikh(idx)}
                                    className="w-4 h-4 rounded-full hover:bg-rose-100 hover:text-rose-700 flex items-center justify-center cursor-pointer text-slate-400"
                                    title="حذف الشيخ"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>

                            {/* Input + Button to add another sheikh */}
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={newSheikhInput}
                                onChange={(e) => setNewSheikhInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddSheikh();
                                  }
                                }}
                                placeholder="اكتب اسم الشيخ واضغط إضافة عضو آخر..."
                                className="flex-1 bg-white border border-[#bdc9c6] rounded-xl px-3 py-1.5 text-xs outline-none focus:border-[#005c55] font-semibold"
                              />
                              <button
                                type="button"
                                onClick={handleAddSheikh}
                                className="px-3 py-1.5 rounded-xl bg-[#005c55] hover:bg-[#004742] text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                              >
                                <span className="material-symbols-outlined text-sm" aria-hidden="true">add</span>
                                <span>+ إضافة عضو آخر</span>
                              </button>
                            </div>
                          </div>

                          {/* 4. مكان الحفل وملاحظات */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div>
                              <label className="block font-bold text-[#0d1c2e] mb-1">
                                📍 مكان إقامة الحفل:
                              </label>
                              <input
                                type="text"
                                placeholder="مثال: القاعة الكبرى - مسجد الإمام البخاري..."
                                value={ceremonyDetails.ceremonyPlace || ''}
                                onChange={(e) => {
                                  const updated = {
                                    ...ceremonyDetails,
                                    ceremonyPlace: e.target.value,
                                  };
                                  setCeremonyDetails(updated);
                                  onSaveCommittee({
                                    ...committee,
                                    ceremonyDetails: updated,
                                  });
                                }}
                                className="w-full bg-white border border-[#bdc9c6] rounded-xl px-3 py-1.5 text-xs font-semibold outline-none focus:border-amber-600"
                              />
                            </div>

                            <div>
                              <label className="block font-bold text-[#0d1c2e] mb-1">
                                📝 ملاحظات وترتيبات وتجهيزات:
                              </label>
                              <input
                                type="text"
                                placeholder="مثال: تجهيز أجهزة الصوت والدروع وشهادات التقدير..."
                                value={ceremonyDetails.notes || ''}
                                onChange={(e) => {
                                  const updated = {
                                    ...ceremonyDetails,
                                    notes: e.target.value,
                                  };
                                  setCeremonyDetails(updated);
                                  onSaveCommittee({
                                    ...committee,
                                    ceremonyDetails: updated,
                                  });
                                }}
                                className="w-full bg-white border border-[#bdc9c6] rounded-xl px-3 py-1.5 text-xs font-semibold outline-none focus:border-amber-600"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                // STANDARD STAGES (التسجيل، الامتحان، كتابة الكشف، المراجعة، الإعلان)
                return (
                  <div
                    key={stageItem.key}
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                      isCompleted
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : 'bg-white border-[#bdc9c6]/40 hover:bg-[#f8f9ff]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl shrink-0">{stageItem.emoji}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-bold text-xs ${
                              isCompleted ? 'text-emerald-900' : 'text-[#0d1c2e]'
                            }`}
                          >
                            {stageItem.label}
                          </span>
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                              isCompleted
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {isCompleted ? 'تمت' : 'لم يتم'}
                          </span>
                        </div>

                        {/* Helper descriptions for review, sheet, and accreditation */}
                        {stageItem.key === 'review' && (
                          <span className="text-[10px] text-[#6e7977] block mt-0.5">
                            مراجعة وتدقيق الدرجات (قبل كتابة الكشف)
                          </span>
                        )}
                        {stageItem.key === 'sheet' && (
                          <span className="text-[10px] text-[#6e7977] block mt-0.5">
                            كتابة كشف الدرجات الرسمي والمسودة
                          </span>
                        )}
                        {stageItem.key === 'accreditation' && (
                          <span className="text-[10px] text-emerald-700 font-semibold block mt-0.5">
                            الاعتمادية الرسمية وتوقيع النتيجة بعد كتابة الكشف
                          </span>
                        )}

                        {/* Exact timestamp if completed */}
                        {isCompleted && stageData?.completedAt && (
                          <div className="flex items-center gap-1 text-[11px] text-emerald-700 mt-0.5">
                            <span className="material-symbols-outlined text-xs" aria-hidden="true">schedule</span>
                            <span>تاريخ الإتمام: {stageData.completedAt}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <div className="flex items-center gap-2">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!isCompleted}
                          disabled={isRegistration}
                          onChange={() => handleToggleStage(stageItem.key)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#005c55]"></div>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section: Sheikh, Students & Committee Type Edit */}
          {currentUser?.role === 'super_admin' && (
            <div className="bg-[#f8f9ff] p-4 rounded-xl border border-[#bdc9c6]/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#005c55] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base" aria-hidden="true">person_pin</span>
                  <span>تعديل بيانات الشيخ المرسل إليه، عدد الطلاب، ونوع اللجنة:</span>
                </span>
                <span className="text-[11px] text-[#6e7977]">
                  (اضغط حفظ بالأسفل لاعتماد التعديلات)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-[#0d1c2e] mb-1">
                    عدد الطلاب في اللجنة
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={studentsCount}
                    onChange={(e) =>
                      setStudentsCount(e.target.value === '' ? '' : parseInt(e.target.value) || 0)
                    }
                    className="w-full bg-white border border-[#bdc9c6] rounded-lg px-2.5 py-1.5 text-xs font-bold font-mono outline-none focus:border-[#005c55]"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 p-1.5 rounded-lg border border-[#bdc9c6] bg-white hover:bg-gray-50 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isWomenCommittee}
                      onChange={(e) => setIsWomenCommittee(e.target.checked)}
                      className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 accent-rose-700 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-[#0d1c2e] flex items-center gap-1">
                      <span>🧕</span>
                      <span>لجنة نسائية (اختياري)</span>
                    </span>
                  </label>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#0d1c2e] mb-1">
                    اسم الشيخ المرسل إليه
                  </label>
                  <input
                    type="text"
                    value={sheikhName}
                    onChange={(e) => setSheikhName(e.target.value)}
                    placeholder=""
                    className="w-full bg-white border border-[#bdc9c6] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[#005c55]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#0d1c2e] mb-1">
                    رقم هاتف الشيخ
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={sheikhPhone}
                    onChange={(e) => setSheikhPhone(e.target.value)}
                    placeholder=""
                    className="w-full bg-white border border-[#bdc9c6] rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-[#005c55] text-right"
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-4">
                  <label className="block text-[11px] font-bold text-[#0d1c2e] mb-1">
                    البلد التي منها الشيخ
                  </label>
                  <input
                    type="text"
                    value={sheikhCountry}
                    onChange={(e) => setSheikhCountry(e.target.value)}
                    placeholder=""
                    className="w-full bg-white border border-[#bdc9c6] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[#005c55]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section: General Notes for the Committee */}
          <div className="bg-[#f8f9ff] p-4 rounded-xl border border-[#bdc9c6]/40 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-[#0d1c2e]">
                الملاحظات العامة على اللجنة
              </label>
              <span className="text-[11px] text-[#6e7977]">
                (خانة نصية حرة خاصة بكل لجنة يتم حفظها ومزامنتها فورياً)
              </span>
            </div>
            <textarea
              rows={3}
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              placeholder=""
              className="w-full bg-white border border-[#bdc9c6] rounded-xl p-3 text-xs text-[#0d1c2e] outline-none focus:border-[#005c55] leading-relaxed"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-[#f8f9ff] border-t border-[#bdc9c6]/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {isSavedToast && (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full flex items-center gap-1 animate-in fade-in">
                <span className="material-symbols-outlined text-sm" aria-hidden="true">check</span>
                تم حفظ وتحديث بيانات اللجنة فورياً
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#3e4947] border border-[#bdc9c6] hover:bg-white cursor-pointer"
            >
              إغلاق
            </button>

            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-[#005c55] hover:bg-[#1b6b51] shadow-xs active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">save</span>
              <span>حفظ الملاحظات والتعديلات</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
