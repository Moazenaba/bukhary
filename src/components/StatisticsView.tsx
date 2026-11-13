import React, { useState } from 'react';
import { Committee, Course, STAGES_LIST } from '../types';
import { StatsBreakdown } from './StatsBreakdown';
import { calculateCurrentStage } from '../utils/stageUtils';

interface StatisticsViewProps {
  committees: Committee[];
  /** Every course's committees and the courses, for «مقارنة الدورات». */
  allCommittees?: Committee[];
  courses?: Course[];
  currentCourseId?: string;
}

export const StatisticsView: React.FC<StatisticsViewProps> = ({ committees, allCommittees, courses, currentCourseId }) => {
  const total = committees.length;

  // Selected period tab: 'all' (سنوي) | 'month' (شهري) | 'week' (أسبوعي)
  const [activePeriod, setActivePeriod] = useState<'week' | 'month' | 'year'>('week');

  // Completed ceremony committees (Overall Annual)
  const completedCeremonyCount = committees.filter(
    (c) => c.stages.ceremony?.completed
  ).length;

  const overallProgressPercentage = total > 0
    ? Math.round((completedCeremonyCount / total) * 100)
    : 0;

  // Progress milestones measured from the committees' real stages (no assumed targets).
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const weeklyTarget = total;
  const weeklyCompleted = committees.filter(
    (c) => c.stages.ceremony?.completed || c.stages.announcement?.completed || c.stages.review?.completed
  ).length;
  const weeklyRate = pct(weeklyCompleted);

  const monthlyTarget = total;
  const monthlyCompleted = committees.filter(
    (c) => c.stages.ceremony?.completed || c.stages.announcement?.completed
  ).length;
  const monthlyRate = pct(monthlyCompleted);

  // Annual calculations
  const annualTarget = total;
  const annualCompleted = completedCeremonyCount;
  const annualRate = overallProgressPercentage;

  // Question scoring stats across all committees
  let totalQuestionsCount = 0;
  let totalQuestionsCompleted = 0;
  committees.forEach((c) => {
    if (c.scoringDetails?.questions) {
      totalQuestionsCount += c.scoringDetails.questions.length;
      totalQuestionsCompleted += c.scoringDetails.questions.filter((q) => q.completed).length;
    }
  });

  // Breakdown of committees by active current stage
  const currentStageBreakdown: Record<string, number> = {};
  STAGES_LIST.forEach((s) => {
    currentStageBreakdown[s.key] = 0;
  });

  committees.forEach((c) => {
    const status = calculateCurrentStage(c.stages);
    currentStageBreakdown[status.key] = (currentStageBreakdown[status.key] || 0) + 1;
  });

  // Group by books
  const booksCount: Record<string, number> = {};
  committees.forEach((c) => {
    const book = c.competitionBook?.trim() || 'متون غير مصنفة';
    booksCount[book] = (booksCount[book] || 0) + 1;
  });

  const getProgressLabel = (rate: number) => {
    if (rate >= 90) return 'مستوى التقدم: استثنائي - تجاوز التوقعات';
    if (rate >= 75) return 'مستوى التقدم: ممتاز - وفق الخطة المقررة';
    if (rate >= 50) return 'مستوى التقدم: جيد - يتطلب متابعة دورية';
    if (rate >= 25) return 'مستوى التقدم: مقبول - يتطلب تسريع الوتيرة';
    return 'مستوى التقدم: في البداية - بانتظار الاعتماد الميداني';
  };

  return (
    <div className="space-y-6 text-right">
      {/* Top Banner: Periodic Toggle */}
      <div className="bg-white rounded-2xl p-5 border border-line/50 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-800">
              <span className="material-symbols-outlined text-2xl">analytics</span>
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-ink">
              لوحة الإحصائيات ونسب الإنجاز الحية
            </h2>
          </div>
          <p className="text-xs text-muted mt-1">
            متابعة حية لمعدلات إنجاز وتصحيح لجان مسابقات مسجد البخاري المستخرجة من قاعدة البيانات.
          </p>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-canvas border border-line/60 rounded-xl">
          <button
            onClick={() => setActivePeriod('week')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activePeriod === 'week'
                ? 'bg-brand text-white shadow-xs'
                : 'text-ink-soft hover:bg-white'
            }`}
          >
            <span className="material-symbols-outlined text-sm">calendar_view_week</span>
            <span>بلغت مرحلة المراجعة</span>
          </button>

          <button
            onClick={() => setActivePeriod('month')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activePeriod === 'month'
                ? 'bg-brand text-white shadow-xs'
                : 'text-ink-soft hover:bg-white'
            }`}
          >
            <span className="material-symbols-outlined text-sm">calendar_month</span>
            <span>أُعلنت نتيجتها</span>
          </button>

          <button
            onClick={() => setActivePeriod('year')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activePeriod === 'year'
                ? 'bg-brand text-white shadow-xs'
                : 'text-ink-soft hover:bg-white'
            }`}
          >
            <span className="material-symbols-outlined text-sm">event_repeat</span>
            <span>النسبة الإجمالية للموسم</span>
          </button>
        </div>
      </div>

      {/* 3 Interactive Periodic Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* 1. WEEKLY RATE CARD */}
        <div
          onClick={() => setActivePeriod('week')}
          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer ${
            activePeriod === 'week'
              ? 'bg-emerald-50/40 border-brand shadow-md ring-2 ring-brand/20'
              : 'bg-white border-line/50 hover:border-brand/60'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="p-2.5 rounded-xl bg-teal-100 text-teal-800">
              <span className="material-symbols-outlined text-2xl">date_range</span>
            </span>
            <div className="text-left">
              <span className="text-3xl font-mono font-bold text-teal-800">
                {weeklyRate}%
              </span>
              <span className="block text-xs text-teal-700 font-semibold mt-0.5">
                من إجمالي اللجان
              </span>
            </div>
          </div>

          <h3 className="font-bold text-sm text-ink">اللجان التي بلغت مرحلة المراجعة أو ما بعدها</h3>
          <p className="text-xs text-muted mt-1">
            <strong>{weeklyCompleted}</strong> لجنة من إجمالي <strong>{weeklyTarget}</strong> لجنة مسجلة
          </p>

          <div className="w-full h-2.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
            <div
              className="h-full bg-teal-600 rounded-full transition-all duration-500"
              style={{ width: `${weeklyRate}%` }}
            />
          </div>
          <span className="block text-xs text-teal-700 font-semibold mt-2">
            {getProgressLabel(weeklyRate)}
          </span>
        </div>

        {/* 2. MONTHLY RATE CARD */}
        <div
          onClick={() => setActivePeriod('month')}
          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer ${
            activePeriod === 'month'
              ? 'bg-blue-50/40 border-blue-600 shadow-md ring-2 ring-blue-600/20'
              : 'bg-white border-line/50 hover:border-blue-400'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="p-2.5 rounded-xl bg-blue-100 text-blue-800">
              <span className="material-symbols-outlined text-2xl">calendar_month</span>
            </span>
            <div className="text-left">
              <span className="text-3xl font-mono font-bold text-blue-700">
                {monthlyRate}%
              </span>
              <span className="block text-xs text-blue-700 font-semibold mt-0.5">
                من إجمالي اللجان
              </span>
            </div>
          </div>

          <h3 className="font-bold text-sm text-ink">اللجان التي أُعلنت نتيجتها</h3>
          <p className="text-xs text-muted mt-1">
            <strong>{monthlyCompleted}</strong> لجنة من إجمالي <strong>{monthlyTarget}</strong> لجنة مسجلة
          </p>

          <div className="w-full h-2.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${monthlyRate}%` }}
            />
          </div>
          <span className="block text-xs text-blue-700 font-semibold mt-2">
            {getProgressLabel(monthlyRate)}
          </span>
        </div>

        {/* 3. ANNUAL RATE CARD */}
        <div
          onClick={() => setActivePeriod('year')}
          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer ${
            activePeriod === 'year'
              ? 'bg-emerald-50/50 border-emerald-600 shadow-md ring-2 ring-emerald-600/20'
              : 'bg-white border-line/50 hover:border-emerald-400'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800">
              <span className="material-symbols-outlined text-2xl">celebration</span>
            </span>
            <div className="text-left">
              <span className="text-3xl font-mono font-bold text-emerald-700">
                {annualRate}%
              </span>
              <span className="block text-xs text-emerald-700 font-semibold mt-0.5">
                الموسم الكامل
              </span>
            </div>
          </div>

          <h3 className="font-bold text-sm text-ink">النسبة الإجمالية (الموسم)</h3>
          <p className="text-xs text-muted mt-1">
            <strong>{annualCompleted}</strong> لجان أتمت الحفل بالكامل من إجمالي <strong>{annualTarget}</strong> لجنة مسجلة
          </p>

          <div className="w-full h-2.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full transition-all duration-500"
              style={{ width: `${annualRate}%` }}
            />
          </div>
          <span className="block text-xs text-emerald-700 font-semibold mt-2">
            تم تكريم {annualCompleted} لجان رسمياً حتى الآن
          </span>
        </div>
      </div>

      {/* Focus Period Banner based on selected Tab */}
      <div className="p-4 rounded-2xl bg-gradient-to-l from-brand to-emerald-800 text-white flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-xl bg-white/20 text-white">
            <span className="material-symbols-outlined text-2xl">speed</span>
          </span>
          <div>
            <h4 className="font-bold text-sm">
              {activePeriod === 'week'
                ? 'اللجان التي بلغت المراجعة'
                : activePeriod === 'month'
                ? 'اللجان التي أُعلنت نتيجتها'
                : 'التقرير الختامي لمسابقات مسجد البخاري'}
            </h4>
            <p className="text-xs text-teal-100 mt-0.5">
              {activePeriod === 'week'
                ? `${weeklyCompleted} من ${total} لجنة (${weeklyRate}%) بلغت مرحلة المراجعة أو ما بعدها.`
                : activePeriod === 'month'
                ? `${monthlyCompleted} من ${total} لجنة (${monthlyRate}%) أُعلنت نتيجتها.`
                : `إجمالي اللجان المسجلة بالدورة ${total} لجنة في مختلف المتون الشرعية.`}
            </p>
          </div>
        </div>

        {totalQuestionsCount > 0 && (
          <div className="bg-white/10 px-3.5 py-2 rounded-xl border border-white/20 text-xs shrink-0 text-center">
            <span className="text-xs text-teal-100 block">إجمالي الأسئلة المصححة:</span>
            <span className="font-mono font-bold text-sm text-white">
              {totalQuestionsCompleted} من {totalQuestionsCount} سؤال
            </span>
          </div>
        )}
      </div>

      {/* Grid: Stages Distribution & Books Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stages Progress Distribution */}
        <div className="bg-white p-5 rounded-2xl border border-line/50 shadow-xs">
          <h3 className="font-bold text-base text-ink mb-4">
            توزيع اللجان حسب المرحلة الحالية
          </h3>

          <div className="space-y-3.5">
            {STAGES_LIST.map((stg) => {
              const count = currentStageBreakdown[stg.key] || 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;

              return (
                <div key={stg.key}>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="flex items-center gap-1.5">
                      <span>{stg.emoji}</span>
                      <span>{stg.activeLabel}</span>
                    </span>
                    <span className="font-mono text-ink">
                      {count} لجنة ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${stg.dotColor} rounded-full transition-all duration-300`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Books Distribution */}
        <div className="bg-white p-5 rounded-2xl border border-line/50 shadow-xs">
          <h3 className="font-bold text-base text-ink mb-4">
            توزيع اللجان حسب الكتب المقررة
          </h3>

          <div className="space-y-3">
            {Object.entries(booksCount).map(([book, count], idx) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div
                  key={`${book}-${idx}`}
                  className="p-3 rounded-xl bg-canvas border border-line/40 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-brand text-lg">
                      auto_stories
                    </span>
                    <span className="font-bold text-xs text-ink">{book}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-brand">
                      {count} لجنة
                    </span>
                    <span className="text-xs text-muted bg-white px-2 py-0.5 rounded-md border border-line/40">
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <StatsBreakdown committees={committees} allCommittees={allCommittees} courses={courses} currentCourseId={currentCourseId} />
    </div>
  );
};
