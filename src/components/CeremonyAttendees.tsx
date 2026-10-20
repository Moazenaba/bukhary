import React, { useEffect, useMemo, useState } from 'react';
import { Committee, ScheduleTask } from '../types';
import { AssignableUser, DataService } from '../services/DataService';
import { AuthService } from '../services/AuthService';
import { errorMessage } from '../services/api';

/** Picks the accounts invited to a ceremony; each newly added person is notified by the server. */
export const AttendeePicker: React.FC<{ selectedIds: string[]; onChange: (ids: string[]) => void }> = ({ selectedIds, onChange }) => {
  const [people, setPeople] = useState<AssignableUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    DataService.getCeremonyCandidates()
      .then(setPeople)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const shown = (people ?? []).filter((p) => !query.trim() || p.name.includes(query.trim()));
  const toggle = (id: string) => onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  return (
    <div className="space-y-1.5">
      <label className="block text-slate-700 font-bold">
        المدعوون للحفل <span className="text-slate-400 font-normal">({selectedIds.length}) — يصل لكل من تضيفه إشعار بالموعد</span>
      </label>
      {error && <p role="alert" className="text-rose-700">{error}</p>}
      {people === null && !error && <p className="text-slate-500">جارٍ تحميل قائمة الأشخاص…</p>}
      {people !== null && (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث بالاسم…"
            aria-label="بحث عن شخص لإضافته للحفل"
            className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand"
          />
          <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
            {shown.length === 0 && <p className="p-3 text-slate-500">لا يوجد أشخاص مطابقون</p>}
            {shown.map((p) => (
              <label key={p.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggle(p.id)} />
                <span className="font-semibold text-slate-800">{p.name}</span>
                <span className="text-slate-400 text-xs">{AuthService.getRoleLabel(p.role as any)}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/** Ceremonies the signed-in user is invited to, with their details (web and app show the same). */
export const MyCeremonies: React.FC<{
  committees: Committee[];
  scheduleTasks: ScheduleTask[];
  onOpenCommitteeDetails?: (c: Committee) => void;
}> = ({ committees, scheduleTasks, onOpenCommitteeDetails }) => {
  const me = AuthService.getCurrentUser();
  const mine = useMemo(
    () =>
      committees
        .filter((c) => c.ceremonyDetails?.attendees?.some((a) => a.id === me?.id))
        .sort((a, b) => (a.ceremonyDetails?.ceremonyDate ?? '').localeCompare(b.ceremonyDetails?.ceremonyDate ?? '')),
    [committees, me?.id]
  );
  if (!me || mine.length === 0) return null;
  return (
    <section aria-labelledby="my-ceremonies" className="rounded-3xl border-2 border-amber-300 bg-amber-50/60 p-4 sm:p-5 space-y-3 text-right">
      <h2 id="my-ceremonies" className="text-base font-black text-amber-950">🎉 حفلاتي ({mine.length})</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {mine.map((c) => {
          const d = c.ceremonyDetails!;
          const task = scheduleTasks.find((t) => t.id === `task-ceremony-${c.id}`);
          const date = d.ceremonyDate || task?.date;
          return (
            <article key={c.id} className="rounded-2xl bg-white border border-amber-200 p-4 space-y-1.5 text-xs">
              <h3 className="text-sm font-black text-slate-900">حفل تكريم لجنة #{c.committeeNumber} — {c.committeeName}</h3>
              <p><span className="text-slate-500">الموعد: </span><strong>{date || 'لم يحدد بعد'}{d.ceremonyTime ? ` — ${d.ceremonyTime}` : ''}</strong></p>
              {d.ceremonyPlace && <p><span className="text-slate-500">المكان: </span><strong>📍 {d.ceremonyPlace}</strong></p>}
              <p><span className="text-slate-500">الكتاب: </span>{c.competitionBook} • <span className="text-slate-500">الشيخ: </span>{c.sheikhName || '—'}</p>
              {d.honoredStudentsCount ? <p><span className="text-slate-500">عدد المكرمين: </span>{d.honoredStudentsCount} طالب</p> : null}
              {d.attendees && d.attendees.length > 1 && (
                <p><span className="text-slate-500">معك في الحفل: </span>{d.attendees.filter((a) => a.id !== me.id).map((a) => a.name).join('، ')}</p>
              )}
              {d.notes && <p className="text-slate-600">📝 {d.notes}</p>}
              {c.stages.ceremony?.completed && <p className="text-emerald-700 font-bold">✓ تم الحفل</p>}
              {onOpenCommitteeDetails && (
                <button type="button" onClick={() => onOpenCommitteeDetails(c)} className="mt-1 text-brand font-bold underline cursor-pointer">
                  تفاصيل اللجنة ↗
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};
