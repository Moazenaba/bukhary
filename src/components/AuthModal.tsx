import React, { useState } from 'react';
import { AppUser } from '../types';
import { AuthService } from '../services/AuthService';
import { api, errorMessage, tokens } from '../services/api';
import { toast } from './Toasts';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser;
  onLogout: () => void;
}

/** The logged-in user's account: details, password change and logout. */
export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, currentUser, onLogout }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('كلمتا المرور الجديدتان غير متطابقتين');
      return;
    }
    setIsSaving(true);
    try {
      const res = await api<{ token: string; refreshToken: string }>('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      // Other sessions are signed out by the server; this one continues with the new tokens.
      tokens.set(res.token, res.refreshToken);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('تم تغيير كلمة المرور');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const input =
    'w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-brand font-mono text-left';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto text-right"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-title"
    >
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-line/50 overflow-hidden">
        <div className="px-5 py-4 bg-gradient-to-l from-brand to-emerald-800 text-white flex items-center justify-between">
          <h3 id="account-title" className="font-bold text-base">حسابي</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="w-8 h-8 rounded-lg text-white/80 hover:text-white flex items-center justify-center cursor-pointer">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="p-4 rounded-xl bg-canvas border border-line/40 text-xs space-y-1">
            <div className="font-bold text-sm text-ink">{currentUser.name}</div>
            <div className="text-ink-soft">{AuthService.getRoleLabel(currentUser.role)}</div>
            <div className="font-mono text-muted">{currentUser.phone}{currentUser.email ? ` • ${currentUser.email}` : ''}</div>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-3">
            <h4 className="font-bold text-xs text-ink">تغيير كلمة المرور</h4>
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
              {isSaving ? 'جاري الحفظ...' : 'حفظ كلمة المرور الجديدة'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="w-full py-2.5 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 font-bold text-xs cursor-pointer"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    </div>
  );
};
