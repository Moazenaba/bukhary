import React from 'react';
import { TableFilterKey } from '../types/tableTypes';

interface FilterToolbarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeFilter: TableFilterKey;
  setActiveFilter: (f: TableFilterKey) => void;
  filterCounts: Record<TableFilterKey, number>;
  onOpenUpload: () => void;
  onOpenAddRow: () => void;
  onExportExcel: () => void;
  onExportCSV: () => void;
  onPrint: () => void;
}

export const FilterToolbar: React.FC<FilterToolbarProps> = ({
  searchQuery,
  setSearchQuery,
  activeFilter,
  setActiveFilter,
  filterCounts,
  onOpenUpload,
  onOpenAddRow,
  onExportExcel,
  onExportCSV,
  onPrint,
}) => {
  const filterTabs: Array<{ key: TableFilterKey; label: string; icon?: string; badgeColor?: string }> = [
    { key: 'all', label: 'كافة الصفوف' },
    { key: 'not_delivered', label: 'لم يُسلّم بعد', icon: 'pending' },
    { key: 'in_correction', label: 'في التصحيح', icon: 'edit_note' },
    { key: 'in_review', label: 'في المراجعة', icon: 'verified' },
    { key: 'in_announcement', label: 'في الإعلان', icon: 'campaign' },
    { key: 'in_ceremony', label: 'في الحفل', icon: 'celebration' },
    { key: 'completed', label: 'مكتمل بالكامل', icon: 'task_alt' },
    { key: 'uncertain', label: 'بحاجة لمراجعة (غير مؤكد)', icon: 'warning', badgeColor: 'bg-amber-100 text-amber-900 border-amber-300' },
    { key: 'struck_out', label: 'الصفوف المشطوبة', icon: 'strikethrough_s' },
  ];

  return (
    <div className="space-y-3 mb-4">
      {/* Top action row: Search input + Primary Actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-white p-3.5 rounded-2xl border border-[#bdc9c6]/40 shadow-xs">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالشيخ، المكان، الكتاب، أو الرقم..."
            className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl pr-9 pl-3 py-2 text-xs text-[#0d1c2e] outline-none focus:border-[#005c55] focus:bg-white"
          />
          <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-base text-[#6e7977]" aria-hidden="true">
            search
          </span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute left-2.5 top-2.5 text-xs text-gray-400 hover:text-gray-700"
            >
              ✕
            </button>
          )}
        </div>

        {/* Buttons Group */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* AI Scan button */}
          <button
            type="button"
            onClick={onOpenUpload}
            className="px-3.5 py-2 bg-[#005c55] hover:bg-[#1b6b51] text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer transition-transform active:scale-95"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">document_scanner</span>
            <span>مسح جدول خط اليد (AI)</span>
          </button>

          {/* Add Row button */}
          <button
            type="button"
            onClick={onOpenAddRow}
            className="px-3 py-2 bg-white border border-[#bdc9c6] hover:bg-gray-50 text-[#005c55] rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">add</span>
            <span>إضافة صف يدوياً</span>
          </button>

          {/* Export Excel */}
          <button
            type="button"
            onClick={onExportExcel}
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer"
            title="تصدير ملف Microsoft Excel (.xlsx)"
          >
            <span className="material-symbols-outlined text-base text-emerald-700" aria-hidden="true">file_download</span>
            <span>Excel</span>
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={onExportCSV}
            className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer"
            title="تصدير كشف CSV مع ترميز UTF-8"
          >
            <span className="material-symbols-outlined text-base text-blue-700" aria-hidden="true">csv</span>
            <span>CSV</span>
          </button>

          {/* Print */}
          <button
            type="button"
            onClick={onPrint}
            className="p-2 bg-white border border-[#bdc9c6] hover:bg-gray-50 text-[#3e4947] rounded-xl text-xs font-bold shadow-2xs flex items-center justify-center cursor-pointer"
            title="طباعة الكشف"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">print</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs Horizontal Scroller */}
      <div className="overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-1.5 min-w-max">
          {filterTabs.map((tab) => {
            const isSelected = activeFilter === tab.key;
            const count = filterCounts[tab.key] ?? 0;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveFilter(tab.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-[#005c55] text-white shadow-xs'
                    : 'bg-white text-[#3e4947] border border-[#bdc9c6]/60 hover:border-[#005c55]'
                }`}
              >
                {tab.icon && (
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    {tab.icon}
                  </span>
                )}
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-[#0d1c2e]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
