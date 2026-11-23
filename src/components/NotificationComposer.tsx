import React, { useEffect, useMemo, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { Committee, NotificationItem } from '../types';
import { AuthService } from '../services/AuthService';
import { errorMessage } from '../services/api';
import { type Audience, type StaffRole, STAFF_LABEL, StaffApi, today } from '../services/staffApi';
import { toast } from './Toasts';

interface NotificationComposerProps {
  committees: Committee[];
  onClose: () => void;
  onSent: () => void;
}

type Kind = Audience['kind'];
const KINDS: { kind: Kind; label: string }[] = [
  { kind: 'all', label: 'الكل' },
  { kind: 'users', label: 'أشخاص أختارهم' },
  { kind: 'staffRole', label: 'كل المراقبين / مشايخ الحفلات / شيوخ اللجان' },
  { kind: 'committee', label: 'ناس لجنة أو حفلة معينة' },
  { kind: 'accountRole', label: 'حسب نوع الحساب' },
  { kind: 'available', label: 'المتاحون في يوم' },
];
const ACCOUNT_ROLES = [
  { role: 'exams_manager', label: 'مديرو الحفلات والامتحانات' },
  { role: 'committee_head', label: 'شيوخ اللجان (نوع الحساب)' },
  { role: 'sheikh', label: 'الشيوخ' },
];

/**
 * Admins and the exams manager: one message to a chosen audience (docs/PLAN_ROLES_AND_FLOW.md 1.6). The server
 * resolves who is reached (never a super admin) and pushes it to their phones.
 */
export const NotificationComposer: React.FC<NotificationComposerProps> = ({ committees, onClose, onSent }) => {
  useEscapeKey(onClose);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<NotificationItem['type']>('info');
  const [kind, setKind] = useState<Kind>('all');
  const [userIds, setUserIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [staffRole, setStaffRole] = useState<StaffRole>('observer');
  const [committeeId, setCommitteeId] = useState('');
  const [committeeRoles, setCommitteeRoles] = useState<StaffRole[]>(['owner', 'observer', 'ceremony_sheikh']);
  const [accountRole, setAccountRole] = useState('exams_manager');
  const [date, setDate] = useState(today());
  const [count, setCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const people = AuthService.getUsers().filter((u) => u.status === 'approved' && u.id !== AuthService.getCurrentUser()?.id);
  const audience: Audience | null = useMemo(() => {
    switch (kind) {
      case 'all':
        return { kind };
      case 'users':
        return userIds.length ? { kind, userIds } : null;
      case 'staffRole':
        return { kind, staffRole };
      case 'committee':
        return committeeId ? { kind, committeeId, committeeRoles } : null;
      case 'accountRole':
        return { kind, accountRole };
      case 'available':
        return date ? { kind, date } : null;
    }
  }, [kind, userIds, staffRole, committeeId, committeeRoles, accountRole, date]);

  useEffect(() => {
    setCount(null);
    if (!audience) return;
    const t = setTimeout(() => {
      StaffApi.preview(audience)
        .then((r) => setCount(r.recipients))
        .catch(() => setCount(null));
    }, 300);
    return () => clearTimeout(t);
  }, [audience]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audience) return toast.error('اختر من سيصلهم التنبيه');
    setSending(true);
    try {
      const r = await StaffApi.send({ title: title.trim(), description: description.trim(), type, audience });
      toast.success(`تم إرسال التنبيه إلى ${r.recipients} شخص`);
      onSent();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const field = 'w-full bg-white border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-brand';
  const shown = people.filter((p) => !search.trim() || p.name.includes(search.trim()) || (p.phone ?? '').includes(search.trim()));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 text-right" role="dialog" aria-modal="true" aria-labelledby="composer-title">
      <form onSubmit={submit} className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto border border-line/50 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 id="composer-title" className="font-bold text-sm text-ink">إرسال تنبيه</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="w-8 h-8 rounded-lg text-muted hover:text-ink cursor-pointer">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-bold text-ink mb-1">إلى من؟</legend>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                aria-pressed={kind === k.kind}
                onClick={() => setKind(k.kind)}
                className={`px-2.5 py-1 rounded-full border text-[11px] font-bold cursor-pointer ${
                  kind === k.kind ? 'bg-brand text-white border-brand' : 'bg-white border-line text-ink-soft'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          {kind === 'users' && (
            <div className="space-y-1.5">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم أو الرقم" className={field} aria-label="بحث" />
              <div className="max-h-40 overflow-y-auto border border-line rounded-xl p-2 space-y-1">
                {shown.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userIds.includes(p.id)}
                      onChange={(e) => setUserIds((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id)))}
                    />
                    <span>{p.name}</span>
                    <span className="text-muted">({AuthService.getRoleLabel(p.role)})</span>
                  </label>
                ))}
                {shown.length === 0 && <p className="text-muted text-xs">لا أحد</p>}
              </div>
            </div>
          )}
          {kind === 'staffRole' && (
            <select value={staffRole} onChange={(e) => setStaffRole(e.target.value as StaffRole)} className={field} aria-label="الدور">
              <option value="observer">كل المراقبين (في لجان جارية)</option>
              <option value="ceremony_sheikh">كل مشايخ الحفلات (في لجان جارية)</option>
              <option value="owner">كل شيوخ اللجان (في لجان جارية)</option>
            </select>
          )}
          {kind === 'committee' && (
            <div className="space-y-1.5">
              <select value={committeeId} onChange={(e) => setCommitteeId(e.target.value)} className={field} aria-label="اللجنة">
                <option value="">— اختر اللجنة —</option>
                {committees.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.committeeNumber} {c.committeeName}
                    {c.courseName ? ` — ${c.courseName}` : ''}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-3">
                {(['owner', 'observer', 'ceremony_sheikh'] as StaffRole[]).map((r) => (
                  <label key={r} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={committeeRoles.includes(r)}
                      onChange={(e) => setCommitteeRoles((rs) => (e.target.checked ? [...rs, r] : rs.filter((x) => x !== r)))}
                    />
                    {STAFF_LABEL[r]}
                  </label>
                ))}
              </div>
            </div>
          )}
          {kind === 'accountRole' && (
            <select value={accountRole} onChange={(e) => setAccountRole(e.target.value)} className={field} aria-label="نوع الحساب">
              {ACCOUNT_ROLES.map((r) => (
                <option key={r.role} value={r.role}>
                  {r.label}
                </option>
              ))}
            </select>
          )}
          {kind === 'available' && (
            <label className="block text-xs text-ink-soft">
              اليوم (يصل لمن ليس لديه مهمة في هذا اليوم)
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
            </label>
          )}
          <p className="text-xs text-muted" aria-live="polite">
            {audience ? (count === null ? 'جارٍ حساب عدد المستلمين…' : `سيصل إلى ${count} شخص`) : 'أكمل الاختيار'}
          </p>
        </fieldset>

        <label className="block text-xs text-ink-soft">
          العنوان
          <input required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        </label>
        <label className="block text-xs text-ink-soft">
          نص التنبيه
          <textarea rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
        </label>
        <label className="block text-xs text-ink-soft">
          النوع
          <select value={type} onChange={(e) => setType(e.target.value as NotificationItem['type'])} className={field}>
            <option value="info">معلومة</option>
            <option value="success">إنجاز</option>
            <option value="urgent">عاجل</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={sending || !title.trim() || !audience || count === 0}
          className="w-full py-2.5 rounded-xl bg-brand text-white font-bold text-xs cursor-pointer disabled:opacity-60"
        >
          {sending ? 'جارٍ الإرسال...' : 'إرسال'}
        </button>
      </form>
    </div>
  );
};
