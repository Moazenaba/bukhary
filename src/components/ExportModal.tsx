import { csvCell } from '../utils/csv';
import React, { useState } from 'react';
import { Committee, STAGES_LIST } from '../types';
import { calculateCurrentStage, todayISO } from '../utils/stageUtils';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  committees: Committee[];
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  committees,
}) => {
  const [exportFormat, setExportFormat] = useState<'csv' | 'print'>('csv');
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  useEscapeKey(onClose);
  if (!isOpen) return null;


  const handleExportCSV = () => {
    const headers = [
      'رقم اللجنة',
      'اسم اللجنة',
      'التصنيف النسائي',
      'الشيخ المرسل إليه',
      'هاتف الشيخ',
      'مكان الشيخ',
      'عدد الطلاب',
      'الكتاب المقرر / مسار المسابقة',
      'الفرع',
      'اسم الجمعية',
      'أعضاء اللجنة',
      'الحالة الحالية',
      'تاريخ ووقت التسجيل',
      'تاريخ ووقت الامتحان',
      'تاريخ ووقت التصحيح',
      'تاريخ ووقت التجميع',
      'تاريخ ووقت المراجعة والتدقيق',
      'تاريخ ووقت كتابة الكشف',
      'تاريخ ووقت الاعتمادية',
      'تاريخ ووقت إعلان النتيجة',
      'تاريخ ووقت الحفل',
      'الملاحظات العامة',
    ];

    const rows = committees.map((c) => {
      const status = calculateCurrentStage(c.stages);
      return [
        `#${c.committeeNumber}`,
        c.committeeName,
        c.isWomenCommittee ? 'لجنة نسائية' : '-',
        c.sheikhName || '-',
        c.sheikhPhone || '-',
        c.sheikhCountry || '-',
        c.studentsCount || 0,
        c.competitionBook,
        c.branch,
        c.associationName || '-',
        c.members.join(' - '),
        status.label,
        c.stages.registration?.completedAt || '-',
        c.stages.exam?.completedAt || '-',
        c.stages.scoring?.completedAt || '-',
        c.stages.aggregation?.completedAt || '-',
        c.stages.review?.completedAt || '-',
        c.stages.sheet?.completedAt || '-',
        c.stages.accreditation?.completedAt || '-',
        c.stages.announcement?.completedAt || '-',
        c.stages.ceremony?.completedAt || '-',
        c.generalNotes || '-',
      ].map(csvCell);
    });

    const csvContent =
      '\uFEFF' + [headers.map(csvCell).join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `كشوفات_مسابقات_مسجد_البخاري_${todayISO()}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="تصدير الكشوف" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto text-right">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-line/50 max-h-[92vh] overflow-y-auto animate-in fade-in duration-150">
        {/* Header */}
        <div className="px-5 py-4 bg-canvas border-b border-line/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-brand">
            <span className="material-symbols-outlined text-2xl">file_download</span>
            <h3 className="font-bold text-base text-ink">
              تصدير كشوفات لجان مسابقات مسجد البخاري
            </h3>
          </div>
          <button
            aria-label="إغلاق"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-right">
          <p className="text-xs text-ink-soft leading-relaxed">
            تصدير كشف شامل لكافة لجان المسابقة ({committees.length} لجنة) بجميع مراحلها وملاحظاتها
            المسجلة لطباعتها أو فتحها في Google Sheets و Microsoft Excel.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              onClick={() => setExportFormat('csv')}
              className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                exportFormat === 'csv'
                  ? 'border-brand bg-tint'
                  : 'border-line/50 bg-white hover:bg-canvas'
              }`}
            >
              <div className="flex items-center gap-2 mb-1 text-brand font-bold text-sm">
                <span className="material-symbols-outlined">table_view</span>
                <span>تنزيل ملف CSV (إكسل وGoogle Sheets)</span>
              </div>
              <p className="text-xs text-muted">
                ملف نصي يدعم اللغة العربية مع كافة تواريخ إتمام المراحل والملاحظات.
              </p>
            </div>

            <div
              onClick={() => setExportFormat('print')}
              className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                exportFormat === 'print'
                  ? 'border-brand bg-tint'
                  : 'border-line/50 bg-white hover:bg-canvas'
              }`}
            >
              <div className="flex items-center gap-2 mb-1 text-brand font-bold text-sm">
                <span className="material-symbols-outlined">print</span>
                <span>طباعة الكشف الرسمي</span>
              </div>
              <p className="text-xs text-muted">
                تقرير ورقي مرتب جاهز للاعتماد والتوقيع من إدارة المسابقة.
              </p>
            </div>
          </div>

          {/* Quick Preview Table */}
          <div className="border border-line/40 rounded-xl overflow-hidden mt-4">
            <div className="bg-canvas px-4 py-2 text-xs font-bold text-ink border-b border-line/30">
              معاينة عيّنة من الكشف:
            </div>
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-gray-50 text-muted border-b border-gray-200">
                  <tr>
                    <th className="p-2">رقم اللجنة</th>
                    <th className="p-2">اسم اللجنة</th>
                    <th className="p-2">النوع</th>
                    <th className="p-2">الشيخ المرسل إليه</th>
                    <th className="p-2">الطلاب</th>
                    <th className="p-2">الكتاب المقرر</th>
                    <th className="p-2">الحالة الحالية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {committees.slice(0, 5).map((c) => {
                    const status = calculateCurrentStage(c.stages);
                    return (
                      <tr key={c.id}>
                        <td className="p-2 font-mono font-bold">#{c.committeeNumber}</td>
                        <td className="p-2 font-semibold">{c.committeeName}</td>
                        <td className="p-2">
                          {c.isWomenCommittee ? (
                            <span className="text-xs px-1.5 py-0.5 rounded font-bold bg-rose-100 text-rose-800">
                              🧕 نسائية
                            </span>
                          ) : (
                            <span className="text-gray-400 font-mono">-</span>
                          )}
                        </td>
                        <td className="p-2 text-xs text-brand font-semibold truncate max-w-[140px]">
                          {c.sheikhName || '-'}
                        </td>
                        <td className="p-2 font-mono font-bold">{c.studentsCount || 0}</td>
                        <td className="p-2 text-brand">{c.competitionBook}</td>
                        <td className="p-2 font-bold">{status.emoji} {status.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {downloadSuccess && (
            <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-base">check_circle</span>
              <span>تم تنزيل كشف مسابقات مسجد البخاري بنجاح.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-canvas border-t border-line/40 flex items-center justify-end gap-2">
          <button
            aria-label="إغلاق"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-ink-soft border border-line hover:bg-white"
          >
            إلغاء
          </button>

          {exportFormat === 'csv' ? (
            <button
              onClick={handleExportCSV}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-[#0f766e] hover:bg-brand shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              <span>تنزيل ملف CSV الآن</span>
            </button>
          ) : (
            <button
              onClick={handlePrint}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-[#0f766e] hover:bg-brand shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">print</span>
              <span>فتح نافذة الطباعة</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
