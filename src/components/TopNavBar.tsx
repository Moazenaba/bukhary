import React, { useState } from 'react';
import { NotificationItem, AppUser, Committee, Course } from '../types';
import { AuthService } from '../services/AuthService';
import { NotificationComposer } from './NotificationComposer';
import { BackupButton } from './BackupButton';

/** Server times are ISO; show them in the user's locale. Older free-text values are shown as they are. */
function formatTime(value: string): string {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return value;
  return new Date(ms).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });
}

interface TopNavBarProps {
  onOpenNewCommittee: () => void;
  onOpenExport: () => void;
  notifications: NotificationItem[];
  onOpenNotificationCommittee?: (committeeId: string) => void;
  onMarkNotificationsAsRead: () => void;
  onOpenSheetsSync?: () => void;
  sheetsSyncStatus?: { isConnected: boolean; lastSynced?: string };
  onOpenDatabaseModal?: () => void;
  /** Admins and super admins: the full .db backup button. */
  canBackup?: boolean;
  onToggleSidebar: () => void;
  isSidebarOpen?: boolean;
  currentUser: AppUser;
  onOpenAuthModal: () => void;
  onSignOut?: () => void;
  todaysTasksCount?: number;
  onNavigateToDailyAlerts?: () => void;
  canSendNotifications?: boolean;
  committees?: Committee[];
  /** Courses stand alone; the chosen one scopes every screen. */
  courses?: Course[];
  currentCourseId?: string;
  onSelectCourse?: (courseId: string) => void;
  onNotificationSent?: () => void;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  onOpenNewCommittee,
  onOpenExport,
  notifications,
  onOpenNotificationCommittee,
  onMarkNotificationsAsRead,
  onOpenSheetsSync,
  sheetsSyncStatus,
  onOpenDatabaseModal,
  canBackup = false,
  onToggleSidebar,
  isSidebarOpen = true,
  currentUser,
  onOpenAuthModal,
  onSignOut,
  todaysTasksCount = 0,
  onNavigateToDailyAlerts,
  canSendNotifications = false,
  committees = [],
  courses = [],
  currentCourseId,
  onSelectCourse,
  onNotificationSent,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="bg-white border-b border-line/50 shadow-xs sticky top-0 z-30">
      {/* A phone gets one slim row: name, course, bell, account. Pages are in the side rail; the rest is in the account window. */}
      <div className="w-full px-3 sm:px-6 h-12 sm:h-auto sm:py-2.5 flex flex-nowrap sm:flex-wrap items-center justify-between gap-x-2 gap-y-2 mx-auto">
        {/* Right: Toggle button for sidebar (desktop & mobile) + Title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={onToggleSidebar}
            className="hidden lg:flex p-2 sm:px-3 rounded-xl text-brand bg-brand/10 hover:bg-brand/20 cursor-pointer flex items-center gap-1.5 transition-all active:scale-95"
            title={isSidebarOpen ? "إغلاق القائمة الجانبية (Slide bar)" : "فتح القائمة الجانبية (Slide bar)"}
            aria-label="القائمة الجانبية"
          >
            <span className="material-symbols-outlined text-2xl">
              {isSidebarOpen ? "menu_open" : "menu"}
            </span>
            <span className="hidden sm:inline text-xs font-bold">
              {isSidebarOpen ? "إغلاق القائمة" : "فتح القائمة"}
            </span>
          </button>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center text-brand shrink-0 hidden sm:flex">
              <span className="material-symbols-outlined text-xl">mosque</span>
            </div>
            <div>
              <span className="text-[15px] sm:text-[18px] font-extrabold text-brand block leading-tight truncate max-w-[7.5rem] sm:max-w-none">
                <span className="sm:hidden">البخاري</span>
                <span className="hidden sm:inline">مسجد الإمام البخاري</span>
              </span>
              <span className="text-xs text-[#0f766e] hidden sm:block font-bold">
                متابعة الدورات العلمية - المتون العلمية
              </span>
            </div>
          </div>

          {/* Each course stands alone: this choice decides which course every screen shows. */}
          {courses.length > 0 && onSelectCourse && (
            <label className="flex items-center gap-1 bg-canvas border border-line/70 rounded-xl px-2 sm:px-2.5 py-1.5 min-w-0">
              <span className="material-symbols-outlined text-sm text-brand">event_repeat</span>
              <span className="text-xs font-bold text-muted hidden md:inline">الدورة:</span>
              <select
                value={currentCourseId ?? ''}
                onChange={(e) => onSelectCourse(e.target.value)}
                aria-label="الدورة المعروضة"
                className="bg-transparent text-xs font-bold text-brand outline-none cursor-pointer max-w-[84px] sm:max-w-[220px]"
              >
                {courses.map((course) => (
                  <option key={course?.id} value={course?.id}>
                    {course?.name}
                    {course?.isDefault ? ' (الحالية)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Left: Actions Cluster */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* New Committee Button (Visible to super_admin or user with add_new_committee permission) */}
          {AuthService.can('committees.create') && (
            <button
              onClick={onOpenNewCommittee}
              // Phones use the floating «+ لجنة» button instead (MobileBottomNav).
              className="hidden md:inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-[#0f766e] text-white text-xs sm:text-sm font-black hover:bg-brand shadow-md ring-2 ring-brand/20 active:scale-[0.98] transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">add_circle</span>
              <span>إضافة لجنة</span>
            </button>
          )}


          <span aria-hidden="true" className="hidden md:block w-px h-6 bg-line/70" />
          {/* Database status (super admins only) */}
          {onOpenDatabaseModal && (
            <button
              type="button"
              onClick={onOpenDatabaseModal}
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300/80 text-emerald-800 text-xs font-bold shadow-2xs cursor-pointer transition-all active:scale-95"
              title="حالة قاعدة البيانات"
            >
              <span className="material-symbols-outlined text-sm">database</span>
              <span>قاعدة البيانات</span>
            </button>
          )}

          {canBackup && <span className="hidden md:inline-flex"><BackupButton /></span>}

          {/* User Profile / Switcher Button */}
          <button
            onClick={onOpenAuthModal}
            className="inline-flex items-center gap-2 px-1.5 sm:px-3 py-1.5 rounded-xl border border-line/60 bg-canvas hover:bg-tint text-ink text-xs font-semibold transition-all cursor-pointer shadow-2xs"
            aria-label="حسابي"
            title="تبديل الصلاحية أو استعراض بيانات الحساب"
          >
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
              currentUser.role === 'super_admin' ? 'bg-emerald-700 text-white' :
              currentUser.role === 'committee_head' ? 'bg-blue-700 text-white' :
              currentUser.role === 'admin' ? 'bg-teal-700 text-white' :
              'bg-amber-600 text-white'
            }`}>
              {currentUser.role === 'super_admin' ? '👑' :
               currentUser.role === 'committee_head' ? '👨‍🏫' :
               currentUser.role === 'admin' ? '🛡️' : '👤'}
            </span>
            <div className="text-right hidden sm:block">
              <span className="text-xs font-bold block leading-none truncate max-w-[130px]">
                {currentUser.name.split(' ')[0]} {currentUser.name.split(' ')[1] || ''}
              </span>
              <span className={`text-xs font-semibold leading-none ${
                currentUser.role === 'super_admin' ? 'text-emerald-700 font-bold' :
                currentUser.role === 'committee_head' ? 'text-blue-700 font-bold' :
                currentUser.role === 'admin' ? 'text-teal-700 font-bold' :
                'text-amber-700 font-bold'
              }`}>
                {currentUser.role === 'super_admin' ? 'سوبر أدمن' :
                 currentUser.role === 'admin' ? 'أدمن' :
                 AuthService.getRoleLabel(currentUser.role)}
              </span>
            </div>
            <span className="material-symbols-outlined text-xs text-muted hidden sm:inline">expand_more</span>
          </button>

          {/* Sign Out Button (Central Service Exit) */}
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-all cursor-pointer shadow-2xs"
              title="تسجيل الخروج والرجوع لبوابة الدخول الخارجية"
            >
              <span className="material-symbols-outlined text-base">logout</span>
              <span className="hidden sm:inline">تسجيل الخروج</span>
            </button>
          )}

          {/* Export (Admin only) */}
          {(currentUser.role === 'super_admin' || currentUser.role === 'admin') && (
            <button
              onClick={onOpenExport}
              title="تصدير الكشوف"
              className="p-2 rounded-xl text-ink-soft hover:bg-tint border border-line/50 transition-colors cursor-pointer hidden sm:flex"
            >
              <span className="material-symbols-outlined text-lg">file_download</span>
            </button>
          )}

          {/* Quick subtle pill for Today's tasks if any */}
          {todaysTasksCount > 0 && onNavigateToDailyAlerts && (
            <button
              type="button"
              onClick={onNavigateToDailyAlerts}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95"
              title={`يوجد ${todaysTasksCount} أعمال وتنبيهات مجدولة اليوم - اضغط لفتح شاشة التنبيهات والمهام اليومية`}
            >
              <span className="material-symbols-outlined text-sm text-amber-700">notifications_active</span>
              <span className="font-mono text-xs font-black">{todaysTasksCount}<span className="hidden sm:inline"> مهام اليوم</span></span>
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
              className="p-2 rounded-xl text-ink-soft hover:bg-tint border border-line/50 transition-colors relative cursor-pointer"
            >
              <span className="material-symbols-outlined text-lg">notifications</span>
              {unreadCount > 0 && (
                <span className="absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full bg-[#ba1a1a] animate-pulse"></span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute left-0 mt-2 w-[calc(100vw-1.5rem)] max-w-96 sm:w-96 bg-white rounded-2xl shadow-xl border border-line/50 py-3 px-4 z-50 animate-in fade-in duration-150 text-right">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-line/30">
                  <span className="font-bold text-[13px] text-ink">
                    إشعارات مسابقات مسجد البخاري
                  </span>
                  <span className="text-xs text-brand bg-brand-light/30 px-2 py-0.5 rounded-full font-medium">
                    {notifications.length} إشعار
                  </span>
                </div>
                {canSendNotifications && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowNotifications(false);
                      setShowComposer(true);
                    }}
                    className="w-full mb-2 py-1.5 rounded-xl border border-brand/40 text-brand text-xs font-bold hover:bg-brand/5 cursor-pointer"
                  >
                    إرسال تنبيه جديد
                  </button>
                )}
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1 text-xs">
                  {notifications.length === 0 && (
                    <p className="py-6 text-center text-muted">لا توجد إشعارات حتى الآن</p>
                  )}
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => {
                        if (notif.committeeId && onOpenNotificationCommittee) {
                          onOpenNotificationCommittee(notif.committeeId);
                          setShowNotifications(false);
                        }
                      }}
                      className="p-2 rounded-xl border border-gray-100 hover:bg-tint cursor-pointer"
                    >
                      <div className="flex items-center justify-between font-bold text-ink mb-1">
                        <span>{notif.title}</span>
                        <span className="text-xs text-gray-400 font-normal">{formatTime(notif.time)}</span>
                      </div>
                      <p className="text-muted text-xs">{notif.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {showComposer && (
        <NotificationComposer committees={committees} onClose={() => setShowComposer(false)} onSent={() => onNotificationSent?.()} />
      )}
    </header>
  );
};
