import React, { useState } from 'react';
import { AuthService, useAuth } from '../services/AuthService';
import { errorMessage } from '../services/api';
import { toast } from './Toasts';

/**
 * Shown on every screen while an admin acts as another user («الدخول بعين المستخدم»): whose account is open, and the
 * way back. What the admin does here is done for that person and logged with both names.
 */
export const ImpersonationBanner: React.FC = () => {
  const { currentUser } = useAuth();
  const by = AuthService.impersonatedBy();
  const [busy, setBusy] = useState(false);
  if (!by || !currentUser) return null;
  return (
    <div role="status" className="sticky top-0 z-[60] bg-amber-500 text-white text-xs font-bold px-3 py-2 flex flex-wrap items-center justify-center gap-3 text-center">
      <span className="material-symbols-outlined text-base">visibility</span>
      <span>
        أنت داخل بحساب: {currentUser.name} ({AuthService.getRoleLabel(currentUser.role)}) — كل ما تفعله يُسجَّل باسمك نيابة عنه
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await AuthService.stopImpersonating();
            window.location.hash = '#/assistants';
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
        className="px-3 py-1 rounded-lg bg-white text-amber-800 cursor-pointer disabled:opacity-60"
      >
        رجوع لحسابي
      </button>
    </div>
  );
};
