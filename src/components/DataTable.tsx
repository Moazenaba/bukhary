import React from 'react';
import { CourseTableRow, SortField, SortOrder } from '../types/table';

interface DataTableProps {
  rows: CourseTableRow[];
  onUpdateRow: (id: string, updates: Partial<CourseTableRow>) => void;
  onDeleteRow: (id: string) => void;
  onDuplicateRow: (id: string) => void;
  sortField: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField) => void;
  onAddRow: () => void;
}

export const DataTable: React.FC<DataTableProps> = ({
  rows,
  onUpdateRow,
  onDeleteRow,
  onDuplicateRow,
  sortField,
  sortOrder,
  onSortChange,
  onAddRow,
}) => {
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <span className="material-symbols-outlined text-xs text-slate-400" aria-hidden="true">unfold_more</span>;
    }
    return sortOrder === 'asc' ? (
      <span className="material-symbols-outlined text-xs text-[#005c55]" aria-hidden="true">arrow_upward</span>
    ) : (
      <span className="material-symbols-outlined text-xs text-[#005c55]" aria-hidden="true">arrow_downward</span>
    );
  };

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
          <span className="material-symbols-outlined text-3xl" aria-hidden="true">inbox</span>
        </div>
        <h3 className="text-base font-bold text-slate-800 mb-1">لا توجد صفوف تطابق معايير البحث والفلترة</h3>
        <p className="text-xs text-slate-500 mb-4">
          يمكنك تغيير كلمات البحث أو إعادة ضبط الفلتر أو إضافة صف جديد يدوياً.
        </p>
        <button
          type="button"
          onClick={onAddRow}
          className="px-4 py-2 bg-[#005c55] text-white font-bold rounded-xl text-xs hover:bg-[#004742] transition-all cursor-pointer inline-flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">add</span>
          <span>إضافة صف جديد الآن</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-right border-collapse text-xs">
          {/* Table Header */}
          <thead>
            <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-200 select-none font-bold text-[11px]">
              {/* 1. م (رقم تسلسلي) */}
              <th
                onClick={() => onSortChange('number')}
                className="py-3 px-3 w-14 text-center cursor-pointer hover:bg-slate-200/70 transition-colors"
                title="الرقم التسلسلي"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>م</span>
                  {getSortIcon('number')}
                </div>
              </th>

              {/* 2. اسم الشيخ */}
              <th
                onClick={() => onSortChange('sheikh_name')}
                className="py-3 px-3 min-w-[200px] cursor-pointer hover:bg-slate-200/70 transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>اسم الشيخ</span>
                  {getSortIcon('sheikh_name')}
                </div>
              </th>

              {/* 3. المكان */}
              <th
                onClick={() => onSortChange('place')}
                className="py-3 px-3 min-w-[150px] cursor-pointer hover:bg-slate-200/70 transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>المكان / القاعة</span>
                  {getSortIcon('place')}
                </div>
              </th>

              {/* 4. الكتاب */}
              <th
                onClick={() => onSortChange('book')}
                className="py-3 px-3 min-w-[180px] cursor-pointer hover:bg-slate-200/70 transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>الكتاب المقرر</span>
                  {getSortIcon('book')}
                </div>
              </th>

              {/* 5. التسليم للمقر */}
              <th className="py-3 px-2 w-24 text-center">
                <span className="block leading-tight">التسليم للمقر</span>
                <span className="text-[10px] text-slate-500 font-normal">خطوة 1</span>
              </th>

              {/* 6. تم التصحيح */}
              <th className="py-3 px-2 w-24 text-center">
                <span className="block leading-tight">تم التصحيح</span>
                <span className="text-[10px] text-slate-500 font-normal">خطوة 2</span>
              </th>

              {/* 7. تم المراجعة */}
              <th className="py-3 px-2 w-24 text-center">
                <span className="block leading-tight">تم المراجعة</span>
                <span className="text-[10px] text-slate-500 font-normal">خطوة 3</span>
              </th>

              {/* 8. تم الإعلان */}
              <th className="py-3 px-2 w-24 text-center">
                <span className="block leading-tight">تم الإعلان</span>
                <span className="text-[10px] text-slate-500 font-normal">خطوة 4</span>
              </th>

              {/* 9. تم الحفل */}
              <th className="py-3 px-2 w-24 text-center">
                <span className="block leading-tight">تم الحفل</span>
                <span className="text-[10px] text-slate-500 font-normal">خطوة 5</span>
              </th>

              {/* ملاحظات / تنبيهات */}
              <th className="py-3 px-3 min-w-[160px]">الملاحظات</th>

              {/* إجراءات */}
              <th className="py-3 px-3 w-28 text-center">إجراءات</th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => {
              const isUncertain = !!row.uncertain;
              const isStruck = !!row.struck_out;

              // Row background style: yellow/amber if uncertain, grayish if struck out
              let rowBg = 'hover:bg-slate-50/70 transition-colors';
              if (isUncertain) {
                rowBg = 'bg-amber-50/80 hover:bg-amber-100/70 border-l-4 border-l-amber-500';
              } else if (isStruck) {
                rowBg = 'bg-slate-100/80 hover:bg-slate-200/60 opacity-60';
              }

              return (
                <tr key={row.id} className={`${rowBg} transition-all group`}>
                  {/* 1. م (رقم تسلسلي) */}
                  <td className="py-2.5 px-2 text-center align-middle">
                    <input
                      type="text"
                      value={row.number}
                      onChange={(e) => onUpdateRow(row.id, { number: e.target.value })}
                      className="w-10 text-center font-mono font-bold text-xs bg-transparent border border-transparent hover:border-slate-300 focus:border-[#005c55] focus:bg-white rounded px-1 py-1 outline-none transition-all"
                    />
                  </td>

                  {/* 2. اسم الشيخ */}
                  <td className="py-2.5 px-3 align-middle">
                    <div className="relative">
                      <input
                        type="text"
                        value={row.sheikh_name}
                        onChange={(e) => onUpdateRow(row.id, { sheikh_name: e.target.value })}
                        className={`w-full font-bold text-xs bg-transparent border border-transparent hover:border-slate-300 focus:border-[#005c55] focus:bg-white rounded-lg px-2.5 py-1.5 outline-none transition-all ${
                          isStruck ? 'line-through text-slate-500' : 'text-slate-900'
                        }`}
                        placeholder="اسم الشيخ..."
                      />
                    </div>
                  </td>

                  {/* 3. المكان */}
                  <td className="py-2.5 px-3 align-middle">
                    <input
                      type="text"
                      value={row.place}
                      onChange={(e) => onUpdateRow(row.id, { place: e.target.value })}
                      className={`w-full text-xs bg-transparent border border-transparent hover:border-slate-300 focus:border-[#005c55] focus:bg-white rounded-lg px-2.5 py-1.5 outline-none transition-all ${
                        isStruck ? 'line-through text-slate-400' : 'text-slate-700'
                      }`}
                      placeholder="المكان أو القاعة..."
                    />
                  </td>

                  {/* 4. الكتاب */}
                  <td className="py-2.5 px-3 align-middle">
                    <input
                      type="text"
                      value={row.book}
                      onChange={(e) => onUpdateRow(row.id, { book: e.target.value })}
                      className={`w-full font-semibold text-xs bg-transparent border border-transparent hover:border-slate-300 focus:border-[#005c55] focus:bg-white rounded-lg px-2.5 py-1.5 outline-none transition-all ${
                        isStruck ? 'line-through text-slate-400' : 'text-[#005c55]'
                      }`}
                      placeholder="الكتاب المقرر..."
                    />
                  </td>

                  {/* 5. التسليم للمقر */}
                  <td className="py-2.5 px-2 text-center align-middle">
                    <label className="inline-flex items-center justify-center p-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.delivered}
                        onChange={(e) => onUpdateRow(row.id, { delivered: e.target.checked })}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                        title={row.delivered ? 'تم التسليم للمقر (✓)' : 'لم يتم التسليم بعد'}
                      />
                    </label>
                  </td>

                  {/* 6. تم التصحيح */}
                  <td className="py-2.5 px-2 text-center align-middle">
                    <label className="inline-flex items-center justify-center p-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.corrected}
                        onChange={(e) => onUpdateRow(row.id, { corrected: e.target.checked })}
                        className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 accent-teal-600 cursor-pointer"
                        title={row.corrected ? 'تم التصحيح (✓)' : 'لم يتم التصحيح بعد'}
                      />
                    </label>
                  </td>

                  {/* 7. تم المراجعة */}
                  <td className="py-2.5 px-2 text-center align-middle">
                    <label className="inline-flex items-center justify-center p-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.reviewed}
                        onChange={(e) => onUpdateRow(row.id, { reviewed: e.target.checked })}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                        title={row.reviewed ? 'تمت المراجعة والتدقيق (✓)' : 'لم تتم المراجعة بعد'}
                      />
                    </label>
                  </td>

                  {/* 8. تم الإعلان */}
                  <td className="py-2.5 px-2 text-center align-middle">
                    <label className="inline-flex items-center justify-center p-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.announced}
                        onChange={(e) => onUpdateRow(row.id, { announced: e.target.checked })}
                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 accent-purple-600 cursor-pointer"
                        title={row.announced ? 'تم إعلان النتائج (✓)' : 'لم يتم الإعلان بعد'}
                      />
                    </label>
                  </td>

                  {/* 9. تم الحفل */}
                  <td className="py-2.5 px-2 text-center align-middle">
                    <label className="inline-flex items-center justify-center p-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.ceremony}
                        onChange={(e) => onUpdateRow(row.id, { ceremony: e.target.checked })}
                        className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-600 cursor-pointer"
                        title={row.ceremony ? 'تم الحفل وتوزيع الجوائز (✓)' : 'لم يقام الحفل بعد'}
                      />
                    </label>
                  </td>

                  {/* ملاحظات */}
                  <td className="py-2.5 px-3 align-middle">
                    <div className="flex items-center gap-1.5">
                      {isUncertain && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-300 shrink-0 cursor-help"
                          title="هذا الصف تم تمييزه من الذكاء الاصطناعي بأن فيه كلمات بحاجة لتدقيق ومراجعة"
                        >
                          ⚠️ تدقيق
                        </span>
                      )}
                      {isStruck && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-300 text-slate-800 shrink-0"
                          title="هذا الصف مشطوب بالورقة الأصلية"
                        >
                          مشطوب
                        </span>
                      )}
                      <input
                        type="text"
                        value={row.notes || ''}
                        onChange={(e) => onUpdateRow(row.id, { notes: e.target.value })}
                        className="w-full text-[11px] bg-transparent border border-transparent hover:border-slate-300 focus:border-[#005c55] focus:bg-white rounded px-2 py-1 outline-none transition-all placeholder:text-slate-400"
                        placeholder="إضافة ملاحظة..."
                      />
                    </div>
                  </td>

                  {/* إجراءات الصف */}
                  <td className="py-2.5 px-3 text-center align-middle">
                    <div className="flex items-center justify-center gap-1">
                      {/* Toggle Uncertain */}
                      <button
                        type="button"
                        onClick={() => onUpdateRow(row.id, { uncertain: !row.uncertain })}
                        className={`p-1 rounded-md transition-colors cursor-pointer ${
                          isUncertain
                            ? 'text-amber-600 bg-amber-100 hover:bg-amber-200'
                            : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                        }`}
                        title={isUncertain ? 'إلغاء وسم التدقيق (البيانات مؤكدة)' : 'وضع علامة يحتاج تدقيق'}
                      >
                        <span className="material-symbols-outlined text-base" aria-hidden="true">warning</span>
                      </button>

                      {/* Toggle Struck out */}
                      <button
                        type="button"
                        onClick={() => onUpdateRow(row.id, { struck_out: !row.struck_out })}
                        className={`p-1 rounded-md transition-colors cursor-pointer ${
                          isStruck
                            ? 'text-rose-600 bg-rose-100 hover:bg-rose-200'
                            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                        title={isStruck ? 'إلغاء الشطب وتفعيل الصف' : 'شطب هذا الصف'}
                      >
                        <span className="material-symbols-outlined text-base" aria-hidden="true">strikethrough_s</span>
                      </button>

                      {/* Duplicate Row */}
                      <button
                        type="button"
                        onClick={() => onDuplicateRow(row.id)}
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                        title="تكرار الصف"
                      >
                        <span className="material-symbols-outlined text-base" aria-hidden="true">content_copy</span>
                      </button>

                      {/* Delete Row */}
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`هل أنت متأكد من حذف صف الشيخ "${row.sheikh_name || 'بدون اسم'}"؟`)) {
                            onDeleteRow(row.id);
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                        title="حذف هذا الصف"
                      >
                        <span className="material-symbols-outlined text-base" aria-hidden="true">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer info bar */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-slate-500 text-[11px] flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sm text-[#005c55]" aria-hidden="true">check_circle</span>
          <span>كل خلية قابلة للتعديل الفوري، والحفظ تلقائي مستمر في المتصفح</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
            <span>أصفر: شك في الخط اليدوي للتدقيق</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block"></span>
            <span>رمادي: صف مشطوب</span>
          </span>
        </div>
      </div>
    </div>
  );
};
