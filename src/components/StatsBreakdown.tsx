import React from 'react';
import type { Committee, Course } from '../types';
import { compareCourses, groupBy, type GroupRow } from '../utils/statsBreakdown';

function Table({ title, rows, nameLabel, highlight }: { title: string; rows: GroupRow[]; nameLabel: string; highlight?: (r: any) => boolean }) {
  return (
    <section className="bg-white rounded-2xl border border-line/50 shadow-xs p-4 space-y-2">
      <h3 className="text-sm font-black text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">لا توجد بيانات بعد.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead>
              <tr className="text-slate-500 border-b border-line/60">
                <th className="py-1.5 font-bold">{nameLabel}</th>
                <th className="py-1.5 font-bold">اللجان</th>
                <th className="py-1.5 font-bold">الطلاب</th>
                <th className="py-1.5 font-bold">تم الحفل</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className={`border-b border-line/30 ${highlight?.(r) ? 'bg-emerald-50 font-bold' : ''}`}>
                  <td className="py-1.5">{r.name}</td>
                  <td className="py-1.5 font-mono">{r.committees}</td>
                  <td className="py-1.5 font-mono">{r.students}</td>
                  <td className="py-1.5">
                    <span className="font-mono">{r.ceremonies}</span>
                    <span className="text-slate-500"> ({r.ceremonyRate}%)</span>
                    <span className="block h-1.5 mt-1 rounded-full bg-slate-100 overflow-hidden" aria-hidden>
                      <span className="block h-full bg-emerald-500" style={{ width: `${r.ceremonyRate}%` }} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Per book, per sheikh, and the courses side by side. */
export const StatsBreakdown: React.FC<{ committees: Committee[]; allCommittees?: Committee[]; courses?: Course[]; currentCourseId?: string }> = ({
  committees,
  allCommittees,
  courses,
  currentCourseId,
}) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <Table title="حسب الكتاب المقرر" nameLabel="الكتاب" rows={groupBy(committees, (c) => c.competitionBook)} />
    <Table title="حسب الشيخ" nameLabel="الشيخ" rows={groupBy(committees, (c) => c.sheikhName)} />
    {allCommittees && courses && courses.length > 1 && (
      <div className="lg:col-span-2">
        <Table
          title="مقارنة الدورات"
          nameLabel="الدورة"
          rows={compareCourses(allCommittees, courses, currentCourseId)}
          highlight={(r) => r.current}
        />
      </div>
    )}
  </div>
);
