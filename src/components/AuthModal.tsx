import React from 'react';
import { AppUser } from '../types';
import { AuthService } from '../services/AuthService';
import { ChangePasswordForm } from './ChangePasswordForm';
import { toast } from './Toasts';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser;
  onLogout: () => void;
}

/** The logged-in user's account: details, password change and logout. */
export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, currentUser, onLogout }) => {
  if (!isOpen) return null;

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

          <ChangePasswordForm onChanged={() => toast.success('تم تغيير كلمة المرور')} />

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
