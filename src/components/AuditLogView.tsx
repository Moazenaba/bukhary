import React, { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { DATA_ROOT_KEY } from '../data/queries';
import { AuditLogEntry, DataService } from '../services/DataService';
import { errorMessage } from '../services/api';
import { TableScroll } from './ui/TableScroll';

const PAGE = 100;

const ENTITIES: Array<{ value: string; label: string }> = [
  { value: '', label: 'الكل' },
  { value: 'auth', label: 'الدخول والجلسات' },
  { value: 'user', label: 'المستخدمون' },
  { value: 'committee', label: 'اللجان' },
  { value: 'exam', label: 'الامتحانات' },
  { value: 'task', label: 'المهام' },
  { value: 'course', label: 'الدورات' },
  { value: 'summer_course_row', label: 'كشف الدورة' },
  { value: 'permission_profile', label: 'بروفايلات الصلاحيات' },
];

function when(iso: string) {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : new Date(ms).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'medium' });
}

/** Read-only audit trail for super admins and auditors (WEB-12): who did what, when. */
export const AuditLogView: React.FC = () => {
  const [entity, setEntity] = useState('');
  const [impersonatedOnly, setImpersonatedOnly] = useState(false);
  const query = useInfiniteQuery({
    queryKey: [...DATA_ROOT_KEY, 'audit-logs', entity, impersonatedOnly],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      DataService.getAuditLogs({ limit: PAGE, before: pageParam, entity: entity || undefined, impersonatedOnly: impersonatedOnly || undefined }),
    getNextPageParam: (last: AuditLogEntry[]) => (last.length === PAGE ? last[last.length - 1].timestamp : undefined),
  });
  const rows = query.data?.pages.flat() ?? [];

  return (
    <section className="space-y-4" aria-labelledby="audit-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="audit-title" className="text-lg font-bold text-ink">سجل التدقيق</h1>
          <p className="text-xs text-muted">كل تعديل يُسجَّل مع اسم من قام به ووقته، في نفس عملية الحفظ.</p>
        </div>
        <label className="text-xs text-ink-soft">
          النوع
          <select value={entity} onChange={(e) => setEntity(e.target.value)} className="block mt-1 bg-white border border-line rounded-xl px-3 py-2 text-xs">
            {ENTITIES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-soft flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={impersonatedOnly} onChange={(e) => setImpersonatedOnly(e.target.checked)} />
          عمليات «الدخول بعين المستخدم» فقط
        </label>
      </div>

      {query.isLoading && <p role="status" className="text-sm text-muted">جارٍ التحميل…</p>}
      {query.error && (
        <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl p-3">{errorMessage(query.error)}</p>
      )}

      {!query.isLoading && rows.length === 0 && !query.error && (
        <p className="text-sm text-muted bg-white rounded-xl border border-line/40 p-6 text-center">لا توجد سجلات</p>
      )}

      {rows.length > 0 && (
        <TableScroll label="سجل التدقيق" className="bg-white rounded-2xl border border-line/40">
          <table className="w-full text-xs">
            <thead className="bg-canvas text-ink-soft">
              <tr>
                <th scope="col" className="p-2.5 text-right font-bold">الوقت</th>
                <th scope="col" className="p-2.5 text-right font-bold">المستخدم</th>
                <th scope="col" className="p-2.5 text-right font-bold">الإجراء</th>
                <th scope="col" className="p-2.5 text-right font-bold">العنصر</th>
                <th scope="col" className="p-2.5 text-right font-bold">تفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line/30">
                  <td className="p-2.5 whitespace-nowrap font-mono">{when(r.timestamp)}</td>
                  <td className="p-2.5">
                    {r.user}
                    <span className="text-muted"> ({r.role})</span>
                    {r.impersonatedBy && <span className="block text-amber-800 font-semibold">بواسطة {r.impersonatedBy}</span>}
                  </td>
                  <td className="p-2.5 font-mono" dir="ltr">{r.action}</td>
                  <td className="p-2.5 font-mono text-muted" dir="ltr">{r.entity ? `${r.entity}:${r.entityId ?? ''}` : '—'}</td>
                  <td className="p-2.5 text-ink-soft break-words min-w-[14rem]">{r.details || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

      {query.hasNextPage && (
        <button
          type="button"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className="px-4 py-2 rounded-xl border border-line text-xs font-bold text-ink hover:bg-white cursor-pointer disabled:opacity-60"
        >
          {query.isFetchingNextPage ? 'جارٍ التحميل…' : 'عرض الأقدم'}
        </button>
      )}
    </section>
  );
};
