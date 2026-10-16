import React from 'react';

interface HeroStatsProps {
  totalCommittees: number;
  activeCommittees: number;
  completedCommittees: number;
}

export const HeroStats: React.FC<HeroStatsProps> = ({
  totalCommittees,
  activeCommittees,
  completedCommittees,
}) => {
  return (
    <section className="mb-7 text-right">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 bg-gradient-to-l from-white via-emerald-50/20 to-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[11px] text-emerald-900 font-extrabold bg-emerald-100/70 px-3 py-0.5 rounded-full inline-flex items-center gap-1.5 border border-emerald-300">
              <span className="material-symbols-outlined text-sm text-[#005c55]">verified</span>
              <span>مسابقات مسجد الإمام البخاري العلمية</span>
            </span>
            <span className="text-slate-500 text-[11px] font-semibold">• الدورة العلمية الصيفية</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            إدارة ومتابعة لجان الاختبارات الميدانية
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
            متابعة فورية ومباشرة لكافة مراحل اللجان: جاهزية الامتحان، تصحيح الأسئلة، تجميع ومراجعة الدرجات، وإعلان النتائج.
          </p>
        </div>

        {/* Quick Summary Stats */}
        <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap">
          <div className="flex-1 sm:flex-initial bg-white border border-slate-200 rounded-2xl px-5 py-3 text-center shadow-xs min-w-[110px] hover:border-emerald-500/40 transition-colors">
            <span className="block text-2xl sm:text-3xl text-[#005c55] font-black font-mono">
              {totalCommittees}
            </span>
            <span className="block text-xs font-bold text-slate-600 mt-0.5">
              إجمالي اللجان
            </span>
          </div>

          <div className="flex-1 sm:flex-initial bg-white border border-slate-200 rounded-2xl px-5 py-3 text-center shadow-xs min-w-[110px] hover:border-blue-500/40 transition-colors">
            <span className="block text-2xl sm:text-3xl text-blue-700 font-black font-mono">
              {activeCommittees}
            </span>
            <span className="block text-xs font-bold text-slate-600 mt-0.5">
              لجان قيد العمل
            </span>
          </div>

          <div className="flex-1 sm:flex-initial bg-white border border-slate-200 rounded-2xl px-5 py-3 text-center shadow-xs min-w-[110px] hover:border-emerald-500/40 transition-colors">
            <span className="block text-2xl sm:text-3xl text-emerald-700 font-black font-mono">
              {completedCommittees}
            </span>
            <span className="block text-xs font-bold text-slate-600 mt-0.5">
              تم الحفل والتكريم
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
