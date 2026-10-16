import React, { useMemo, useState } from 'react';
import { Committee } from '../types';

interface CommitteePickerProps {
  committees: Committee[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Committees the current user may assign; others are shown disabled. */
  canSelect?: (c: Committee) => boolean;
  label?: string;
}

/**
 * Picks committees by id. Numbers repeat across courses, so every choice shows its course
 * (NEW-01); assignments are stored by id on the server.
 */
export const CommitteePicker: React.FC<CommitteePickerProps> = ({ committees, selectedIds, onChange, canSelect = () => true, label }) => {
  const [filter, setFilter] = useState('');
  const groups = useMemo(() => {
    const q = filter.trim();
    const byCourse = new Map<string, Committee[]>();
    for (const c of committees) {
      if (q && !String(c.committeeNumber).includes(q) && !c.committeeName.includes(q)) continue;
      const key = c.courseName || 'بدون دورة';
      byCourse.set(key, [...(byCourse.get(key) ?? []), c]);
    }
    return [...byCourse.entries()].map(([course, list]) => [course, list.sort((a, b) => a.committeeNumber - b.committeeNumber)] as const);
  }, [committees, filter]);

  const toggle = (id: string) => onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  return (
    <fieldset className="space-y-2">
      {label && <legend className="block font-bold text-slate-700 mb-1">{label}</legend>}
      {committees.length > 8 && (
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="بحث برقم اللجنة أو اسمها"
          aria-label="بحث في اللجان"
          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs outline-none focus:border-brand"
        />
      )}
      <div className="max-h-48 overflow-y-auto space-y-2">
        {groups.length === 0 && <p className="text-xs text-slate-400">لا توجد لجان</p>}
        {groups.map(([course, list]) => (
          <div key={course}>
            <div className="text-xs font-bold text-slate-500 mb-1">{course}</div>
            <div className="flex flex-wrap gap-1.5">
              {list.map((c) => {
                const selected = selectedIds.includes(c.id);
                const allowed = canSelect(c);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={!allowed}
                    onClick={() => toggle(c.id)}
                    title={c.committeeName}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      selected ? 'bg-brand text-white border-brand' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    } ${allowed ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
                  >
                    لجنة #{c.committeeNumber}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
};
