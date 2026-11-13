import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DATA_ROOT_KEY, useSettings } from '../data/queries';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { errorMessage } from '../services/api';
import { DataService } from '../services/DataService';
import type { SystemSettings } from '../types';
import { toast } from './Toasts';
import { loadFont } from '../utils/fonts';

export const FONT_OPTIONS: { value: SystemSettings['font_family']; label: string; sample: string }[] = [
  { value: 'cairo', label: 'القاهرة (Cairo)', sample: "'Cairo'" },
  { value: 'tajawal', label: 'تجوّل (Tajawal)', sample: "'Tajawal'" },
  { value: 'ibm-plex-sans-arabic', label: 'آي بي إم بلكس عربي', sample: "'IBM Plex Sans Arabic'" },
  { value: 'noto-naskh-arabic', label: 'نوتو نسخ عربي (خط نسخ)', sample: "'Noto Naskh Arabic'" },
];

/** A list of names: one per line, kept in the order typed, blanks and repeats removed. */
function NameList({ label, help, value, onChange }: { label: string; help: string; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join('\n'));
  useEffect(() => setText(value.join('\n')), [value]);
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-black text-ink">{label}</span>
      <span className="block text-[11px] text-muted">{help}</span>
      <textarea
        value={text}
        aria-label={label}
        rows={8}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange([...new Set(text.split('\n').map((x) => x.trim()).filter(Boolean))])}
        className="w-full bg-white border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-brand leading-6"
      />
      <span className="block text-[11px] text-slate-500">{value.length} اسم</span>
    </label>
  );
}

/** «إعدادات النظام»: what admins set for everyone. Each field is saved on its own. */
export const SystemSettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useEscapeKey(onClose);
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const [saving, setSaving] = useState<string | null>(null);
  // The chosen font shows as selected at once, before the save comes back.
  const [pendingFont, setPendingFont] = useState<SystemSettings['font_family'] | null>(null);
  const shownFont = pendingFont ?? settings.font_family;
  // Real samples: every choosable font is loaded while this window is open (admins only).
  useEffect(() => {
    for (const f of FONT_OPTIONS) void loadFont(f.value);
  }, []);

  const save = async <K extends keyof SystemSettings>(key: K, value: SystemSettings[K], done: string) => {
    if (JSON.stringify(value) === JSON.stringify(settings[key])) {
      if (key === 'font_family') setPendingFont(null);
      return;
    }
    setSaving(key);
    try {
      await DataService.saveSetting(key, value);
      await queryClient.invalidateQueries({ queryKey: [...DATA_ROOT_KEY, 'settings'] });
      toast.success(done);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(null);
      if (key === 'font_family') setPendingFont(null);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="إعدادات النظام" className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl max-h-[92vh] flex flex-col text-right">
        <div className="flex items-center justify-between p-4 border-b border-line">
          <h2 className="font-black text-base text-ink flex items-center gap-2">
            <span className="material-symbols-outlined text-brand">settings</span>
            إعدادات النظام
          </h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 cursor-pointer">✕</button>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto">
          <p className="text-xs text-muted">كل إعداد يُحفظ لوحده لما تخرج من خانته، ويسري على الكل فوراً.{saving && ' (جارٍ الحفظ…)'}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className="block text-xs font-black text-ink">ورقة الامتحان تُتاح قبل موعده بـ (ساعة)</span>
              <span className="block text-[11px] text-muted">قبل كده الأدمن والمشرف العام بس اللي يقدروا ينزّلوها.</span>
              <input
                type="number" min={0} max={720} defaultValue={settings.exam_open_hours_before} key={`h-${settings.exam_open_hours_before}`}
                aria-label="ساعات إتاحة ورقة الامتحان قبل موعده"
                onBlur={(e) => save('exam_open_hours_before', Math.max(0, Math.min(720, parseInt(e.target.value) || 0)), 'تم حفظ موعد إتاحة الامتحانات')}
                className="w-full bg-white border border-line rounded-xl px-3 py-2 text-sm font-mono outline-none focus:border-brand"
              />
            </label>
            <label className="block space-y-1">
              <span className="block text-xs font-black text-ink">اللجنة تُعتبر متأخرة بعد (يوم)</span>
              <span className="block text-[11px] text-muted">لو مرحلة فضلت مستنية أكتر من كده تظهر في «المتأخرة».</span>
              <input
                type="number" min={1} max={90} defaultValue={settings.overdue_days} key={`d-${settings.overdue_days}`}
                aria-label="عدد أيام التأخير"
                onBlur={(e) => save('overdue_days', Math.max(1, Math.min(90, parseInt(e.target.value) || 3)), 'تم حفظ مدة التأخير')}
                className="w-full bg-white border border-line rounded-xl px-3 py-2 text-sm font-mono outline-none focus:border-brand"
              />
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-black text-ink mb-1">خط الموقع</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FONT_OPTIONS.map((f) => (
                <label key={f.value} className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer ${shownFont === f.value ? 'border-brand bg-emerald-50' : 'border-line hover:bg-slate-50'}`}>
                  <input
                    type="radio" name="font_family" value={f.value} checked={shownFont === f.value}
                    onChange={() => {
                      setPendingFont(f.value);
                      void save('font_family', f.value, 'تم تغيير خط الموقع');
                    }}
                  />
                  <span style={{ fontFamily: f.sample }} className="text-sm">{f.label} — بسم الله الرحمن الرحيم</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NameList
              label="مراقبو الامتحانات"
              help="الأسماء اللي بتظهر للاختيار في «أعضاء اللجنة». اسم في كل سطر."
              value={settings.observers}
              onChange={(v) => save('observers', v, 'تم حفظ قائمة المراقبين')}
            />
            <NameList
              label="مشايخ الحفلات"
              help="الأسماء اللي بتظهر للاختيار في «المشايخ الحاضرون» للحفل. اسم في كل سطر."
              value={settings.ceremony_sheikhs}
              onChange={(v) => save('ceremony_sheikhs', v, 'تم حفظ قائمة مشايخ الحفلات')}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
