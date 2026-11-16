import React, { useState } from 'react';
import { headOf } from '../utils/logistics';
import { Committee, StageKey, STAGES_LIST, AppUser } from '../types';
import { calculateCurrentStage } from '../utils/stageUtils';
import { EXAM_DATE_TONE_CLASS, examDateStatus } from '../utils/examDate';
import { AuthService } from '../services/AuthService';

interface CommitteeCardProps {
  committee: Committee;
  onViewDetails: (committee: Committee) => void;
  /** Opens the details on the data form (number, name, sheikh, place, book, students...). */
  onEditCommittee?: (committee: Committee) => void;
  onQuickToggleStage: (committeeId: string, stageKey: StageKey) => void;
  onDeleteCommittee?: (committeeId: string) => void;
  currentUser?: AppUser;
  /** Records (or with `cancel`, clears) that the assistant received the committee. */
  onReceiveCommittee?: (committeeId: string, cancel?: boolean) => unknown;
  /** Approves (or with `revoke`, withdraws) exam readiness. */
  onApproveExamReadiness?: (committeeId: string, revoke?: boolean) => unknown;
}

export const CommitteeCard: React.FC<CommitteeCardProps> = ({
  committee,
  onViewDetails,
  onEditCommittee,
  onQuickToggleStage,
  onDeleteCommittee,
  onReceiveCommittee,
  onApproveExamReadiness,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  // Shown only when the server would accept it: action allowed and committee in scope (WEB-06).
  const canReception = AuthService.canOnCommittee('committees.reception', committee);
  const canDelete = AuthService.canOnCommittee('committees.delete', committee);
  const run = async (fn?: () => unknown) => {
    if (!fn) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const currentStatus = calculateCurrentStage(committee.stages);
  const examStatus = examDateStatus(committee);

  // Count how many stages are completed
  const completedStagesCount = Object.values(committee.stages).filter((s) => s.completed).length;
  const totalStagesCount = STAGES_LIST.length;
  const completionPercent = Math.round((completedStagesCount / totalStagesCount) * 100);

  // Unscored questions count if scoring questions exist
  const totalQuestions = committee.scoringDetails?.questions?.length || 0;
  const scoredQuestions = committee.scoringDetails?.questions?.filter((q) => q.completed).length || 0;
  const hasUnscoredQuestions = totalQuestions > 0 && scoredQuestions < totalQuestions;

  return (
    <article className="bg-white border border-slate-200/90 hover:border-emerald-600/50 rounded-2xl p-5 shadow-xs hover:shadow-xl transition-all duration-300 flex flex-col justify-between group relative text-right hover:-translate-y-0.5">
      <div>
        {/* Top Header: Committee Number, Name & Status Badges */}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 mb-3.5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0 flex-1 basis-48">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#004d47] to-[#00665e] text-white flex items-center justify-center font-black text-sm font-mono shrink-0 shadow-xs group-hover:scale-105 transition-transform">
              #{committee.committeeNumber}
            </span>
            <div className="min-w-0">
              <h3 title={committee.committeeName} className="text-base font-extrabold text-slate-900 block leading-snug line-clamp-2 group-hover:text-brand transition-colors">
                {committee.committeeName}
              </h3>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5 flex-wrap">
                {committee.courseName && (
                  <>
                    <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      {committee.courseName}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Status & Women Tag */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {committee.isWomenCommittee && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs">
                <span>🧕</span>
                <span>لجنة نسائية</span>
              </span>
            )}

            <span
              className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-bold border shadow-2xs ${currentStatus.badgeClass}`}
            >
              <span>{currentStatus.emoji}</span>
              <span>{currentStatus.label}</span>
            </span>
            {examStatus && (
              <span className={`inline-flex items-center gap-1 h-7 px-3 rounded-full text-xs font-bold border ${EXAM_DATE_TONE_CLASS[examStatus.tone]}`}>
                <span>📅</span>
                <span>{examStatus.label}</span>
              </span>
            )}
          </div>
        </div>

        {/* Competition Book & Student Count Badges */}
        <div className="flex items-center justify-between gap-2 mb-3.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-emerald-50/80 text-brand border border-emerald-200/80 max-w-full truncate shadow-2xs">
            <span className="material-symbols-outlined text-sm text-emerald-700">menu_book</span>
            <span className="truncate" title={committee.competitionBook}>{committee.competitionBook}</span>
          </span>

          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl font-bold bg-blue-50 text-blue-900 border border-blue-200/80 font-mono text-xs shadow-2xs">
            <span className="material-symbols-outlined text-sm text-blue-700">groups</span>
            <span>{committee.studentsCount || 0} {committee.isWomenCommittee ? 'طالبة' : 'طالباً'}</span>
          </span>
        </div>

        {/* Structured Details Card (Clean & Spacious) */}
        <div className="space-y-2.5 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/70 mb-4 text-xs">
          {/* Members */}
          <div className="flex items-start justify-between gap-2">
            <span className="text-slate-500 font-semibold flex items-center gap-1.5 shrink-0">
              <span className="material-symbols-outlined text-sm text-slate-400">group</span>
              <span>الأعضاء:</span>
            </span>
            <span className="font-semibold text-slate-800 text-left line-clamp-1">
              {committee.members.join(' • ')}
            </span>
          </div>

          {/* Branch */}
          {committee.branch && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 font-semibold flex items-center gap-1.5 shrink-0">
              <span className="material-symbols-outlined text-sm text-slate-400">alt_route</span>
              <span>الفرع:</span>
            </span>
            <span className="font-bold text-slate-800">{committee.branch}</span>
          </div>
          )}

          {/* Association if exists */}
          {committee.associationName && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 font-semibold flex items-center gap-1.5 shrink-0">
                <span className="material-symbols-outlined text-sm text-slate-400">apartment</span>
                <span>الجمعية:</span>
              </span>
              <span className="font-bold text-brand">{committee.associationName}</span>
            </div>
          )}

          {/* Sheikh Recipient if exists */}
          {committee.sheikhName && (
            <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/50">
              <span className="text-slate-500 font-semibold flex items-center gap-1.5 shrink-0">
                <span className="material-symbols-outlined text-sm text-emerald-600">person_pin</span>
                <span>الشيخ الميداني:</span>
              </span>
              <div className="flex items-center gap-1.5 text-left truncate max-w-[210px]">
                <span className="font-bold text-brand truncate" title={committee.sheikhName}>
                  {committee.sheikhName}
                  {committee.sheikhCountry && (
                    <span className="text-slate-400 font-normal text-xs mr-1">
                      ({committee.sheikhCountry})
                    </span>
                  )}
                </span>
                {committee.sheikhPhone && (
                  <a
                    href={`tel:${committee.sheikhPhone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 rounded-md font-mono font-bold shrink-0 shadow-2xs transition-colors"
                    title={`اتصال: ${committee.sheikhPhone}`}
                  >
                    📞 اتصال
                  </a>
                )}
              </div>
            </div>
          )}

          {headOf(committee) && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500 font-semibold">رئيس اللجنة:</span>
              <span className="flex items-center gap-1.5 truncate">
                <span className="font-bold text-brand truncate">{headOf(committee)!.name}</span>
                {headOf(committee)!.phone && (
                  <a
                    href={`tel:${headOf(committee)!.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 rounded-md font-bold shrink-0"
                    title={`اتصال: ${headOf(committee)!.phone}`}
                  >
                    📞 اتصال
                  </a>
                )}
              </span>
            </div>
          )}

          {/* General Notes if exists */}
          {committee.generalNotes && (
            <div className="pt-1.5 border-t border-slate-200/50 text-xs text-slate-600 italic line-clamp-1">
              <span className="font-bold text-slate-800 not-italic">ملاحظة: </span>
              {committee.generalNotes}
            </div>
          )}
        </div>

        {/* Progress Bar & Stage Status */}
        <div className="mb-4">
          <div className="flex justify-between items-center text-xs mb-1.5">
            <span className="text-slate-600 font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-emerald-700">timeline</span>
              <span>سير المراحل:</span>
            </span>
            <span className="font-mono font-extrabold text-brand">
              {completedStagesCount} من {totalStagesCount} مراحل ({completionPercent}%)
            </span>
          </div>

          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex gap-0.5 border border-slate-200/60 p-0.5">
            {STAGES_LIST.map((stg) => {
              const isDone = committee.stages[stg.key]?.completed;
              return (
                <div
                  key={stg.key}
                  title={`${stg.label}: ${isDone ? 'مكتمل' : 'لم يتم'}`}
                  className={`flex-1 h-full rounded-xs transition-colors ${
                    isDone ? 'bg-brand' : 'bg-slate-200'
                  }`}
                />
              );
            })}
          </div>

          {/* Question Scoring Status Banner (Clean & Non-cluttered) */}
          {totalQuestions > 0 && (
            <div className={`mt-2.5 p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all ${
              hasUnscoredQuestions
                ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                : 'bg-emerald-50/70 border-emerald-200 text-emerald-900 font-bold'
            }`}>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base text-amber-700">
                  {hasUnscoredQuestions ? 'edit_note' : 'task_alt'}
                </span>
                <span>
                  {hasUnscoredQuestions ? (
                    <>
                      تم تصحيح <strong>{scoredQuestions}</strong> من <strong>{totalQuestions}</strong> أسئلة
                    </>
                  ) : (
                    <span>اكتمل تصحيح كافة الأسئلة بنجاح ({totalQuestions} أسئلة)</span>
                  )}
                </span>
              </div>

              {hasUnscoredQuestions && (
                <button
                  type="button"
                  onClick={() => onViewDetails(committee)}
                  className="px-2 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer shadow-2xs transition-colors"
                >
                  تصحيح الآن ←
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Reception and exam readiness (assistants, managers of the committee) */}
      {(committee.receivedByAssistant || committee.examApprovedBy || canReception) && (
        <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
          <div className={`p-2 rounded-xl border ${committee.receivedByAssistant ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
            <span className="block font-bold text-slate-700">الاستلام</span>
            <span className="block text-slate-600 truncate" title={committee.receivedByAssistant ? `استلمها ${committee.receivedByAssistant.assistantName}` : 'لم تُستلم بعد'}>
              {committee.receivedByAssistant ? `استلمها ${committee.receivedByAssistant.assistantName}` : 'لم تُستلم بعد'}
            </span>
            {canReception && onReceiveCommittee && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => onReceiveCommittee(committee.id, Boolean(committee.receivedByAssistant)))}
                className="mt-1 text-xs font-bold text-brand hover:underline cursor-pointer disabled:opacity-50"
              >
                {committee.receivedByAssistant ? 'إلغاء التوثيق' : 'توثيق الاستلام'}
              </button>
            )}
          </div>
          <div className={`p-2 rounded-xl border ${committee.examApprovedBy ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
            <span className="block font-bold text-slate-700">جاهزية الامتحان</span>
            <span className="block text-slate-600 truncate" title={committee.examApprovedBy ? `اعتمدها ${committee.examApprovedBy.assistantName}` : 'غير معتمدة'}>
              {committee.examApprovedBy ? `اعتمدها ${committee.examApprovedBy.assistantName}` : 'غير معتمدة'}
            </span>
            {canReception && onApproveExamReadiness && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => onApproveExamReadiness(committee.id, Boolean(committee.examApprovedBy)))}
                className="mt-1 text-xs font-bold text-blue-800 hover:underline cursor-pointer disabled:opacity-50"
              >
                {committee.examApprovedBy ? 'إلغاء الاعتماد' : 'اعتماد الجاهزية'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Footer Actions: High Contrast & Sleek */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 relative">
        <button
          onClick={() => onViewDetails(committee)}
          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-l from-brand to-emerald-700 hover:from-brand-deep hover:to-emerald-800 text-white text-xs font-extrabold transition-all shadow-xs hover:shadow-md active:scale-[0.98] cursor-pointer"
        >
          <span className="material-symbols-outlined text-base">visibility</span>
          <span>عرض التفاصيل وسجل المراحل</span>
        </button>

        {onEditCommittee && AuthService.canOnCommittee('committees.update', committee) && (
          <button
            type="button"
            onClick={() => onEditCommittee(committee)}
            aria-label={`تعديل بيانات لجنة ${committee.committeeNumber}`}
            title="تعديل بيانات اللجنة"
            className="inline-flex items-center gap-1 py-2.5 px-3 rounded-xl border border-brand/40 text-brand hover:bg-emerald-50 text-xs font-extrabold transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">edit</span>
            <span>تعديل</span>
          </button>
        )}

        {/* More options button */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            aria-label="خيارات إضافية"
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">more_vert</span>
          </button>

          {/* Dropdown Menu */}
          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute left-0 bottom-full mb-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-20 py-1.5 animate-in fade-in zoom-in-95 duration-100 text-right">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onViewDetails(committee);
                  }}
                  className="w-full px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 font-bold flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm text-emerald-700">edit_square</span>
                  <span>تعديل بيانات اللجنة</span>
                </button>

                <div className="my-1 border-t border-slate-100" />

                {onDeleteCommittee && canDelete && (
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      if (window.confirm(`هل أنت متأكد من حذف لجنة رقم #${committee.committeeNumber}؟`)) {
                        onDeleteCommittee(committee.id);
                      }
                    }}
                    className="w-full px-3.5 py-2 text-xs text-red-600 hover:bg-red-50 font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    <span>حذف اللجنة</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
};
