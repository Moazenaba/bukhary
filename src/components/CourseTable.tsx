import React, { useState } from 'react';
import { CourseTableRow } from '../types/tableTypes';

interface CourseTableProps {
  rows: CourseTableRow[];
  onUpdateRow: (updatedRow: CourseTableRow) => void;
  onDeleteRow: (id: string) => void;
  onToggleStruck: (id: string) => void;
  onResolveUncertain: (id: string) => void;
}

export const CourseTable: React.FC<CourseTableProps> = ({
  rows,
  onUpdateRow,
  onDeleteRow,
  onToggleStruck,
  onResolveUncertain,
}) => {
  const [editingNotesRowId, setEditingNotesRowId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#bdc9c6]/40 p-12 text-center text-[#6e7977] space-y-3 shadow-xs">
        <span className="material-symbols-outlined text-5xl text-gray-300">search_off</span>
        <h4 className="text-sm font-bold text-[#0d1c2e]">لا توجد صفوف تطابق معايير البحث أو التصفية</h4>
        <p className="text-xs max-w-sm mx-auto">
          جرب تغيير الفلتر أو إضافة صف جديد أو رفع صورة جدول مكتوب باليد ليقوم الذكاء الاصطناعي بقراءته.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#bdc9c6]/50 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs border-collapse">
          {/* Table Headers */}
          <thead className="bg-[#f0f4f9] text-[#0d1c2e] border-b border-[#bdc9c6]/60 select-none">
            <tr>
              <th className="p-3 w-12 text-center font-bold text-[#6e7977]">م</th>
              <th className="p-3 min-w-[180px] font-bold">اسم الشيخ</th>
              <th className="p-3 min-w-[170px] font-bold">المكان</th>
              <th className="p-3 min-w-[170px] font-bold">الكتاب المقرر</th>

              {/* 5-Stage Checkbox Headers */}
              <th className="p-2.5 w-24 text-center font-bold bg-blue-50/70 text-blue-900 border-x border-blue-100">
                <div className="flex flex-col items-center">
                  <span>التسليم للمقر</span>
                  <span className="text-[10px] text-blue-700 font-normal">استلام الأوراق</span>
                </div>
              </th>

              <th className="p-2.5 w-24 text-center font-bold bg-amber-50/70 text-amber-900 border-l border-amber-100">
                <div className="flex flex-col items-center">
                  <span>تم التصحيح</span>
                  <span className="text-[10px] text-amber-700 font-normal">رصد الدرجات</span>
                </div>
              </th>

              <th className="p-2.5 w-24 text-center font-bold bg-purple-50/70 text-purple-900 border-l border-purple-100">
                <div className="flex flex-col items-center">
                  <span>تم المراجعة</span>
                  <span className="text-[10px] text-purple-700 font-normal">تدقيق الدرجات</span>
                </div>
              </th>

              <th className="p-2.5 w-24 text-center font-bold bg-indigo-50/70 text-indigo-900 border-l border-indigo-100">
                <div className="flex flex-col items-center">
                  <span>تم الإعلان</span>
                  <span className="text-[10px] text-indigo-700 font-normal">نشر النتيجة</span>
                </div>
              </th>

              <th className="p-2.5 w-24 text-center font-bold bg-emerald-50/70 text-emerald-950 border-l border-emerald-100">
                <div className="flex flex-col items-center">
                  <span>تم الحفل</span>
                  <span className="text-[10px] text-emerald-700 font-normal">التكريم والجوائز</span>
                </div>
              </th>

              <th className="p-3 w-28 text-center font-bold">الحالة والإجراءات</th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-[#bdc9c6]/20">
            {rows.map((row) => {
              const isUncertain = !!row.uncertain;
              const isStruck = !!row.struck_out;
              const isAllCompleted =
                row.delivered && row.corrected && row.reviewed && row.announced && row.ceremony;

              return (
                <tr
                  key={row.id}
                  className={`transition-colors group ${
                    isUncertain
                      ? 'bg-amber-50/80 hover:bg-amber-100/70'
                      : isStruck
                      ? 'bg-gray-100/80 text-gray-400'
                      : isAllCompleted
                      ? 'bg-emerald-50/30 hover:bg-emerald-50/60'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  {/* 1) م (رقم تسلسلي) */}
                  <td className="p-3 text-center font-mono font-bold text-gray-500">
                    <input
                      type="number"
                      value={row.number}
                      onChange={(e) =>
                        onUpdateRow({ ...row, number: parseInt(e.target.value) || row.number })
                      }
                      className="w-10 text-center font-mono font-bold bg-transparent outline-none border-b border-transparent focus:border-[#005c55]"
                    />
                  </td>

                  {/* 2) اسم الشيخ (قابل للتعديل المباشر) */}
                  <td className="p-2.5">
                    <div className="relative">
                      <input
                        type="text"
                        value={row.sheikh_name}
                        onChange={(e) => onUpdateRow({ ...row, sheikh_name: e.target.value })}
                        className={`w-full px-2 py-1.5 rounded-lg bg-transparent font-bold outline-none border border-transparent hover:border-gray-300 focus:border-[#005c55] focus:bg-white ${
                          isStruck ? 'line-through text-gray-400' : 'text-[#0d1c2e]'
                        }`}
                      />
                      {isUncertain && (
                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-amber-800 font-bold px-1.5 py-0.2 rounded bg-amber-200/70 w-fit">
                          <span className="material-symbols-outlined text-xs">help</span>
                          <span>مراجعة القراءة</span>
                          <button
                            type="button"
                            onClick={() => onResolveUncertain(row.id)}
                            className="mr-1 text-[9px] underline text-amber-900 hover:text-black cursor-pointer"
                            title="تأكيد القراءة واعتمادها"
                          >
                            تأكيد ✓
                          </button>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* 3) المكان (قابل للتعديل المباشر) */}
                  <td className="p-2.5">
                    <input
                      type="text"
                      value={row.place}
                      onChange={(e) => onUpdateRow({ ...row, place: e.target.value })}
                      className={`w-full px-2 py-1.5 rounded-lg bg-transparent outline-none border border-transparent hover:border-gray-300 focus:border-[#005c55] focus:bg-white text-gray-700 ${
                        isStruck ? 'line-through text-gray-400' : ''
                      }`}
                    />
                  </td>

                  {/* 4) الكتاب المقرر (قابل للتعديل المباشر) */}
                  <td className="p-2.5">
                    <input
                      type="text"
                      value={row.book}
                      onChange={(e) => onUpdateRow({ ...row, book: e.target.value })}
                      className={`w-full px-2 py-1.5 rounded-lg bg-transparent outline-none border border-transparent hover:border-gray-300 focus:border-[#005c55] focus:bg-white font-semibold text-[#005c55] ${
                        isStruck ? 'line-through text-gray-400' : ''
                      }`}
                    />
                  </td>

                  {/* 5) التسليم للمقر (Checkbox) */}
                  <td className="p-2.5 text-center bg-blue-50/30 border-x border-blue-50">
                    <label className="inline-flex items-center justify-center p-1.5 rounded-lg hover:bg-blue-100/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.delivered}
                        onChange={(e) => onUpdateRow({ ...row, delivered: e.target.checked })}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                      />
                    </label>
                  </td>

                  {/* 6) تم التصحيح (Checkbox) */}
                  <td className="p-2.5 text-center bg-amber-50/30 border-l border-amber-50">
                    <label className="inline-flex items-center justify-center p-1.5 rounded-lg hover:bg-amber-100/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.corrected}
                        onChange={(e) => onUpdateRow({ ...row, corrected: e.target.checked })}
                        className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-600 cursor-pointer"
                      />
                    </label>
                  </td>

                  {/* 7) تم المراجعة (Checkbox) */}
                  <td className="p-2.5 text-center bg-purple-50/30 border-l border-purple-50">
                    <label className="inline-flex items-center justify-center p-1.5 rounded-lg hover:bg-purple-100/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.reviewed}
                        onChange={(e) => onUpdateRow({ ...row, reviewed: e.target.checked })}
                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 accent-purple-600 cursor-pointer"
                      />
                    </label>
                  </td>

                  {/* 8) تم الإعلان (Checkbox) */}
                  <td className="p-2.5 text-center bg-indigo-50/30 border-l border-indigo-50">
                    <label className="inline-flex items-center justify-center p-1.5 rounded-lg hover:bg-indigo-100/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.announced}
                        onChange={(e) => onUpdateRow({ ...row, announced: e.target.checked })}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                      />
                    </label>
                  </td>

                  {/* 9) تم الحفل (Checkbox) */}
                  <td className="p-2.5 text-center bg-emerald-50/30 border-l border-emerald-50">
                    <label className="inline-flex items-center justify-center p-1.5 rounded-lg hover:bg-emerald-100/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.ceremony}
                        onChange={(e) => onUpdateRow({ ...row, ceremony: e.target.checked })}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                      />
                    </label>
                  </td>

                  {/* Actions & Status */}
                  <td className="p-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {/* Toggle Struck Out */}
                      <button
                        type="button"
                        onClick={() => onToggleStruck(row.id)}
                        className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          isStruck
                            ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                        }`}
                        title={isStruck ? 'إلغاء الشطب عن هذا الصف' : 'شطب هذا الصف'}
                      >
                        <span className="material-symbols-outlined text-base">strikethrough_s</span>
                      </button>

                      {/* Notes toggle */}
                      <button
                        type="button"
                        onClick={() =>
                          setEditingNotesRowId(editingNotesRowId === row.id ? null : row.id)
                        }
                        className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          row.notes
                            ? 'text-[#005c55] bg-emerald-50 hover:bg-emerald-100'
                            : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                        }`}
                        title={row.notes ? `ملاحظة: ${row.notes}` : 'إضافة ملاحظة'}
                      >
                        <span className="material-symbols-outlined text-base">chat_bubble</span>
                      </button>

                      {/* Delete Row */}
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`هل أنت متأكد من حذف صف الشيخ "${row.sheikh_name}"؟`)) {
                            onDeleteRow(row.id);
                          }
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                        title="حذف هذا الصف"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    </div>

                    {/* Inline notes popup editor */}
                    {editingNotesRowId === row.id && (
                      <div className="absolute left-6 mt-1 z-30 bg-white border border-[#bdc9c6] shadow-xl p-3 rounded-xl w-64 text-right">
                        <label className="block text-[11px] font-bold text-[#0d1c2e] mb-1">
                          ملاحظات الصف:
                        </label>
                        <textarea
                          rows={2}
                          value={row.notes || ''}
                          onChange={(e) => onUpdateRow({ ...row, notes: e.target.value })}
                          placeholder="اكتب ملاحظة..."
                          className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-lg p-2 text-xs outline-none focus:border-[#005c55]"
                        />
                        <div className="flex justify-end mt-1">
                          <button
                            type="button"
                            onClick={() => setEditingNotesRowId(null)}
                            className="px-2.5 py-1 bg-[#005c55] text-white rounded text-[10px] font-bold"
                          >
                            تم
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Table Footer info */}
      <div className="px-4 py-2.5 bg-[#f8f9ff] border-t border-[#bdc9c6]/40 flex items-center justify-between text-[11px] text-[#6e7977] flex-wrap gap-2">
        <span>
          عرض <strong>{rows.length}</strong> صفاً (يتم الحفظ تلقائياً في المتصفح LocalStorage)
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            <span>أصفر: غير مؤكد بحاجة لمراجعة</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span>أخضر: تم إنجاز كافة المراحل الخمسة</span>
          </span>
        </div>
      </div>
    </div>
  );
};
