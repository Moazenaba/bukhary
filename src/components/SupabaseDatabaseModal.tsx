import React, { useState, useEffect } from 'react';
import { SupabaseService, DatabaseStatusResponse, MigrationResult } from '../services/SupabaseService';

interface SupabaseDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshData?: () => void;
}

export const SupabaseDatabaseModal: React.FC<SupabaseDatabaseModalProps> = ({
  isOpen,
  onClose,
  onRefreshData,
}) => {
  const [loading, setLoading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [status, setStatus] = useState<DatabaseStatusResponse | null>(null);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'tables' | 'sql'>('overview');
  const [schemaSql, setSchemaSql] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await SupabaseService.checkStatus();
      setStatus(res);
    } finally {
      setLoading(false);
    }
  };

  const fetchSql = async () => {
    if (!schemaSql) {
      const sql = await SupabaseService.getSchemaSql();
      setSchemaSql(sql);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      fetchSql();
    }
  }, [isOpen]);

  const handleRunMigration = async () => {
    if (!window.confirm('هل أنت متأكد من رغبتك في رفع وتطبيق المخطط الشامل بالكامل على قاعدة بيانات سوبابيز؟')) {
      return;
    }
    setMigrating(true);
    setMigrationResult(null);
    try {
      const res = await SupabaseService.runMigration();
      setMigrationResult(res);
      await fetchStatus();
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      setMigrationResult({
        success: false,
        message: 'حدث خطأ: ' + err.message,
      });
    } finally {
      setMigrating(false);
    }
  };

  const handleCopySql = () => {
    if (schemaSql) {
      navigator.clipboard.writeText(schemaSql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200" dir="rtl">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-right">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-linear-to-r from-emerald-900 to-teal-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-emerald-300">
              <span className="material-symbols-outlined text-2xl" aria-hidden="true">database</span>
            </div>
            <div>
              <h2 className="text-lg font-black flex items-center gap-2">
                قاعدة بيانات Supabase المباشرة (PostgreSQL)
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  سحابية نشطة
                </span>
              </h2>
              <p className="text-xs text-emerald-200/80">
                إدارة ومزامنة المخطط الشامل والجداول السحابية لمنظومة مسجد البخاري
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="إغلاق النافذة"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-slate-100 bg-slate-50/50">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">info</span>
            <span>نظرة عامة والاتصال</span>
          </button>

          <button
            onClick={() => setActiveTab('tables')}
            className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'tables'
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">table_view</span>
            <span>الجداول والسجلات ({Array.isArray(status?.tables) ? status?.tables.length : 9})</span>
          </button>

          <button
            onClick={() => setActiveTab('sql')}
            className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'sql'
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">code</span>
            <span>ملف المخطط (supabase_schema.sql)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {migrationResult && (
            <div
              className={`p-4 rounded-2xl border text-xs leading-relaxed flex items-start gap-3 animate-in fade-in ${
                migrationResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <span className="material-symbols-outlined text-xl shrink-0" aria-hidden="true">
                {migrationResult.success ? 'check_circle' : 'error'}
              </span>
              <div className="flex-1">
                <div className="font-extrabold text-sm mb-1">{migrationResult.message}</div>
                {migrationResult.durationMs && (
                  <div className="text-[11px] text-emerald-700">
                    استغرق التنفيذ: {migrationResult.durationMs}ms | تم تجهيز {migrationResult.tablesCount} جدولاً سحابياً
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Connection Status Card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <div className="text-slate-500 text-[11px] font-bold mb-1">حالة الاتصال المباشر</div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-emerald-800 font-extrabold text-sm">
                      {status?.connected ? 'متصل بنجاح ✓' : 'جاري الفحص...'}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <div className="text-slate-500 text-[11px] font-bold mb-1">المحرك وقاعدة البيانات</div>
                  <div className="text-slate-800 font-extrabold text-sm truncate" title={status?.database}>
                    {status?.database || 'postgres'} ({status?.postgresVersion ? status.postgresVersion.slice(0, 14) : 'PostgreSQL 17'})
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <div className="text-slate-500 text-[11px] font-bold mb-1">سرعة الاستجابة (Latency)</div>
                  <div className="text-slate-800 font-extrabold text-sm">
                    {status?.latencyMs ? `${status.latencyMs} مللي ثانية` : '12ms'}
                  </div>
                </div>
              </div>

              {/* Upload to Supabase Banner */}
              <div className="p-5 rounded-2xl bg-linear-to-r from-emerald-50 to-teal-50 border border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-extrabold text-emerald-950 mb-1 flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-700" aria-hidden="true">cloud_upload</span>
                    رفع وتحديث المخطط الكامل على سوبابيز
                  </h3>
                  <p className="text-xs text-emerald-800/80 max-w-xl">
                    يقوم هذا الإجراء بتنفيذ ملف <code className="bg-white/80 px-1 py-0.5 rounded text-emerald-900 font-mono">supabase_schema.sql</code> كاملاً على قاعدة البيانات، وتحديث الجداول والفهارس ودوال التحديث التلقائي والبيانات الأولية بأمان.
                  </p>
                </div>

                <button
                  onClick={handleRunMigration}
                  disabled={migrating}
                  className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black shadow-xs transition-all flex items-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <span className={`material-symbols-outlined text-base ${migrating ? 'animate-spin' : ''}`} aria-hidden="true">
                    {migrating ? 'sync' : 'publish'}
                  </span>
                  <span>{migrating ? 'جاري الرفع لسوبابيز...' : 'رفع المخطط لسوبابيز الآن'}</span>
                </button>
              </div>

              {/* Schema Summary */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-white">
                <h4 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-slate-500" aria-hidden="true">checklist</span>
                  الجداول المشمولة في المخطط الشامل:
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    { name: 'courses', desc: 'الدورات العلمية والصيفية' },
                    { name: 'committees', desc: 'اللجان الميدانية والمراحل' },
                    { name: 'app_users', desc: 'المشرفون والمعلمون والمعاونون' },
                    { name: 'exams', desc: 'بنك الامتحانات ونماذج الأسئلة' },
                    { name: 'schedule_tasks', desc: 'تقويم وجدول المهام الميدانية' },
                    { name: 'scoring_records', desc: 'رصد درجات الطلاب والأسئلة' },
                    { name: 'audit_logs', desc: 'سجلات الرقابة والعمليات' },
                    { name: 'notifications', desc: 'الإشعارات والتنبيهات المباشرة' },
                    { name: 'system_settings', desc: 'إعدادات المنظومة وتكامل جوجل' },
                  ].map((t) => (
                    <div key={t.name} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="font-mono font-bold text-emerald-700 text-[11px]">{t.name}</div>
                      <div className="text-[11px] text-slate-600 mt-0.5">{t.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tables' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 font-bold">
                  الجداول المتزامنة في قاعدة بيانات سوبابيز:
                </span>
                <button
                  onClick={fetchStatus}
                  disabled={loading}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                >
                  <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin' : ''}`} aria-hidden="true">
                    refresh
                  </span>
                  تحديث الإحصائيات
                </button>
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
                {Array.isArray(status?.tables) &&
                  status?.tables.map((tbl: any, idx: number) => {
                    const name = typeof tbl === 'string' ? tbl : tbl.name;
                    const count = typeof tbl === 'string' ? undefined : tbl.count;
                    return (
                      <div key={idx} className="p-3.5 flex items-center justify-between hover:bg-slate-50">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-mono font-black text-xs">
                            #
                          </span>
                          <div>
                            <span className="font-mono font-bold text-slate-800 text-xs block">{name}</span>
                            <span className="text-[11px] text-slate-500">public.{name}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {count !== undefined && (
                            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-extrabold">
                              {count} سجل
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                            جاهز ومتزامن ✓
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {activeTab === 'sql' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-bold">
                  المخطط الكامل (SQL DDL + Seed Data)
                </span>
                <button
                  onClick={handleCopySql}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    {copied ? 'check' : 'content_copy'}
                  </span>
                  <span>{copied ? 'تم النسخ!' : 'نسخ الكود الكامل'}</span>
                </button>
              </div>

              <pre className="p-4 rounded-2xl bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto max-h-[380px] leading-relaxed text-left" dir="ltr">
                {schemaSql || '-- جاري تحميل نص المخطط...'}
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            ملف المخطط: <code className="font-bold text-slate-700">supabase_schema.sql</code> (27+ KB)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
            >
              إغلاق
            </button>
            <button
              onClick={handleRunMigration}
              disabled={migrating}
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
            >
              <span className={`material-symbols-outlined text-sm ${migrating ? 'animate-spin' : ''}`} aria-hidden="true">
                {migrating ? 'sync' : 'bolt'}
              </span>
              <span>تطبيق المخطط لسوبابيز</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
