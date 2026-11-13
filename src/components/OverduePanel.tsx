import React from 'react';
import type { Committee } from '../types';
import type { OverdueItem } from '../utils/overdue';

/** «لجان متأخرة»: committees whose next step is late, most late first. */
export const OverduePanel: React.FC<{
  items: OverdueItem[];
  overdueDays: number;
  onOpen?: (committee: Committee) => void;
  onShowAll?: () => void;
  limit?: number;
}> = ({ items, overdueDays, onOpen, onShowAll, limit = 6 }) => {
  if (items.length === 0) {
    return (
      <section aria-label="لجان متأخرة" className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 text-xs text-emerald-900 font-bold">
        ✅ لا توجد لجان متأخرة (المهلة {overdueDays} أيام لكل مرحلة).
      </section>
    );
  }
  return (
    <section aria-label="لجان متأخرة" className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-black text-rose-900 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-base">alarm</span>
          لجان متأخرة ({items.length})
        </h2>
        {onShowAll && items.length > 0 && (
          <button type="button" onClick={onShowAll} className="text-xs font-bold text-rose-800 hover:underline cursor-pointer">
            عرض كل المتأخرة ←
          </button>
        )}
      </div>
      <ul className="space-y-1.5">
        {items.slice(0, limit).map((it) => (
          <li key={it.committee.id}>
            <button
              type="button"
              onClick={() => onOpen?.(it.committee)}
              className="w-full text-right flex items-start gap-2 p-2 rounded-xl bg-white border border-rose-100 hover:border-rose-300 cursor-pointer"
            >
              <span className="shrink-0 w-8 h-8 rounded-lg bg-rose-600 text-white font-black text-xs flex items-center justify-center">
                {it.committee.committeeNumber}
              </span>
              <span className="text-xs">
                <span className="block font-bold text-slate-900">
                  {it.committee.committeeName}
                  {it.committee.sheikhName ? ` — ${it.committee.sheikhName}` : ''}
                </span>
                <span className="block text-rose-800">{it.reason}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
