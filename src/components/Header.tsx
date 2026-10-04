import React from 'react';

interface HeaderProps {
  onOpenUpload: () => void;
  onOpenAddRow: () => void;
  onResetData: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenUpload,
  onOpenAddRow,
  onResetData,
}) => {
  return (
    <header className="bg-white border-b border-[#bdc9c6]/40 shadow-2xs sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4 flex-wrap">
        {/* Brand & Mosque Emblem */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#005c55] to-[#0f766e] text-white flex items-center justify-center shadow-xs">
            <span className="material-symbols-outlined text-2xl">auto_stories</span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold text-[#0d1c2e] tracking-tight">
                متابعة الدورة العلمية الصيفية
              </h1>
              <span className="text-[11px] font-bold text-[#005c55] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                مسجد الإمام البخاري 1448هـ / 2026م
              </span>
            </div>
            <p className="text-xs text-[#6e7977] mt-0.5 hidden sm:block">
              قراءة وتدقيق الجداول اليدوية بالذكاء الاصطناعي (Gemini 2.5 Flash) ورصد مراحل التسليم والتصحيح
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* AI Scan handwritten table */}
          <button
            type="button"
            onClick={onOpenUpload}
            className="px-3.5 py-2 bg-[#005c55] hover:bg-[#1b6b51] text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer transition-transform active:scale-95"
          >
            <span className="material-symbols-outlined text-base">document_scanner</span>
            <span className="hidden sm:inline">مسح جدول خط اليد</span>
            <span className="sm:hidden">مسح AI</span>
          </button>

          {/* Manual Add row */}
          <button
            type="button"
            onClick={onOpenAddRow}
            className="px-3 py-2 bg-white border border-[#bdc9c6] hover:bg-gray-50 text-[#0d1c2e] rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-base text-[#005c55]">add</span>
            <span className="hidden sm:inline">صف جديد</span>
          </button>

          {/* Reset / Sample options */}
          <button
            type="button"
            onClick={() => {
              if (confirm('هل تريد إعادة تحميل البيانات الافتراضية النموذجية للدورة؟')) {
                onResetData();
              }
            }}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl"
            title="استعادة البيانات النموذجية"
          >
            <span className="material-symbols-outlined text-base">restart_alt</span>
          </button>
        </div>
      </div>
    </header>
  );
};
