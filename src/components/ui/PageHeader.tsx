import React from 'react';

/** The one header of every page: what this page is, one line of facts, and the page's main actions. */
export const PageHeader: React.FC<{
  icon: string;
  title: string;
  /** One short line (counts, the current course). Not a paragraph. */
  subtitle?: React.ReactNode;
  /** The page's main buttons. On a phone they sit under the title, full width, never off-screen. */
  actions?: React.ReactNode;
}> = ({ icon, title, subtitle, actions }) => (
  <header className="mb-3 sm:mb-4 flex flex-wrap items-center gap-x-3 gap-y-2.5">
    <span className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-brand text-white flex items-center justify-center shrink-0" aria-hidden="true">
      <span className="material-symbols-outlined text-xl sm:text-2xl">{icon}</span>
    </span>
    <div className="min-w-0 flex-1 basis-40">
      <h1 className="text-xl sm:text-2xl font-black text-ink leading-tight">{title}</h1>
      {subtitle && <p className="text-xs sm:text-sm text-muted font-semibold mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 max-sm:basis-full [&>*]:max-sm:flex-1 [&>*]:max-sm:min-w-[7.5rem]">{actions}</div>}
  </header>
);

export const primaryAction =
  'inline-flex items-center justify-center gap-1.5 min-h-10 sm:min-h-11 px-3.5 sm:px-4 rounded-xl bg-brand text-white text-sm font-black shadow-xs hover:opacity-90 active:scale-[0.98] transition cursor-pointer';
export const quietAction =
  'inline-flex items-center justify-center gap-1.5 min-h-10 sm:min-h-11 px-3.5 sm:px-4 rounded-xl border border-line bg-white text-ink text-sm font-bold hover:bg-tint active:scale-[0.98] transition cursor-pointer';
