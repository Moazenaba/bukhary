import React, { useState } from 'react';
import { toast } from './Toasts';
import { errorMessage } from '../services/api';

/** «نسخة احتياطية»: downloads the whole database as one .db file (admins and super admins). */
export const BackupButton: React.FC = () => {
  const [progress, setProgress] = useState<string | null>(null);

  const run = async () => {
    if (progress !== null) return;
    setProgress('جارٍ التجهيز…');
    try {
      const { downloadFullBackup } = await import('../services/backup');
      await downloadFullBackup((table, done, total) =>
        setProgress(done < total ? `${done + 1}/${total} ${table}` : 'جارٍ الحفظ…')
      );
      toast.success('تم تنزيل النسخة الاحتياطية الكاملة (.db)');
    } catch (err) {
      toast.error(`تعذر إنشاء النسخة الاحتياطية: ${errorMessage(err)}`);
    } finally {
      setProgress(null);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={progress !== null}
      aria-busy={progress !== null}
      className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-300/80 text-sky-800 text-xs font-bold shadow-2xs cursor-pointer transition-all active:scale-95 disabled:opacity-70 disabled:cursor-wait"
      title="تنزيل نسخة احتياطية كاملة من قاعدة البيانات بصيغة .db"
    >
      <span className="material-symbols-outlined text-sm">{progress !== null ? 'hourglass_top' : 'download'}</span>
      <span className="max-w-[160px] truncate">{progress ?? 'نسخة احتياطية'}</span>
    </button>
  );
};
