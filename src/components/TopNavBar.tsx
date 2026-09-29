import React, { useState } from 'react';
import { NotificationItem, AppUser } from '../types';
import { NavTab } from './Sidebar';

interface TopNavBarProps {
  onOpenNewCommittee: () => void;
  onOpenExport: () => void;
  notifications: NotificationItem[];
  onOpenNotificationCommittee?: (committeeId: string) => void;
  onMarkNotificationsAsRead: () => void;
  onOpenSheetsSync: () => void;
  sheetsSyncStatus: { isConnected: boolean; lastSynced?: string };
  onToggleMobileSidebar: () => void;
  currentUser: AppUser;
  onOpenAuthModal: () => void;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  onOpenNewCommittee,
  onOpenExport,
  notifications,
  onOpenNotificationCommittee,
  onMarkNotificationsAsRead,
  onOpenSheetsSync,
  sheetsSyncStatus,
  onToggleMobileSidebar,
  currentUser,
  onOpenAuthModal,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="bg-white border-b border-[#bdc9c6]/50 shadow-xs sticky top-0 z-30">
      <div className="w-full px-4 sm:px-6 py-2.5 flex items-center justify-between mx-auto">
        {/* Right: Hamburger button for mobile + Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobileSidebar}
            className="p-2 rounded-xl text-[#3e4947] hover:bg-[#eff4ff] lg:hidden cursor-pointer"
            aria-label="القائمة الجانبية"
          >
            <span className="material-symbols-outlined text-2xl">menu</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#005c55]/10 flex items-center justify-center text-[#005c55] shrink-0 hidden sm:flex">
              <span className="material-symbols-outlined text-xl">mosque</span>
            </div>
            <div>
              <span className="text-[17px] sm:text-[19px] font-bold text-[#005c55] block leading-tight">
                مسابقات مسجد البخاري
              </span>
              <span className="text-[11px] text-[#6e7977] block font-medium">
                متون العقيدة والتوحيد والكتب الشرعية
              </span>
            </div>
          </div>
        </div>

        {/* Left: Actions Cluster */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* User Profile / Switcher Button */}
          <button
            onClick={onOpenAuthModal}
            className="inline-flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border border-[#bdc9c6]/60 bg-[#f8f9ff] hover:bg-[#eff4ff] text-[#0d1c2e] text-xs font-semibold transition-all cursor-pointer shadow-2xs"
            title="تبديل الحساب أو تسجيل الدخول"
          >
            <span className="w-6 h-6 rounded-lg bg-[#005c55] text-white flex items-center justify-center text-xs font-bold shrink-0">
              {currentUser.role === 'super_admin' ? '👑' : '👤'}
            </span>
            <div className="text-right hidden sm:block">
              <span className="text-[11px] font-bold block leading-none truncate max-w-[130px]">
                {currentUser.name.split(' ')[0]} {currentUser.name.split(' ')[1] || ''}
              </span>
              <span className="text-[9px] text-[#005c55] font-semibold leading-none">
                {currentUser.role === 'super_admin' ? 'المشرف العام' : 'معاون معتمد'}
              </span>
            </div>
            <span className="material-symbols-outlined text-xs text-[#6e7977]">expand_more</span>
          </button>

          {/* Google Sheets Link Button (Admin only) */}
          {currentUser.role === 'super_admin' && (
            <button
              onClick={onOpenSheetsSync}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 transition-colors cursor-pointer"
              title="مزامنة بيانات اللجان مع ملف Google Sheets"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="material-symbols-outlined text-sm">table_chart</span>
              <span className="hidden md:inline">Google Sheets</span>
            </button>
          )}

          {/* New Committee Button (Visible only to super_admin) */}
          {currentUser.role === 'super_admin' && (
            <button
              onClick={onOpenNewCommittee}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-[#0f766e] text-white text-xs sm:text-[13px] font-bold hover:bg-[#005c55] shadow-xs active:scale-[0.98] transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">add_circle</span>
              <span>إضافة لجنة</span>
            </button>
          )}

          {/* Export (Admin only) */}
          {currentUser.role === 'super_admin' && (
            <button
              onClick={onOpenExport}
              title="تصدير الكشوف"
              className="p-2 rounded-xl text-[#3e4947] hover:bg-[#eff4ff] border border-[#bdc9c6]/50 transition-colors cursor-pointer hidden sm:flex"
            >
              <span className="material-symbols-outlined text-lg">file_download</span>
            </button>
          )}

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                if (!showNotifications && unreadCount > 0) {
                  onMarkNotificationsAsRead();
                }
              }}
              aria-label="الإشعارات"
              className="p-2 rounded-xl text-[#3e4947] hover:bg-[#eff4ff] border border-[#bdc9c6]/50 transition-colors relative cursor-pointer"
            >
              <span className="material-symbols-outlined text-lg">notifications</span>
              {unreadCount > 0 && (
                <span className="absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full bg-[#ba1a1a] animate-pulse"></span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-[#bdc9c6]/50 py-3 px-4 z-50 animate-in fade-in duration-150 text-right">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#bdc9c6]/30">
                  <span className="font-bold text-[13px] text-[#0d1c2e]">
                    إشعارات مسابقات مسجد البخاري
                  </span>
                  <span className="text-[11px] text-[#005c55] bg-[#9cf2e8]/30 px-2 py-0.5 rounded-full font-medium">
                    {notifications.length} إشعار
                  </span>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1 text-xs">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => {
                        if (notif.committeeId && onOpenNotificationCommittee) {
                          onOpenNotificationCommittee(notif.committeeId);
                          setShowNotifications(false);
                        }
                      }}
                      className="p-2 rounded-xl border border-gray-100 hover:bg-[#eff4ff] cursor-pointer"
                    >
                      <div className="flex items-center justify-between font-bold text-[#0d1c2e] mb-1">
                        <span>{notif.title}</span>
                        <span className="text-[10px] text-gray-400 font-normal">{notif.time}</span>
                      </div>
                      <p className="text-[#6e7977] text-[11px]">{notif.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
