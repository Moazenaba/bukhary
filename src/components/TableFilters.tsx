import React from 'react';
import { FilterStatus, SortField, SortOrder } from '../types/table';

interface TableFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: FilterStatus;
  onStatusFilterChange: (status: FilterStatus) => void;
  sortField: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField) => void;
  onAddRow: () => void;
  onExportExcel: () => void;
  onExportCSV: () => void;
  onPrint: () => void;
  onResetToDemo: () => void;
  totalFiltered: number;
  totalAll: number;
}

export const TableFilters: React.FC<TableFiltersProps> = ({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortField,
  sortOrder,
  onSortChange,
  onAddRow,
  onExportExcel,
  onExportCSV,
  onPrint,
  onResetToDemo,
  totalFiltered,
  totalAll,
}) => {
  const filterOptions: { id: FilterStatus; label: string; icon: string; countBadge?: string }[] = [
    { id: 'all', label: 'كافة الصفوف', icon: 'list_alt' },
    { id: 'not_delivered', label: 'لم يُسلّم بعد ⏳', icon: 'pending_actions' },
    { id: 'delivered_only', label: 'تم التسليم للمقر', icon: 'move_to_inbox' },
    { id: 'corrected', label: 'تم التصحيح', icon: 'edit_note' },
    { id: 'reviewed', label: 'تم المراجعة', icon: 'fact_check' },
    { id: 'announced', label: 'تم الإعلان', icon: 'campaign' },
    { id: 'ceremony', label: 'تم الحفل', icon: 'military_tech' },
    { id: 'uncertain', label: 'يحتاج تدقيق ⚠️', icon: 'warning' },
    { id: 'struck_out', label: 'الصفوف المشطوبة', icon: 'strikethrough_s' },
  ];

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs mb-4 space-y-3.5">
      {/* Search Input & Action Buttons */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search Field */}
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
            search
          </span>
          <input
            type="text"
            placeholder="بحث باسم الشيخ، المكان، الكتاب المقرر، رقم م، أو الملاحظات..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pr-10 pl-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#005c55] focus:ring-2 focus:ring-[#005c55]/10 outline-none transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Action Buttons: Add Row, Export Excel, Export CSV */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            onClick={onAddRow}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#005c55] hover:bg-[#004742] text-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            title="إضافة صف فارغ جديد للجدول"
          >
            <span className="material-symbols-outlined text-base">add</span>
            <span>إضافة صف جديد</span>
          </button>

          <button
            type="button"
            onClick={onExportExcel}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            title="تصدير جدول البيانات لملف Excel بصيغة xlsx"
          >
            <span className="material-symbols-outlined text-base">table_view</span>
            <span>تصدير Excel (xlsx)</span>
          </button>

          <button
            type="button"
            onClick={onExportCSV}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
            title="تصدير كملف CSV يدعم الحروف العربية بترميز UTF-8 BOM"
          >
            <span className="material-symbols-outlined text-base text-slate-500">csv</span>
            <span>تصدير CSV</span>
          </button>

          <button
            type="button"
            onClick={onPrint}
            className="p-2 rounded-xl text-slate-700 hover:bg-slate-100 border border-slate-200 transition-all cursor-pointer"
            title="طباعة الجدول"
          >
            <span className="material-symbols-outlined text-lg">print</span>
          </button>

          <button
            type="button"
            onClick={onResetToDemo}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition-all cursor-pointer"
            title="استعادة البيانات النموذجية الأولية"
          >
            <span className="material-symbols-outlined text-lg">restart_alt</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs / Pills */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 flex-wrap">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full no-scrollbar">
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onStatusFilterChange(opt.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === opt.id
                  ? 'bg-[#005c55] text-white shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>

        {/* Counter Summary */}
        <div className="text-xs font-mono font-bold text-slate-500 shrink-0">
          عرض: <span className="text-[#005c55]">{totalFiltered}</span> من أصل{' '}
          <span className="text-slate-800">{totalAll}</span>
        </div>
      </div>
    </div>
  );
};
