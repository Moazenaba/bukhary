import React from 'react';
import { CourseTableRow, ExtractionStats } from '../types/table';

interface SummaryCardsProps {
  rows: CourseTableRow[];
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ rows }) => {
  const activeRows = rows.filter((r) => !r.struck_out);
  const total = rows.length;
  const activeCount = activeRows.length;

  const delivered = activeRows.filter((r) => r.delivered).length;
  const corrected = activeRows.filter((r) => r.corrected).length;
  const reviewed = activeRows.filter((r) => r.reviewed).length;
  const announced = activeRows.filter((r) => r.announced).length;
  const ceremony = activeRows.filter((r) => r.ceremony).length;
  const uncertainCount = rows.filter((r) => r.uncertain).length;
  const struckCount = rows.filter((r) => r.struck_out).length;

  const calcRate = (count: number) => {
    if (activeCount === 0) return 0;
    return Math.round((count / activeCount) * 100);
  };

  const statItems = [
    {
      title: 'إجمالي الصفوف',
      value: total,
      subtext: `${activeCount} نشط ${struckCount > 0 ? `• ${struckCount} مشطوب` : ''}`,
      icon: 'format_list_numbered',
      color: 'from-slate-700 to-slate-900',
      textColor: 'text-slate-800',
      bgColor: 'bg-slate-50',
      borderColor: 'border-slate-200',
      badgeColor: 'bg-slate-200 text-slate-800',
      rate: null,
    },
    {
      title: 'تم التسليم للمقر',
      value: delivered,
      subtext: `نسبة الإنجاز: ${calcRate(delivered)}%`,
      icon: 'move_to_inbox',
      color: 'from-blue-600 to-indigo-700',
      textColor: 'text-blue-900',
      bgColor: 'bg-blue-50/70',
      borderColor: 'border-blue-200',
      badgeColor: 'bg-blue-100 text-blue-800',
      rate: calcRate(delivered),
    },
    {
      title: 'تم التصحيح',
      value: corrected,
      subtext: `نسبة الإنجاز: ${calcRate(corrected)}%`,
      icon: 'edit_note',
      color: 'from-teal-600 to-emerald-700',
      textColor: 'text-teal-900',
      bgColor: 'bg-teal-50/70',
      borderColor: 'border-teal-200',
      badgeColor: 'bg-teal-100 text-teal-800',
      rate: calcRate(corrected),
    },
    {
      title: 'تم المراجعة',
      value: reviewed,
      subtext: `نسبة الإنجاز: ${calcRate(reviewed)}%`,
      icon: 'fact_check',
      color: 'from-emerald-600 to-green-700',
      textColor: 'text-emerald-900',
      bgColor: 'bg-emerald-50/70',
      borderColor: 'border-emerald-200',
      badgeColor: 'bg-emerald-100 text-emerald-800',
      rate: calcRate(reviewed),
    },
    {
      title: 'تم الإعلان',
      value: announced,
      subtext: `نسبة الإنجاز: ${calcRate(announced)}%`,
      icon: 'campaign',
      color: 'from-purple-600 to-violet-700',
      textColor: 'text-purple-900',
      bgColor: 'bg-purple-50/70',
      borderColor: 'border-purple-200',
      badgeColor: 'bg-purple-100 text-purple-800',
      rate: calcRate(announced),
    },
    {
      title: 'تم الحفل والتكريم',
      value: ceremony,
      subtext: `نسبة الإنجاز: ${calcRate(ceremony)}%`,
      icon: 'military_tech',
      color: 'from-amber-500 to-amber-700',
      textColor: 'text-amber-900',
      bgColor: 'bg-amber-50/70',
      borderColor: 'border-amber-200',
      badgeColor: 'bg-amber-100 text-amber-800',
      rate: calcRate(ceremony),
    },
  ];

  return (
    <div className="space-y-3 mb-6">
      {/* 6 Stat Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statItems.map((item, idx) => (
          <div
            key={idx}
            className={`p-3.5 rounded-2xl border ${item.borderColor} ${item.bgColor} flex flex-col justify-between transition-all hover:shadow-xs`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-600 truncate">{item.title}</span>
              <span className="material-symbols-outlined text-lg text-slate-500" aria-hidden="true">{item.icon}</span>
            </div>

            <div className="flex items-baseline justify-between gap-1 mb-2">
              <span className={`text-2xl font-black font-mono ${item.textColor}`}>{item.value}</span>
              {item.rate !== null && (
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${item.badgeColor}`}>
                  {item.rate}%
                </span>
              )}
            </div>

            {/* Micro Progress Bar */}
            {item.rate !== null ? (
              <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-[#005c55] h-full rounded-full transition-all duration-500"
                  style={{ width: `${item.rate}%` }}
                />
              </div>
            ) : (
              <span className="text-[10px] text-slate-500 truncate">{item.subtext}</span>
            )}
          </div>
        ))}
      </div>

      {/* Uncertainty & Attention Alerts */}
      {uncertainCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-600 text-lg" aria-hidden="true">warning</span>
            <span>
              يوجد <strong className="font-bold underline">{uncertainCount} صفاً</strong> يتضمن كلمات غير واضحة تماماً بالخط اليدوي ومظللة باللون الأصفر للمراجعة والتدقيق.
            </span>
          </div>
          <span className="text-[11px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-lg">
            يرجى مراجعتها وتعديلها
          </span>
        </div>
      )}
    </div>
  );
};
