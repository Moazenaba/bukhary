import React from 'react';
import { AppUser } from '../types';

export type NavTab = 'sanctuary' | 'summer_course' | 'home' | 'committees' | 'assistants' | 'exams' | 'courses' | 'calendar' | 'stats';

interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  isOpenMobile: boolean;
  setIsOpenMobile: (open: boolean) => void;
  isOpenDesktop?: boolean;
  onToggleSidebar?: () => void;
  committeesCount: number;
  examsCount: number;
  coursesCount?: number;
  calendarTasksCount?: number;
  pendingAssistantsCount?: number;
  onOpenNewCommittee: () => void;
  onOpenSheetsSync: () => void;
  sheetsConnected: boolean;
  currentUser: AppUser;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpenMobile,
  setIsOpenMobile,
  isOpenDesktop = true,
  onToggleSidebar = () => {},
  committeesCount,
  examsCount,
  coursesCount = 0,
  calendarTasksCount = 0,
  pendingAssistantsCount = 0,
  onOpenNewCommittee,
  onOpenSheetsSync,
  sheetsConnected,
  currentUser,
}) => {
  const isSuperAdmin = currentUser.role === 'super_admin';
  const hasExamsPermission = isSuperAdmin || currentUser.permissions.includes('manage_exams');

  const navItems = [
    {
      id: 'sanctuary' as NavTab,
      label: 'تسجيل الدخول للنظام',
      icon: 'lock',
      badge: 'بوابة الدخول',
      highlight: true,
      visible: true,
    },
    {
      id: 'summer_course' as NavTab,
      label: 'قاعدة البيانات والكشوفات',
      icon: 'table_chart',
      badge: 'الكشوفات',
      highlight: true,
      visible: true,
    },
    {
      id: 'home' as NavTab,
      label: 'الرئيسية',
      icon: 'home',
      badge: null,
      visible: true,
    },
    {
      id: 'committees' as NavTab,
      label: isSuperAdmin ? 'إدارة اللجان' : 'لجان الاختبار والتصحيح',
      icon: 'groups',
      badge: isSuperAdmin ? committeesCount : currentUser.assignedCommittees.length || committeesCount,
      visible: true,
    },
    {
      id: 'assistants' as NavTab,
      label: 'المعاونون والصلاحيات',
      icon: 'badge',
      badge: pendingAssistantsCount > 0 ? `${pendingAssistantsCount} معلق` : null,
      isPendingBadge: pendingAssistantsCount > 0,
      visible: isSuperAdmin, // ONLY Super Admin sees this!
    },
    {
      id: 'exams' as NavTab,
      label: 'الامتحانات ونماذج PDF',
      icon: 'description',
      badge: examsCount,
      highlight: true,
      visible: hasExamsPermission, // Only if has permission
    },
    {
      id: 'courses' as NavTab,
      label: 'إضافة وإدارة الدورات',
      icon: 'event_repeat',
      badge: coursesCount,
      visible: isSuperAdmin || currentUser.permissions.includes('manage_courses'), // Only Super Admin or if permitted
    },
    {
      id: 'calendar' as NavTab,
      label: 'جدول التقويم والمواعيد',
      icon: 'calendar_month',
      badge: calendarTasksCount > 0 ? calendarTasksCount : null,
      visible: true, // Everyone needs the calendar & schedule
    },
    {
      id: 'stats' as NavTab,
      label: 'حساب نسبة الإنجاز',
      icon: 'donut_large',
      badge: null,
      visible: isSuperAdmin, // Stats only for admin
    },
  ].filter((item) => item.visible);

  const handleSelectTab = (tab: NavTab) => {
    setActiveTab(tab);
    setIsOpenMobile(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={() => setIsOpenMobile(false)}
          className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-xs"
        />
      )}

      {/* Floating Toggle Button when Desktop Sidebar is closed */}
      {!isOpenDesktop && (
        <button
          onClick={onToggleSidebar}
          className="hidden lg:flex fixed top-20 right-0 z-40 items-center gap-2 px-3 py-2.5 bg-[#005c55] hover:bg-[#04332e] text-white rounded-l-xl shadow-2xl transition-all hover:pr-4 cursor-pointer font-bold text-xs border border-white/20 active:scale-95 animate-fadeIn"
          title="فتح القائمة الجانبية (Slide bar)"
        >
          <span className="material-symbols-outlined text-lg">menu_open</span>
          <span>القائمة الجانبية</span>
        </button>
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:sticky top-0 right-0 h-screen bg-white border-l border-[#bdc9c6]/40 flex flex-col z-50 transition-all duration-300 ease-in-out text-right shadow-lg lg:shadow-none ${
          isOpenDesktop
            ? 'lg:w-64 sm:lg:w-72 lg:translate-x-0 lg:opacity-100 lg:pointer-events-auto'
            : 'lg:w-0 lg:overflow-hidden lg:border-none lg:opacity-0 lg:pointer-events-none'
        } ${
          isOpenMobile
            ? 'translate-x-0 w-64 sm:w-72 opacity-100 pointer-events-auto'
            : 'max-lg:translate-x-full max-lg:pointer-events-none'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 sm:p-5 border-b border-[#bdc9c6]/30 flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-[#005c55] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
              <span className="material-symbols-outlined text-2xl">mosque</span>
            </div>
            <div className="overflow-hidden">
              <h1 className="font-bold text-base text-[#005c55] leading-tight truncate">
                مسجد البخاري
              </h1>
              <p className="text-[11px] text-[#6e7977] font-medium truncate">
                مسابقات متون العقيدة والتوحيد
              </p>
            </div>
          </div>

          {/* Close button on desktop and mobile */}
          <button
            onClick={onToggleSidebar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            title="إغلاق القائمة الجانبية"
            aria-label="إغلاق القائمة الجانبية"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-bold text-[#6e7977] tracking-wider uppercase">
            {isSuperAdmin ? 'لوحة تحكم المشرف العام' : 'لوحة مهام المعاون'}
          </div>

          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#005c55] text-white shadow-xs'
                    : 'text-[#3e4947] hover:bg-[#eff4ff] hover:text-[#005c55]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`material-symbols-outlined text-xl ${
                      isActive ? 'text-white' : 'text-[#6e7977]'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>

                {item.badge !== null ? (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : (item as any).isPendingBadge
                        ? 'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse'
                        : item.highlight
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-gray-100 text-[#0d1c2e]'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : item.highlight ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                ) : null}
              </button>
            );
          })}

          {/* Quick Actions for Super Admin */}
          {isSuperAdmin && (
            <>
              <div className="pt-5 px-3 pb-2 text-[10px] font-bold text-[#6e7977] tracking-wider uppercase">
                إجراءات سريعة
              </div>

              {/* Add Committee Action */}
              <button
                onClick={() => {
                  onOpenNewCommittee();
                  setIsOpenMobile(false);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-[#eff4ff] text-[#005c55] hover:bg-[#9cf2e8]/40 border border-[#9cf2e8]/60 transition-all cursor-pointer shadow-2xs"
              >
                <span className="material-symbols-outlined text-lg">add_circle</span>
                <span>+ إضافة لجنة جديدة</span>
              </button>
            </>
          )}

          {/* Assistant Info Banner in Sidebar */}
          {!isSuperAdmin && (
            <div className="mt-5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-right space-y-1.5">
              <span className="font-bold text-[#005c55] block flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">badge</span>
                <span>صلاحياتك الحالية:</span>
              </span>
              <div className="text-[11px] text-emerald-900 leading-relaxed">
                {currentUser.permissions.length > 0
                  ? currentUser.permissions.join('، ')
                  : 'استلام اللجان الميدانية'}
              </div>
              <div className="pt-1.5 border-t border-emerald-200/60 text-[10px] text-[#6e7977]">
                اللجان المسندة: {currentUser.assignedCommittees.map((c) => `#${c}`).join('، ') || 'جميع لجان القاعة'}
              </div>
            </div>
          )}
        </div>

        {/* Footer / Google Sheets status (Admin only) */}
        {isSuperAdmin && (
          <div className="p-3 border-t border-[#bdc9c6]/30 bg-[#f8f9ff]">
            <button
              onClick={() => {
                onOpenSheetsSync();
                setIsOpenMobile(false);
              }}
              className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#bdc9c6]/40 hover:border-emerald-500 text-xs transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 text-[#0d1c2e] font-semibold text-[11px]">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>قاعدة Google Sheets</span>
              </div>
              <span className="material-symbols-outlined text-[#6e7977] text-sm">open_in_new</span>
            </button>
          </div>
        )}
      </aside>
    </>
  );
};
