import React, { useEffect, useState } from 'react';
import { errorMessage } from '../services/api';
import { type Availability, StaffApi, today } from '../services/staffApi';
import { AuthService } from '../services/AuthService';

// «المتاحون»: pick a day and see who is free, who has no job at all, and who is busy (and with what), so nobody is
// put in two places at once by mistake. Admins and the exams manager (docs/PLAN_ROLES_AND_FLOW.md 1.5).

type Tab = 'available' | 'unassigned' | 'busy';
const TABS: { id: Tab; label: string }[] = [
  { id: 'available', label: 'متاحون في هذا اليوم' },
  { id: 'unassigned', label: 'بدون أي مهام' },
  { id: 'busy', label: 'مشغولون' },
];

export const AvailabilityView: React.FC = () => {
  const [date, setDate] = useState(today());
  const [data, setData] = useState<Availability | null>(null);
  const [tab, setTab] = useState<Tab>('available');
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setData(null);
    StaffApi.availability(date)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [date]);

  const list = data ? (tab === 'busy' ? data.busy : data[tab]) : [];
  const shown = list.filter((p) => !search.trim() || p.name.includes(search.trim()));

  return (
    <div className="space-y-4 text-right" data-testid="availability-view">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="font-bold text-lg text-ink flex items-center gap-2 ml-auto">
          <span className="material-symbols-outlined text-brand">event_available</span>
          المتاحون والمشغولون
        </h2>
        <label className="text-xs text-ink-soft">
          اليوم
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="block mt-1 px-3 py-2 rounded-xl border border-line bg-white text-xs" />
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم"
          aria-label="بحث بالاسم"
          className="px-3 py-2 rounded-xl border border-line bg-white text-xs"
        />
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-full border text-xs font-bold cursor-pointer ${
              tab === t.id ? 'bg-brand text-white border-brand' : 'bg-white border-line text-ink-soft'
            }`}
          >
            {t.label}
            {data ? ` (${(t.id === 'busy' ? data.busy : data[t.id]).length})` : ''}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-rose-700 font-semibold text-xs">{error}</p>}
      {!data && !error && <p className="text-muted text-xs">جارٍ التحميل…</p>}
      {data && (
        <ul className="bg-white rounded-2xl border border-line divide-y divide-line">
          {shown.length === 0 && <li className="p-4 text-muted text-xs">لا أحد</li>}
          {shown.map((p) => (
            <li key={p.id} className="p-3 text-xs flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-bold text-ink">{p.name}</span>
                <span className="text-muted mr-2">{AuthService.getRoleLabel(p.role as any)}</span>
                {p.phone && (
                  <a href={`tel:${p.phone}`} className="text-brand mr-2" dir="ltr">
                    {p.phone}
                  </a>
                )}
              </span>
              {'items' in p && (
                <span className="flex flex-wrap gap-1.5">
                  {(p as any).items.map((i: any, k: number) => (
                    <span key={k} className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900">
                      {i.label}
                      {i.time ? ` · ${i.time}` : ''}
                    </span>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
