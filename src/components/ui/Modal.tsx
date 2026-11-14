import { useEffect, useId, type ReactNode } from 'react';

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' } as const;

/**
 * The one dialog shell: never taller than the window (the body scrolls, the title and footer stay
 * put), closes with Esc and with the backdrop, and is announced as a dialog.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZES;
  closeOnBackdrop?: boolean;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-3 sm:p-6 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={`w-full ${SIZES[size]} max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl`}>
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line/60 shrink-0">
          <h2 id={titleId} className="text-base sm:text-lg font-black text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="p-1.5 rounded-lg text-muted hover:bg-slate-100 cursor-pointer">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-line/60 shrink-0 flex flex-wrap items-center justify-end gap-2">{footer}</footer>}
      </div>
    </div>
  );
}
