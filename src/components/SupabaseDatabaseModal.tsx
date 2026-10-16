import React, { useEffect, useState } from 'react';
import { DataService, DatabaseStatus } from '../services/DataService';
import { errorMessage } from '../services/api';

interface SupabaseDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshData?: () => void;
}

/**
 * Super-admin view of the database: values measured by the server, nothing assumed.
 * Schema changes are applied by `npm run migrate` during deployment, never from the browser.
 */
export const SupabaseDatabaseModal: React.FC<SupabaseDatabaseModalProps> = ({ isOpen, onClose, onRefreshData }) => {
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await DataService.getDatabaseStatus());
    } catch (err) {
      setStatus(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen]);

  if (!isOpen) return null;

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border text-xs">
      <span className="text-slate-600">{label}</span>
      <span className="font-bold text-slate-900 font-mono text-left">{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-right" role="dialog" aria-modal="true" aria-labelledby="db-title">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 id="db-title" className="font-bold text-sm text-slate-900">حالة قاعدة البيانات</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer">
            ✕
          </button>
        </div>

        {loading && <p role="status" className="text-xs text-slate-600">جارٍ الفحص...</p>}
        {error && (
          <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
            تعذر الحصول على حالة قاعدة البيانات: {error}
          </div>
        )}

        {status && (
          <div className="space-y-2">
            {row('قاعدة البيانات', status.database)}
            {row('الإصدار', status.postgresVersion)}
            {row('زمن الاستجابة', `${status.latencyMs} ms`)}
            {row('تشفير الاتصال', status.tls === 'none' ? 'غير مشفر' : status.tls)}
            {row('الترحيلات (migrations)', status.migrations.pending.length ? `معلّقة: ${status.migrations.pending.join('، ')}` : `محدثة (${status.migrations.total})`)}
            {row('مدة تشغيل الخادم', `${Math.round(status.uptimeSeconds / 60)} دقيقة`)}
            <div className="pt-2">
              <h4 className="font-bold text-xs text-slate-800 mb-2">الجداول ({status.tablesCount}) — عدد الصفوف تقديري</h4>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                {status.tables.map((t) => (
                  <div key={t.name} className="flex justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 border">
                    <span className="font-mono">{t.name}</span>
                    <span className="font-bold">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="pt-2 flex justify-end gap-2">
          <button type="button" onClick={load} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs cursor-pointer">
            إعادة الفحص
          </button>
          {onRefreshData && (
            <button type="button" onClick={onRefreshData} className="px-4 py-2 rounded-xl bg-[#005c55] text-white font-bold text-xs cursor-pointer">
              إعادة تحميل بيانات التطبيق
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
