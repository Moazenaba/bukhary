import React, { useState } from 'react';
import { AuthService } from '../services/AuthService';
import { errorMessage } from '../services/api';

interface ChangePasswordFormProps {
  /** Shown above the fields. */
  title?: string;
  submitLabel?: string;
  onChanged?: () => void;
}

/** Changes the logged-in user's password. The server ends every other session of the user. */
export const ChangePasswordForm: React.FC<ChangePasswordFormProps> = ({ title = 'تغيير كلمة المرور', submitLabel = 'حفظ كلمة المرور الجديدة', onChanged }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('كلمتا المرور الجديدتان غير متطابقتين');
      return;
    }
    setIsSaving(true);
    try {
      await AuthService.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onChanged?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const input = 'w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-brand font-mono text-left';

  return (
    <form onSubmit={submit} className="space-y-3">
      <h4 className="font-bold text-xs text-ink">{title}</h4>
      <label className="block text-xs text-ink-soft">
        كلمة المرور الحالية
        <input type="password" required autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={input} />
      </label>
      <label className="block text-xs text-ink-soft">
        كلمة المرور الجديدة (8 أحرف على الأقل، حروف وأرقام)
        <input type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={input} />
      </label>
      <label className="block text-xs text-ink-soft">
        تأكيد كلمة المرور الجديدة
        <input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={input} />
      </label>
      {error && (
        <div role="alert" className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          {error}
        </div>
      )}
      <button type="submit" disabled={isSaving} className="w-full py-2.5 rounded-xl bg-brand text-white font-bold text-xs cursor-pointer disabled:opacity-60">
        {isSaving ? 'جاري الحفظ...' : submitLabel}
      </button>
    </form>
  );
};
