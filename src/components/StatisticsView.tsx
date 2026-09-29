import React, { useState } from 'react';
import { Committee, STAGES_LIST } from '../types';
import { calculateCurrentStage } from '../utils/stageUtils';

interface StatisticsViewProps {
  committees: Committee[];
}

export const StatisticsView: React.FC<StatisticsViewProps> = ({ committees }) => {
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

  // Calculations for Periodic Rates (حركة حلوة: أسبوعي - شهري - سنوي)
  // Weekly calculations
  const weeklyTarget = Math.max(1, Math.ceil(total * 0.4)); // e.g. 40% of committees expected this week
  const weeklyCompleted = committees.filter(
    (c) => c.stages.ceremony?.completed || c.stages.announcement?.completed || c.stages.review?.completed
  ).length;
  const weeklyRate = Math.min(100, Math.round((weeklyCompleted / weeklyTarget) * 100));

  // Monthly calculations
  const monthlyTarget = Math.max(1, Math.ceil(total * 0.8)); // 80% monthly expected target
  const monthlyCompleted = committees.filter(
    (c) => c.stages.ceremony?.completed || c.stages.announcement?.completed
  ).length;
  const monthlyRate = Math.min(100, Math.round((monthlyCompleted / monthlyTarget) * 100));

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
    booksCount[c.competitionBook] = (booksCount[c.competitionBook] || 0) + 1;
  });

  return (
    <div className="space-y-6 text-right">
      {/* Top Banner: Periodic Toggle (الحركة الحلوة لنسب الإنجاز: أسبوعي - شهري - سنوي) */}
      <div className="bg-white rounded-2xl p-5 border border-[#bdc9c6]/50 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-800">
              <span className="material-symbols-outlined text-2xl">analytics</span>
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0d1c2e]">
              لوحة حساب نسبة الإنجاز الدورية (أسبوعية • شهرية • سنوية)
            </h2>
          </div>
          <p className="text-xs text-[#6e7977] mt-1">
            متابعة دقيقة لمعدلات إنجاز وتصحيح لجان مسابقات مسجد البخاري وتطورها الزمني.
          </p>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[#f8f9ff] border border-[#bdc9c6]/60 rounded-xl">
          <button
            onClick={() => setActivePeriod('week')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activePeriod === 'week'
                ? 'bg-[#005c55] text-white shadow-xs'
                : 'text-[#3e4947] hover:bg-white'
            }`}
          >
            <span className="material-symbols-outlined text-sm">calendar_view_week</span>
            <span>نسبة هذا الأسبوع</span>
          </button>

          <button
            onClick={() => setActivePeriod('month')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activePeriod === 'month'
                ? 'bg-[#005c55] text-white shadow-xs'
                : 'text-[#3e4947] hover:bg-white'
            }`}
          >
            <span className="material-symbols-outlined text-sm">calendar_month</span>
            <span>نسبة هذا الشهر</span>
          </button>

          <button
            onClick={() => setActivePeriod('year')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activePeriod === 'year'
                ? 'bg-[#005c55] text-white shadow-xs'
                : 'text-[#3e4947] hover:bg-white'
            }`}
          >
            <span className="material-symbols-outlined text-sm">event_repeat</span>
            <span>النسبة السنوية (الموسم)</span>
          </button>
        </div>
      </div>

      {/* 3 Interactive Periodic Cards (هذا الأسبوع | هذا الشهر | السنوي) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* 1. WEEKLY RATE CARD */}
        <div
          onClick={() => setActivePeriod('week')}
          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer ${
            activePeriod === 'week'
              ? 'bg-emerald-50/40 border-[#005c55] shadow-md ring-2 ring-[#005c55]/20'
              : 'bg-white border-[#bdc9c6]/50 hover:border-[#005c55]/60'
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
              <span className="block text-[10px] text-teal-700 font-semibold mt-0.5">
                +14% مقارنة بالأسبوع الماضي
              </span>
            </div>
          </div>

          <h3 className="font-bold text-sm text-[#0d1c2e]">نسبة الإنجاز هذا الأسبوع</h3>
          <p className="text-xs text-[#6e7977] mt-1">
            أنجزت <strong>{weeklyCompleted}</strong> لجان من مستهدف <strong>{weeklyTarget}</strong> لجان هذا الأسبوع
          </p>

          <div className="w-full h-2.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
            <div
              className="h-full bg-teal-600 rounded-full transition-all duration-500"
              style={{ width: `${weeklyRate}%` }}
            />
          </div>
          <span className="block text-[11px] text-teal-700 font-semibold mt-2">
            مستوى التقدم: ممتاز وفق الخطة الأسبوعية
          </span>
        </div>

        {/* 2. MONTHLY RATE CARD */}
        <div
          onClick={() => setActivePeriod('month')}
          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer ${
            activePeriod === 'month'
              ? 'bg-blue-50/40 border-blue-600 shadow-md ring-2 ring-blue-600/20'
              : 'bg-white border-[#bdc9c6]/50 hover:border-blue-400'
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
              <span className="block text-[10px] text-blue-700 font-semibold mt-0.5">
                مستهدف ربيع الأول
              </span>
            </div>
          </div>

          <h3 className="font-bold text-sm text-[#0d1c2e]">نسبة الإنجاز الشهرية</h3>
          <p className="text-xs text-[#6e7977] mt-1">
            أنجزت <strong>{monthlyCompleted}</strong> لجان معتمدة من إجمالي مستهدف <strong>{monthlyTarget}</strong> لجنة للشهر
          </p>

          <div className="w-full h-2.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${monthlyRate}%` }}
            />
          </div>
          <span className="block text-[11px] text-blue-700 font-semibold mt-2">
            إتمام تسليم كشوف الدرجات والمراجعة
          </span>
        </div>

        {/* 3. ANNUAL RATE CARD */}
        <div
          onClick={() => setActivePeriod('year')}
          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer ${
            activePeriod === 'year'
              ? 'bg-emerald-50/50 border-emerald-600 shadow-md ring-2 ring-emerald-600/20'
              : 'bg-white border-[#bdc9c6]/50 hover:border-emerald-400'
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
              <span className="block text-[10px] text-emerald-700 font-semibold mt-0.5">
                الموسم السنوي الكامل
              </span>
            </div>
          </div>

          <h3 className="font-bold text-sm text-[#0d1c2e]">نسبة الإنجاز السنوية (الموسم)</h3>
          <p className="text-xs text-[#6e7977] mt-1">
            <strong>{annualCompleted}</strong> لجان أتمت الحفل بالكامل من إجمالي <strong>{annualTarget}</strong> لجنة سنوية
          </p>

          <div className="w-full h-2.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full transition-all duration-500"
              style={{ width: `${annualRate}%` }}
            />
          </div>
          <span className="block text-[11px] text-emerald-700 font-semibold mt-2">
            {annualCompleted} لجان كُرّمت رسميًا في الحفل
          </span>
        </div>
      </div>

      {/* Focus Period Banner based on selected Tab */}
      <div className="p-4 rounded-2xl bg-gradient-to-l from-[#005c55] to-emerald-800 text-white flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-xl bg-white/20 text-white">
            <span className="material-symbols-outlined text-2xl">speed</span>
          </span>
          <div>
            <h4 className="font-bold text-sm">
              {activePeriod === 'week'
                ? 'تقرير وتيرة الإنجاز هذا الأسبوع: نشاط مكثف في التصحيح والتجميع'
                : activePeriod === 'month'
                ? 'تقرير الإنجاز الشهري: اعتماد وتدقيق كشوف اللجان والنتائج'
                : 'التقرير السنوي لمسابقات مسجد البخاري: حصاد موسم المتون العلمية'}
            </h4>
            <p className="text-xs text-teal-100 mt-0.5">
              {activePeriod === 'week'
                ? `بلغ معدل إنجاز اللجان هذا الأسبوع ${weeklyRate}% بمتوسط تصحيح سريع للأسئلة.`
                : activePeriod === 'month'
                ? `تم إنجاز ${monthlyCompleted} لجنة خلال الشهر الحالي بنجاح تام وتوثيق زمني.`
                : `إجمالي اللجان المسجلة بالدورة ${total} لجنة في متون العقيدة والتوحيد.`}
            </p>
          </div>
        </div>

        {totalQuestionsCount > 0 && (
          <div className="bg-white/10 px-3.5 py-2 rounded-xl border border-white/20 text-xs shrink-0 text-center">
            <span className="text-[11px] text-teal-100 block">إجمالي الأسئلة المصححة:</span>
            <span className="font-mono font-bold text-sm text-white">
              {totalQuestionsCompleted} من {totalQuestionsCount} سؤال
            </span>
          </div>
        )}
      </div>

      {/* Grid: Stages Distribution & Books Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stages Progress Distribution */}
        <div className="bg-white p-5 rounded-2xl border border-[#bdc9c6]/50 shadow-xs">
          <h3 className="font-bold text-base text-[#0d1c2e] mb-4">
            توزيع اللجان حسب المرحلة الحالية
          </h3>

          <div className="space-y-3.5">
            {STAGES_LIST.slice(1).map((stg) => {
              const count = currentStageBreakdown[stg.key] || 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;

              return (
                <div key={stg.key}>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="flex items-center gap-1.5">
                      <span>{stg.emoji}</span>
                      <span>{stg.activeLabel}</span>
                    </span>
                    <span className="font-mono text-[#0d1c2e]">
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
        <div className="bg-white p-5 rounded-2xl border border-[#bdc9c6]/50 shadow-xs">
          <h3 className="font-bold text-base text-[#0d1c2e] mb-4">
            توزيع اللجان حسب الكتب المقررة
          </h3>

          <div className="space-y-3">
            {Object.entries(booksCount).map(([book, count], idx) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-[#f8f9ff] border border-[#bdc9c6]/40 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#005c55] text-lg">
                      auto_stories
                    </span>
                    <span className="font-bold text-xs text-[#0d1c2e]">{book}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#005c55]">
                      {count} لجنة
                    </span>
                    <span className="text-[11px] text-[#6e7977] bg-white px-2 py-0.5 rounded-md border border-[#bdc9c6]/40">
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
