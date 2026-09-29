import React, { useState } from 'react';
import { Committee, StageKey, STAGES_LIST, AppUser } from '../types';
import { calculateCurrentStage, getCurrentFormattedDateTime } from '../utils/stageUtils';

interface CommitteeCardProps {
  committee: Committee;
  onViewDetails: (committee: Committee) => void;
  onQuickToggleStage: (committeeId: string, stageKey: StageKey) => void;
  onDeleteCommittee?: (committeeId: string) => void;
  currentUser?: AppUser;
  onReceiveCommittee?: (committeeId: string) => void;
  onApproveExamReadiness?: (committeeId: string) => void;
}

export const CommitteeCard: React.FC<CommitteeCardProps> = ({
  committee,
  onViewDetails,
  onQuickToggleStage,
  onDeleteCommittee,
  currentUser,
  onReceiveCommittee,
  onApproveExamReadiness,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const currentStatus = calculateCurrentStage(committee.stages);

  // Assistant permissions check
  const canReceive =
    currentUser?.role === 'super_admin' ||
    (currentUser?.role === 'assistant' && currentUser.permissions.includes('receive_committee'));

  const canApproveExam =
    currentUser?.role === 'super_admin' ||
    (currentUser?.role === 'assistant' && currentUser.permissions.includes('approve_exam'));

  // Count how many stages are completed
  const completedStagesCount = Object.values(committee.stages).filter((s) => s.completed).length;
  const totalStagesCount = STAGES_LIST.length;

  return (
    <article className="bg-white border border-[#bdc9c6]/60 hover:border-[#005c55]/50 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between group relative text-right">
      <div>
        {/* Header: Number, Committee Name & Status Badge */}
        <div className="flex items-start justify-between gap-2 mb-3 pb-3 border-b border-[#bdc9c6]/30">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-[#005c55]/10 text-[#005c55] flex items-center justify-center font-bold text-sm shrink-0">
              #{committee.committeeNumber}
            </span>
            <div>
              <span className="text-[16px] font-bold text-[#0d1c2e] block leading-tight">
                {committee.committeeName}
              </span>
              <div className="flex items-center gap-1.5 text-[11px] text-[#6e7977]">
                <span>لجنة رقم #{committee.committeeNumber}</span>
                {committee.courseName && (
                  <>
                    <span>•</span>
                    <span className="font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      {committee.courseName}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Current Status Badge */}
          <span
            className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-semibold border ${currentStatus.badgeClass}`}
          >
            <span>{currentStatus.emoji}</span>
            <span>{currentStatus.label}</span>
          </span>
        </div>

        {/* Book & Track Badge */}
        <div className="mb-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-[#eff4ff] text-[#005c55] border border-[#9cf2e8]/60 max-w-full truncate">
            <span className="material-symbols-outlined text-sm">menu_book</span>
            <span className="truncate">{committee.competitionBook}</span>
          </span>
        </div>

        {/* Members & Details Box */}
        <div className="space-y-2 bg-[#f8f9ff] p-3 rounded-xl border border-[#bdc9c6]/30 mb-4 text-[12px]">
          {/* Members */}
          <div className="flex items-start justify-between gap-2">
            <span className="text-[#3e4947] font-semibold flex items-center gap-1 shrink-0">
              <span className="material-symbols-outlined text-sm text-[#6e7977]">group</span>
              أعضاء اللجنة:
            </span>
            <span className="font-medium text-[#0d1c2e] text-left">
              {committee.members.join(' • ')}
            </span>
          </div>

          {/* Branch */}
          <div className="flex items-center justify-between">
            <span className="text-[#3e4947] font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-[#6e7977]">alt_route</span>
              الفرع:
            </span>
            <span className="font-medium text-[#0d1c2e]">{committee.branch}</span>
          </div>

          {/* Association if exists */}
          {committee.associationName && (
            <div className="flex items-center justify-between">
              <span className="text-[#3e4947] font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-[#6e7977]">apartment</span>
                الجمعية:
              </span>
              <span className="font-medium text-[#005c55]">{committee.associationName}</span>
            </div>
          )}

          {/* General Notes if exists */}
          {committee.generalNotes && (
            <div className="pt-1.5 border-t border-[#bdc9c6]/20 text-[11px] text-[#3e4947] italic line-clamp-2">
              <span className="font-bold text-[#0d1c2e] not-italic">ملاحظة: </span>
              {committee.generalNotes}
            </div>
          )}
        </div>

        {/* Mini Stages Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between items-center text-[11px] text-[#6e7977] mb-1">
            <span>تقدم مراحل اللجنة:</span>
            <span className="font-mono font-bold text-[#005c55]">
              {completedStagesCount} من {totalStagesCount} مراحل
            </span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden flex gap-0.5">
            {STAGES_LIST.map((stg) => {
              const isDone = committee.stages[stg.key]?.completed;
              return (
                <div
                  key={stg.key}
                  title={`${stg.label}: ${isDone ? 'مكتمل' : 'لم يتم'}`}
                  className={`flex-1 h-full transition-colors ${
                    isDone ? 'bg-[#005c55]' : 'bg-gray-200'
                  }`}
                />
              );
            })}
          </div>

          {/* Detailed Question Scoring Status & List of Uncorrected Questions */}
          {committee.scoringDetails && committee.scoringDetails.questions && (
            <div className="mt-2.5 bg-amber-50/70 p-2.5 rounded-xl border border-amber-300/80 space-y-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-amber-950 font-bold flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm text-amber-700">edit_note</span>
                  <span>
                    تم تصحيح {committee.scoringDetails.questions.filter((q) => q.completed).length} من{' '}
                    {committee.scoringDetails.questions.length} أسئلة
                  </span>
                </span>
                <span className="font-mono text-amber-900 font-bold px-1.5 py-0.5 rounded bg-white border border-amber-200">
                  {Math.round(
                    (committee.scoringDetails.questions.filter((q) => q.completed).length /
                      committee.scoringDetails.questions.length) *
                      100
                  )}%
                </span>
              </div>

              {/* Show which questions are NOT yet corrected */}
              {committee.scoringDetails.questions.some((q) => !q.completed) ? (
                <div className="pt-1.5 border-t border-amber-200/70">
                  <span className="text-[10px] text-amber-900 font-bold block mb-1">
                    ⚠️ أسئلة لم تُصحح بعد (اضغط لبدء تصحيحها):
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {committee.scoringDetails.questions
                      .filter((q) => !q.completed)
                      .map((uq) => (
                        <button
                          key={uq.id}
                          type="button"
                          onClick={() => onViewDetails(committee)}
                          className="px-2 py-0.5 rounded-md bg-white hover:bg-amber-100 text-amber-900 font-bold border border-amber-300 text-[10px] cursor-pointer shadow-2xs transition-colors flex items-center gap-1"
                          title="اضغط للدخول وتصحيح هذا السؤال"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          <span>{uq.label} (غير مصحح)</span>
                        </button>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="pt-1 border-t border-emerald-200 text-emerald-800 font-bold text-[10px] flex items-center gap-1">
                  <span>✓</span>
                  <span>تم تصحيح كافة الأسئلة بنجاح</span>
                </div>
              )}
            </div>
          )}

          {/* Assistant Actions & Status (استلام اللجنة + اعتماد الامتحان) */}
          <div className="mt-3 pt-2.5 border-t border-[#bdc9c6]/30 space-y-1.5">
            {/* 1. Committee Receipt Status / Button */}
            <div className="flex items-center justify-between text-xs">
              {committee.receivedByAssistant ? (
                <div className="flex items-center gap-1.5 text-emerald-800 font-semibold text-[11px] bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 w-full justify-between">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-emerald-600">how_to_reg</span>
                    <span>استلمها: <strong>{committee.receivedByAssistant.assistantName}</strong></span>
                  </span>
                  <span className="text-[10px] text-emerald-700 font-normal">
                    {committee.receivedByAssistant.receivedAt.split(' - ')[1] || committee.receivedByAssistant.receivedAt}
                  </span>
                </div>
              ) : canReceive && onReceiveCommittee ? (
                <button
                  type="button"
                  onClick={() => onReceiveCommittee(committee.id)}
                  className="w-full py-1.5 px-2.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-[#005c55] border border-teal-300 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">front_hand</span>
                  <span>تسجيل استلام اللجنة (كمعاون)</span>
                </button>
              ) : (
                <div className="text-[11px] text-gray-400 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">pending</span>
                  <span>بانتظار استلام المعاون للجنة</span>
                </div>
              )}
            </div>

            {/* 2. Exam Readiness Approval */}
            <div className="flex items-center justify-between text-xs">
              {committee.examApprovedBy ? (
                <div className="flex items-center gap-1.5 text-blue-800 font-semibold text-[11px] bg-blue-50 px-2 py-1 rounded-lg border border-blue-200 w-full justify-between">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-blue-600">verified</span>
                    <span>الامتحان معتمد: <strong>{committee.examApprovedBy.assistantName}</strong></span>
                  </span>
                  <span className="text-[10px] text-blue-700 font-normal">
                    {committee.examApprovedBy.approvedAt.split(' - ')[1] || committee.examApprovedBy.approvedAt}
                  </span>
                </div>
              ) : canApproveExam && onApproveExamReadiness ? (
                <button
                  type="button"
                  onClick={() => onApproveExamReadiness(committee.id)}
                  className="w-full py-1.5 px-2.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">fact_check</span>
                  <span>اعتماد جاهزية وتوزيع الامتحان</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="pt-3 border-t border-[#bdc9c6]/30 flex items-center justify-between gap-2 relative">
        <button
          onClick={() => onViewDetails(committee)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#005c55] text-white text-[13px] font-semibold hover:bg-[#1b6b51] transition-colors shadow-xs active:scale-[0.98] cursor-pointer"
        >
          <span className="material-symbols-outlined text-base">visibility</span>
          <span>عرض التفاصيل والمراحل</span>
        </button>

        {/* More options button */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            aria-label="خيارات إضافية"
            className="p-2.5 rounded-xl text-[#3e4947] hover:bg-[#eff4ff] border border-[#bdc9c6]/40 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">more_vert</span>
          </button>

          {/* Quick actions popup */}
          {showMenu && (
            <div className="absolute left-0 bottom-full mb-2 w-52 bg-white rounded-xl shadow-xl border border-[#bdc9c6]/50 py-1.5 z-20 text-right animate-in fade-in duration-100">
              <div className="px-3 py-1 text-[11px] font-bold text-[#6e7977] border-b border-[#bdc9c6]/20">
                تبديل مرحلة سريعة
              </div>
              {STAGES_LIST.slice(1).map((stg) => (
                <button
                  key={stg.key}
                  onClick={() => {
                    onQuickToggleStage(committee.id, stg.key);
                    setShowMenu(false);
                  }}
                  className="w-full text-right px-3 py-1.5 text-xs text-[#0d1c2e] hover:bg-[#eff4ff] flex items-center justify-between"
                >
                  <span className="flex items-center gap-1.5">
                    <span>{stg.emoji}</span>
                    <span>{stg.label}</span>
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      committee.stages[stg.key]?.completed
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {committee.stages[stg.key]?.completed ? 'تم' : 'لم يتم'}
                  </span>
                </button>
              ))}

              {onDeleteCommittee && (
                <>
                  <div className="border-t border-[#bdc9c6]/20 my-1"></div>
                  <button
                    onClick={() => {
                      onDeleteCommittee(committee.id);
                      setShowMenu(false);
                    }}
                    className="w-full text-right px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    <span>حذف اللجنة</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
};
