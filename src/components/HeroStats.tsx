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
    <section className="mb-8 text-right">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[12px] text-[#00504a] font-semibold bg-[#9cf2e8]/40 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 border border-[#9cf2e8]">
              <span className="material-symbols-outlined text-sm text-[#005c55]">verified</span>
              مسابقات مسجد البخاري العلمية
            </span>
            <span className="text-[#3e4947] text-[12px] font-medium">• دورة متون العقيدة والتوحيد</span>
          </div>
          <h1 className="text-[26px] sm:text-[32px] font-bold text-[#0d1c2e] tracking-tight">
            إدارة لجان الاختبار والتصحيح
          </h1>
          <p className="text-[14px] text-[#3e4947] mt-1 max-w-2xl leading-relaxed">
            متابعة فورية لمراحل اللجان: جاري الامتحان، التصحيح، تجميع الدرجات، كتابة الكشوفات، المراجعة، إعلان النتيجة، والحفل.
          </p>
        </div>

        {/* Quick Summary Stats */}
        <div className="flex items-center gap-3">
          <div className="bg-white border border-[#bdc9c6]/40 rounded-xl px-4 py-2.5 text-center shadow-xs min-w-[95px] sm:min-w-[105px]">
            <span className="block text-[22px] sm:text-[24px] text-[#005c55] font-bold">
              {totalCommittees}
            </span>
            <span className="block text-[11px] sm:text-[12px] text-[#3e4947]">
              إجمالي اللجان
            </span>
          </div>

          <div className="bg-white border border-[#bdc9c6]/40 rounded-xl px-4 py-2.5 text-center shadow-xs min-w-[95px] sm:min-w-[105px]">
            <span className="block text-[22px] sm:text-[24px] text-blue-700 font-bold">
              {activeCommittees}
            </span>
            <span className="block text-[11px] sm:text-[12px] text-[#3e4947]">
              لجان قيد العمل
            </span>
          </div>

          <div className="bg-white border border-[#bdc9c6]/40 rounded-xl px-4 py-2.5 text-center shadow-xs min-w-[95px] sm:min-w-[105px]">
            <span className="block text-[22px] sm:text-[24px] text-emerald-700 font-bold">
              {completedCommittees}
            </span>
            <span className="block text-[11px] sm:text-[12px] text-[#3e4947]">
              تم الحفل والتكريم
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
