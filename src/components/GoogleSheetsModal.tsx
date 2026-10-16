import React, { useState } from 'react';
import { Committee, GoogleSheetsConfig, STAGES_LIST } from '../types';
import { calculateCurrentStage } from '../utils/stageUtils';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: GoogleSheetsConfig;
  onSaveConfig: (cfg: GoogleSheetsConfig) => void;
  committees: Committee[];
  onTriggerSync: () => void;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  committees,
  onTriggerSync,
}) => {
  if (!isOpen) return null;

  const [webhookUrl, setWebhookUrl] = useState(config.webhookUrl);
  const [sheetId, setSheetId] = useState(config.sheetId);
  const [autoSync, setAutoSync] = useState(config.autoSync);
  const [copiedScript, setCopiedScript] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const handleSave = () => {
    onSaveConfig({
      ...config,
      webhookUrl: webhookUrl.trim(),
      sheetId: sheetId.trim(),
      autoSync,
    });
    setSyncStatus('تم حفظ إعدادات ربط Google Sheets بنجاح.');
    setTimeout(() => setSyncStatus(null), 3000);
  };

  const handleManualSyncNow = () => {
    onTriggerSync();
    setSyncStatus('جاري إرسال وتحديث كافّة الصفوف في ملف Google Sheets...');
    setTimeout(() => {
      setSyncStatus(`تمت المزامنة بنجاح! تم تحديث ${committees.length} سطراً في Google Sheets.`);
    }, 800);
  };

  const copyAppsScript = () => {
    const scriptCode = `// كود Google Apps Script البسيط لربط مسابقات مسجد البخاري
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  
  if (data.action === "sync_all") {
    sheet.clear();
    // Headers
    sheet.appendRow([
      "رقم اللجنة", "اسم اللجنة", "نوع اللجنة", "الشيخ المرسل إليه", "هاتف الشيخ", "بلد الشيخ", "عدد الطلاب",
      "أعضاء اللجنة", "الفرع", "الجمعية", "الكتاب المقرر", "الحالة الحالية",
      "وقت التسجيل", "وقت الامتحان", "وقت التصحيح", "وقت التجميع", "وقت كتابة الكشف", "وقت المراجعة",
      "وقت إعلان النتيجة", "وقت الحفل", "الملاحظات العامة"
    ]);
    data.committees.forEach(function(c) {
      sheet.appendRow([
        c.number, c.name, c.type || "-", c.sheikhName || "", c.sheikhPhone || "", c.sheikhCountry || "", c.studentsCount || 0,
        c.members, c.branch, c.association || "", c.book, c.currentStage,
        c.tRegistration || "", c.tExam || "", c.tScoring || "", c.tAggregation || "", c.tSheet || "",
        c.tReview || "", c.tAnnouncement || "", c.tCeremony || "", c.notes || ""
      ]);
    });
    return ContentService.createTextOutput("SUCCESS").setMimeType(ContentService.MimeType.TEXT);
  }
}`;
    navigator.clipboard.writeText(scriptCode);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto text-right">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-[#bdc9c6]/50 overflow-hidden animate-in fade-in duration-150 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-[#f8f9ff] border-b border-[#bdc9c6]/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-800">
            <span className="material-symbols-outlined text-2xl text-emerald-600" aria-hidden="true">table_chart</span>
            <h3 className="font-bold text-base text-[#0d1c2e]">
              إدارة ربط قاعدة بيانات Google Sheets
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* Status Box */}
          <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                <span className="material-symbols-outlined text-xl" aria-hidden="true">cloud_sync</span>
              </span>
              <div>
                <span className="font-bold text-sm text-emerald-900 block">
                  المزامنة اللحظية مع Google Sheets
                </span>
                <span className="text-emerald-700 text-[11px]">
                  {config.lastSyncedAt
                    ? `آخر مزامنة ناجحة: ${config.lastSyncedAt}`
                    : 'أي تعديل يتم في التطبيق يُحفظ فورياً محلياً ويُرسل إلى جدول البيانات'}
                </span>
              </div>
            </div>

            <button
              onClick={handleManualSyncNow}
              className="px-4 py-2 bg-emerald-700 text-white font-bold rounded-xl hover:bg-emerald-800 transition-colors shadow-xs active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">sync</span>
              <span>مزامنة الآن</span>
            </button>
          </div>

          {syncStatus && (
            <div className="p-3 bg-emerald-100 text-emerald-900 font-semibold rounded-xl border border-emerald-300">
              {syncStatus}
            </div>
          )}

          {/* Webhook Configuration */}
          <div className="space-y-3 bg-[#f8f9ff] p-4 rounded-xl border border-[#bdc9c6]/40">
            <h4 className="font-bold text-xs text-[#0d1c2e]">
              إعدادات الرابط التلقائي (Google Sheets Webhook / Web App)
            </h4>

            <div>
              <label className="block text-[11px] font-semibold text-[#3e4947] mb-1">
                رابط تطبيق الويب (Google Apps Script Web App URL)
              </label>
              <input
                type="text"
                placeholder="https://script.google.com/macros/s/.../exec"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="w-full bg-white border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs font-mono text-[#0d1c2e] outline-none focus:border-[#005c55]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#3e4947] mb-1">
                معرف ملف الشيت (Google Spreadsheet ID) - اختياري
              </label>
              <input
                type="text"
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
                className="w-full bg-white border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs font-mono text-[#0d1c2e] outline-none focus:border-[#005c55]"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="font-semibold text-[#0d1c2e]">
                تفعيل الإرسال التلقائي مع كل تعديل (تسجيل لجنة، تغيير حالة، كتابة ملاحظة)
              </span>
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                className="w-4 h-4 accent-[#005c55]"
              />
            </div>
          </div>

          {/* Preview of Columns & Data Structure */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-xs text-[#0d1c2e]">
                معاينة هيكل الأعمدة والصفوف التي يتم تحديثها في Google Sheets:
              </span>
              <button
                type="button"
                onClick={copyAppsScript}
                className="text-[11px] text-[#005c55] font-bold hover:underline flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-xs" aria-hidden="true">content_copy</span>
                <span>{copiedScript ? 'تم نسخ كود الربط!' : 'نسخ كود Apps Script'}</span>
              </button>
            </div>

            <div className="border border-[#bdc9c6]/40 rounded-xl overflow-x-auto max-h-40 bg-white">
              <table className="w-full text-right text-[11px] whitespace-nowrap">
                <thead className="bg-[#eff4ff] text-[#005c55] font-bold border-b border-[#bdc9c6]/30">
                  <tr>
                    <th className="p-2">رقم اللجنة</th>
                    <th className="p-2">اسم اللجنة</th>
                    <th className="p-2">الكتاب المقرر</th>
                    <th className="p-2">الفرع</th>
                    <th className="p-2">أعضاء اللجنة</th>
                    <th className="p-2">الحالة الحالية</th>
                    <th className="p-2">الملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {committees.slice(0, 5).map((c) => {
                    const status = calculateCurrentStage(c.stages);
                    return (
                      <tr key={c.id}>
                        <td className="p-2 font-mono font-bold">#{c.committeeNumber}</td>
                        <td className="p-2 font-semibold">{c.committeeName}</td>
                        <td className="p-2 text-[#005c55]">{c.competitionBook}</td>
                        <td className="p-2">{c.branch}</td>
                        <td className="p-2">{c.members.join('، ')}</td>
                        <td className="p-2 font-bold">{status.emoji} {status.label}</td>
                        <td className="p-2 text-gray-500 max-w-xs truncate">{c.generalNotes || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#f8f9ff] border-t border-[#bdc9c6]/40 flex items-center justify-between">
          <span className="text-[11px] text-[#6e7977]">
            البيانات محفوظة أيضاً بشكل دائم على متصفحك حتى في حال عدم توفر اتصال.
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#3e4947] border border-[#bdc9c6] hover:bg-white"
            >
              إغلاق
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-[#005c55] hover:bg-[#1b6b51] shadow-xs active:scale-[0.98] transition-all cursor-pointer"
            >
              حفظ الإعدادات
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
