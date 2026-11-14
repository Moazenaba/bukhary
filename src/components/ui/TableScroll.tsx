import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Wraps something wider than its space (a table) and says so: a fade on the edge that has more
 * behind it, and an arrow that scrolls that way. The scroll area is marked data-scroll, which the
 * layout check in tests/e2e treats as the one allowed kind of horizontal overflow.
 */
export function TableScroll({ children, className = '', label = 'جدول' }: { children: ReactNode; className?: string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 1) {
      setMore((m) => (m.left || m.right ? { left: false, right: false } : m));
      return;
    }
    const pos = Math.abs(el.scrollLeft);
    const rtl = getComputedStyle(el).direction === 'rtl';
    // In RTL scrollLeft is 0 at the right edge and goes negative towards the left.
    const next = rtl ? { left: pos < max - 1, right: pos > 1 } : { left: pos > 1, right: pos < max - 1 };
    setMore((m) => (m.left === next.left && m.right === next.right ? m : next));
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [measure]);

  const scrollBy = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * Math.max(240, (ref.current?.clientWidth ?? 600) * 0.6), behavior: 'smooth' });

  const arrow = 'absolute top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white shadow-md border border-line/60 text-brand flex items-center justify-center cursor-pointer hover:bg-brand hover:text-white transition-colors';
  return (
    <div className={`relative ${className}`}>
      <div
        ref={ref}
        data-scroll=""
        role="region"
        aria-label={label}
        tabIndex={0}
        onScroll={measure}
        className="overflow-x-auto overscroll-x-contain focus-visible:outline-2 focus-visible:outline-brand"
      >
        {children}
      </div>
      {more.left && (
        <>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-black/10 to-transparent" />
          <button type="button" aria-label="المزيد جهة اليسار" onClick={() => scrollBy(-1)} className={`${arrow} left-1`}>
            <span className="material-symbols-outlined text-xl">chevron_left</span>
          </button>
        </>
      )}
      {more.right && (
        <>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-black/10 to-transparent" />
          <button type="button" aria-label="المزيد جهة اليمين" onClick={() => scrollBy(1)} className={`${arrow} right-1`}>
            <span className="material-symbols-outlined text-xl">chevron_right</span>
          </button>
        </>
      )}
    </div>
  );
}
