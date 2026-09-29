import React, { useState } from 'react';
import { Committee, StageKey, STAGES_LIST, QuestionScoringItem, ScoringStageDetails, AggregationStageDetails, AppUser, Course } from '../types';
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
  const [newScorerInputs, setNewScorerInputs] = useState<Record<string, string>>({});

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
      stages: updatedStages,
      scoringDetails,
      aggregationDetails,
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
      stages,
      scoringDetails,
      aggregationDetails,
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
            <span className="material-symbols-outlined text-xl">close</span>
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
            <div className="sm:col-span-3 pt-2 border-t border-[#bdc9c6]/20">
              <span className="text-[#6e7977] font-semibold">أعضاء اللجنة: </span>
              <span className="font-bold text-[#0d1c2e]">{committee.members.join(' — ')}</span>
            </div>
          </div>

          {/* Assistant Duties Card (استلام المعاون للجنة واعتماد جاهزية الامتحان) */}
          <div className="bg-gradient-to-l from-emerald-50/60 to-teal-50/40 p-4 rounded-xl border border-teal-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-[#005c55] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base">badge</span>
                <span>مهام المعاون الميداني (استلام اللجنة وجاهزية الامتحان):</span>
              </span>
              <span className="text-[11px] text-[#6e7977]">
                صلاحيات من المشرف العام
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* 1. Committee Receipt */}
              <div className="bg-white p-3 rounded-xl border border-[#bdc9c6]/50 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[#6e7977] block font-semibold">استلام اللجنة:</span>
                  {committee.receivedByAssistant ? (
                    <div>
                      <span className="font-bold text-emerald-800 text-xs block">
                        ✓ تم الاستلام: {committee.receivedByAssistant.assistantName}
                      </span>
                      <span className="text-[10px] text-emerald-700">
                        {committee.receivedByAssistant.receivedAt}
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-400 font-medium">لم يتم الاستلام الميداني بعد</span>
                  )}
                </div>

                {!committee.receivedByAssistant && onReceiveCommittee && (
                  <button
                    type="button"
                    onClick={() => onReceiveCommittee(committee.id)}
                    className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs cursor-pointer shadow-2xs"
                  >
                    تسجيل الاستلام
                  </button>
                )}
              </div>

              {/* 2. Exam Readiness Approval */}
              <div className="bg-white p-3 rounded-xl border border-[#bdc9c6]/50 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[#6e7977] block font-semibold">اعتماد جاهزية الامتحان:</span>
                  {committee.examApprovedBy ? (
                    <div>
                      <span className="font-bold text-blue-800 text-xs block">
                        ✓ معتمد بواسطة: {committee.examApprovedBy.assistantName}
                      </span>
                      <span className="text-[10px] text-blue-700">
                        {committee.examApprovedBy.approvedAt}
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-400 font-medium">بانتظار فحص وتوزيع أوراق الامتحان</span>
                  )}
                </div>

                {!committee.examApprovedBy && onApproveExamReadiness && (
                  <button
                    type="button"
                    onClick={() => onApproveExamReadiness(committee.id)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shadow-2xs"
                  >
                    اعتماد الامتحان
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Section: Stages Progression with Special Scoring & Aggregation Details */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[#0d1c2e] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#005c55]">timeline</span>
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
                                <span className="material-symbols-outlined text-xs">schedule</span>
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
                            <span className="material-symbols-outlined text-lg">
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
                                <span className="material-symbols-outlined text-amber-600 text-sm">
                                  checklist
                                </span>
                                <span>خطوات تصحيح الأسئلة (سؤال بسؤال):</span>
                              </span>
                              <button
                                type="button"
                                onClick={handleAddQuestion}
                                className="text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <span className="material-symbols-outlined text-xs">add</span>
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
                                            <span className="material-symbols-outlined text-xs">
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
                                            <span className="material-symbols-outlined text-sm">
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
                                          <span className="material-symbols-outlined text-xs text-amber-700">
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
                                              <span className="material-symbols-outlined text-xs text-amber-800">
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
                                <span className="material-symbols-outlined text-xs">schedule</span>
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
                            <span className="material-symbols-outlined text-lg">
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

                // STANDARD STAGES (التسجيل، الامتحان، كتابة الكشف، المراجعة، الإعلان، الحفل)
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
                            <span className="material-symbols-outlined text-xs">schedule</span>
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
              placeholder="اكتب أي ملاحظات أو تنبيهات أو قرارات خاصة بهذه اللجنة..."
              className="w-full bg-white border border-[#bdc9c6] rounded-xl p-3 text-xs text-[#0d1c2e] outline-none focus:border-[#005c55] leading-relaxed"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-[#f8f9ff] border-t border-[#bdc9c6]/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {isSavedToast && (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full flex items-center gap-1 animate-in fade-in">
                <span className="material-symbols-outlined text-sm">check</span>
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
              <span className="material-symbols-outlined text-sm">save</span>
              <span>حفظ الملاحظات والتعديلات</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
