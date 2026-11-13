import React, { useState } from 'react';
import { STAGES_LIST } from '../types';
import { errorMessage } from '../services/api';
import { DataService, type CommitteeHistoryEntry } from '../services/DataService';

const FIELD: Record<string, string> = {
  committeeNumber: 'رقم اللجنة',
  committeeName: 'اسم اللجنة',
  associationName: 'الجمعية',
  members: 'أعضاء اللجنة',
  branch: 'الفرع',
  competitionBook: 'الكتاب المقرر',
  generalNotes: 'الملاحظات',
  courseId: 'الدورة',
  courseName: 'الدورة',
  sheikhName: 'اسم الشيخ',
  sheikhPhone: 'هاتف الشيخ',
  sheikhCountry: 'مكان الشيخ',
  studentsCount: 'عدد الطلاب',
  isWomenCommittee: 'لجنة نسائية',
  examDate: 'ميعاد الامتحان',
  scoringDetails: 'تفاصيل التصحيح',
  aggregationDetails: 'تجميع الدرجات',
  ceremonyDetails: 'تفاصيل الحفل',
  receivedByAssistant: 'استلام اللجنة',
  examApprovedBy: 'اعتماد جاهزية الامتحان',
  excelUrl: 'رابط الكشف',
};
const STAGE: Record<string, string> = Object.fromEntries(STAGES_LIST.map((s) => [s.key, s.label]));

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
  if (Array.isArray(v)) return v.length ? v.join('، ') : '—';
  if (typeof v === 'object') return '(تفاصيل)';
  return String(v);
};

function describe(c: CommitteeHistoryEntry['changes'][number]): string {
  if (c.field.startsWith('stages.')) {
    const stage = STAGE[c.field.slice(7)] ?? c.field.slice(7);
    return c.after ? `✓ تم ${stage}` : `↺ إلغاء «${stage}»`;
  }
  const name = FIELD[c.field] ?? c.field;
  if (typeof c.before === 'object' && c.before !== null && !Array.isArray(c.before)) return `تعديل ${name}`;
  if (typeof c.after === 'object' && c.after !== null && !Array.isArray(c.after)) return `تعديل ${name}`;
  return `${name}: ${show(c.before)} ← ${show(c.after)}`;
}

/** «سجل التعديلات»: who changed what in this committee, newest first. Loaded when opened. */
export const CommitteeHistory: React.FC<{ committeeId: string }> = ({ committeeId }) => {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<CommitteeHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && entries === null) {
      try {
        setEntries(await DataService.getCommitteeHistory(committeeId));
      } catch (err) {
        setError(errorMessage(err));
      }
    }
  };

  return (
    <section className="bg-canvas p-4 rounded-xl border border-line/40 space-y-2">
      <button type="button" onClick={toggle} aria-expanded={open} className="w-full flex items-center justify-between text-xs font-bold text-brand cursor-pointer">
        <span className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-base">history</span>
          سجل التعديلات (مين غيّر إيه وإمتى)
        </span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {error && <p className="text-xs text-rose-700">{error}</p>}
          {!error && entries === null && <p className="text-xs text-muted">جارٍ التحميل…</p>}
          {entries?.length === 0 && <p className="text-xs text-muted">لا توجد تعديلات مسجلة بعد.</p>}
          {entries?.map((e, i) => {
            const lines = e.changes.map(describe);
            return (
              <div key={i} className="bg-white rounded-lg border border-line/50 p-2.5 text-xs">
                <div className="flex justify-between gap-2 text-slate-500">
                  <span className="font-bold text-slate-800">{e.by || '—'}</span>
                  <span>{new Date(e.at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
                {lines.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-slate-700">
                    {lines.map((l, j) => (
                      <li key={j}>{l}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-slate-500">{e.action === 'committee.create' ? 'إنشاء اللجنة' : e.action}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
