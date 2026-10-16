import React from 'react';
import { AppUser } from '../types';
import { ChangePasswordForm } from './ChangePasswordForm';
import { toast } from './Toasts';

interface ForcedPasswordChangeProps {
  currentUser: AppUser;
  onLogout: () => void;
}

/**
 * Shown instead of the app after an admin reset the password (WEB-02): the temporary password
 * only opens this screen; the server refuses every other request until it is replaced.
 */
export const ForcedPasswordChange: React.FC<ForcedPasswordChangeProps> = ({ currentUser, onLogout }) => (
  <div dir="rtl" className="min-h-screen bg-canvas flex items-center justify-center p-4 text-right">
    <main className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-line/50 overflow-hidden" aria-labelledby="forced-title">
      <div className="px-5 py-4 bg-gradient-to-l from-brand to-emerald-800 text-white">
        <h1 id="forced-title" className="font-bold text-base">اختر كلمة مرور جديدة</h1>
        <p className="text-xs text-white/85 mt-1">
          أعاد المشرف العام تعيين كلمة مرورك. أدخل كلمة المرور المؤقتة التي أعطاك إياها، ثم اختر كلمة مرور جديدة لا يعرفها غيرك.
        </p>
      </div>
      <div className="p-5 space-y-4">
        <div className="text-xs text-ink-soft">
          الحساب: <span className="font-bold text-ink">{currentUser.name}</span>
        </div>
        <ChangePasswordForm
          title="كلمة المرور"
          submitLabel="حفظ والمتابعة"
          onChanged={() => toast.success('تم تغيير كلمة المرور')}
        />
        <button type="button" onClick={onLogout} className="w-full py-2.5 rounded-xl border border-line text-ink-soft hover:bg-canvas font-bold text-xs cursor-pointer">
          تسجيل الخروج
        </button>
      </div>
    </main>
  </div>
);
