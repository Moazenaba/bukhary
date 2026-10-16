import React from 'react';

interface NavbarProps {
  lastSavedAt: string | null;
  totalRows: number;
}

export const Navbar: React.FC<NavbarProps> = ({ lastSavedAt, totalRows }) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs backdrop-blur-md bg-white/95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Brand & Mosque Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#004d47] to-[#007a70] text-white flex items-center justify-center shrink-0 shadow-sm border border-emerald-600/30">
            <span className="material-symbols-outlined text-2xl text-emerald-200" aria-hidden="true">mosque</span>
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                متابعة الدورة العلمية الصيفية
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-[#005c55] border border-emerald-200 font-mono">
                1448هـ / 2026م
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>مسجد الإمام البخاري</span>
              <span>•</span>
              <span className="text-[#005c55] font-semibold">تحويل الكشوف المكتوبة بخط اليد إلى جداول رقمية</span>
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-2.5 self-end md:self-auto text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>حفظ تلقائي محلي (localStorage)</span>
            {lastSavedAt && (
              <span className="text-[10px] text-slate-400 font-mono">({lastSavedAt})</span>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[#005c55] font-bold">
            <span className="material-symbols-outlined text-base" aria-hidden="true">psychology</span>
            <span>Gemini Vision 2.5 Flash</span>
          </div>
        </div>
      </div>
    </header>
  );
};
