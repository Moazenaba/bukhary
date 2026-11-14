import React, { useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { Committee, NotificationItem } from '../types';
import { DataService } from '../services/DataService';
import { errorMessage } from '../services/api';
import { toast } from './Toasts';

interface NotificationComposerProps {
  committees: Committee[];
  onClose: () => void;
  onSent: () => void;
}

/** Super admin: sends a notification to everyone, optionally about one committee (WEB-12). */
export const NotificationComposer: React.FC<NotificationComposerProps> = ({ committees, onClose, onSent }) => {
  useEscapeKey(onClose);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<NotificationItem['type']>('info');
  const [committeeId, setCommitteeId] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await DataService.createNotification({ title: title.trim(), description: description.trim(), type, committeeId: committeeId || null });
      toast.success('تم إرسال التنبيه');
      onSent();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const field = 'w-full bg-white border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-brand';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 text-right" role="dialog" aria-modal="true" aria-labelledby="composer-title">
      <form onSubmit={submit} className="bg-white w-full max-w-md rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto border border-line/50 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 id="composer-title" className="font-bold text-sm text-ink">إرسال تنبيه للجميع</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="w-8 h-8 rounded-lg text-muted hover:text-ink cursor-pointer">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <label className="block text-xs text-ink-soft">
          العنوان
          <input required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        </label>
        <label className="block text-xs text-ink-soft">
          نص التنبيه
          <textarea rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-ink-soft">
            النوع
            <select value={type} onChange={(e) => setType(e.target.value as NotificationItem['type'])} className={field}>
              <option value="info">معلومة</option>
              <option value="success">إنجاز</option>
              <option value="urgent">عاجل</option>
            </select>
          </label>
          <label className="block text-xs text-ink-soft">
            لجنة مرتبطة (اختياري)
            <select value={committeeId} onChange={(e) => setCommitteeId(e.target.value)} className={field}>
              <option value="">بدون</option>
              {committees.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.committeeNumber} {c.committeeName}{c.courseName ? ` — ${c.courseName}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" disabled={sending || !title.trim()} className="w-full py-2.5 rounded-xl bg-brand text-white font-bold text-xs cursor-pointer disabled:opacity-60">
          {sending ? 'جارٍ الإرسال...' : 'إرسال'}
        </button>
      </form>
    </div>
  );
};
