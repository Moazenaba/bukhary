import React from 'react';
import { AppUser } from '../types';
import { AuthService } from '../services/AuthService';

export type NavTab = 'home' | 'summer_course' | 'committees' | 'assistants' | 'exams' | 'courses' | 'calendar' | 'stats' | 'daily_alerts' | 'ceremonies' | 'audit';

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
  todaysTasksCount?: number;
  ceremoniesCount?: number;
  onOpenNewCommittee: () => void;
  /** Opens «إعدادات النظام» (admins). */
  onOpenSettings?: () => void;
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
  todaysTasksCount = 0,
  ceremoniesCount = 0,
  onOpenNewCommittee,
  onOpenSettings,
  currentUser,
}) => {
  const isSuperAdmin = currentUser.role === 'super_admin';

  // Grouped and sorted navigation tabs in the most logical operational order
  const navSections: Array<{
    title: string;
    items: Array<{
      id: NavTab;
      label: string;
      icon: string;
      badge: string | number | null;
      isPendingBadge?: boolean;
      highlight?: boolean;
      visible: boolean;
    }>;
  }> = [
    {
      title: 'العمليات الميدانية والكشوفات',
      items: [
        {
          id: 'summer_course',
          label: 'قاعدة البيانات والكشوفات',
          icon: 'table_chart',
          badge: 'الكشوفات',
          highlight: true,
          visible: AuthService.canAccessTab('summer_course', currentUser),
        },
        {
          id: 'committees',
          label: 'إدارة اللجان الميدانية',
          icon: 'groups',
          badge: committeesCount,
          visible: AuthService.canAccessTab('committees', currentUser),
        },
        {
          id: 'exams',
          label: 'الامتحانات ونماذج PDF',
          icon: 'description',
          badge: examsCount,
          visible: AuthService.canAccessTab('exams', currentUser),
        },
      ],
    },
    {
      title: 'المواعيد والتنظيم',
      items: [
        {
          id: 'ceremonies',
          label: 'الحفلات والتكريم',
          icon: 'celebration',
          badge: ceremoniesCount > 0 ? `${ceremoniesCount} حفل` : null,
          highlight: true,
          visible: AuthService.canAccessTab('ceremonies', currentUser),
        },
        {
          id: 'calendar',
          label: 'الجدول وتقويم المواعيد',
          icon: 'calendar_month',
          badge: calendarTasksCount > 0 ? calendarTasksCount : null,
          visible: AuthService.canAccessTab('calendar', currentUser),
        },
        {
          id: 'courses',
          label: 'إضافة وإدارة الدورات',
          icon: 'event_repeat',
          badge: coursesCount,
          visible: AuthService.canAccessTab('courses', currentUser),
        },
      ],
    },
    {
      title: 'الكادر والإحصائيات',
      items: [
        {
          id: 'assistants',
          label: 'الشيوخ والصلاحيات',
          icon: 'badge',
          badge: pendingAssistantsCount > 0 ? `${pendingAssistantsCount} معلق` : null,
          isPendingBadge: pendingAssistantsCount > 0,
          visible: AuthService.canAccessTab('assistants', currentUser),
        },
        {
          id: 'stats',
          label: 'حساب ونسبة الإنجاز',
          icon: 'donut_large',
          badge: null,
          visible: AuthService.canAccessTab('stats', currentUser),
        },
        {
          id: 'daily_alerts',
          label: 'التنبيهات والمهام اليومية',
          icon: 'notifications_active',
          badge: todaysTasksCount > 0 ? `${todaysTasksCount} اليوم` : null,
          isPendingBadge: todaysTasksCount > 0,
          visible: AuthService.canAccessTab('daily_alerts', currentUser),
        },
        {
          id: 'audit',
          label: 'سجل التدقيق',
          icon: 'history',
          badge: null,
          visible: AuthService.canAccessTab('audit', currentUser),
        },
      ],
    },
  ];

  const totalVisibleCount = navSections.reduce(
    (acc, sec) => acc + sec.items.filter((i) => i.visible).length,
    0
  );

  const canAddNewCommittee = AuthService.can('committees.create');

  const handleSelectTab = (tab: NavTab) => {
    setActiveTab(tab);
    setIsOpenMobile(false);
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isOpenMobile && (
        <div
          onClick={() => setIsOpenMobile(false)}
          aria-hidden="true" className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden backdrop-blur-xs transition-opacity duration-300"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:sticky top-0 right-0 h-screen bg-white text-slate-800 border-l border-slate-200/90 flex flex-col z-50 transition-all duration-300 ease-in-out text-right shadow-2xl lg:shadow-none ${
          isOpenDesktop
            ? 'lg:w-60 2xl:w-64 lg:translate-x-0 lg:opacity-100 lg:pointer-events-auto'
            : 'lg:w-0 lg:overflow-hidden lg:border-none lg:opacity-0 lg:pointer-events-none'
        } ${
          isOpenMobile
            ? 'translate-x-0 w-72 sm:w-80 opacity-100 pointer-events-auto'
            : 'max-lg:translate-x-full max-lg:pointer-events-none'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand to-emerald-700 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
              <span className="material-symbols-outlined text-2xl">mosque</span>
            </div>
            <div className="overflow-hidden">
              <h1 className="font-black text-base text-slate-900 leading-tight truncate tracking-tight">
                مسجد الإمام البخاري
              </h1>
              <p className="text-xs text-brand font-extrabold truncate mt-0.5">
                الدورات والمسابقات
              </p>
            </div>
          </div>

          {/* Close button (Mobile Drawer & Desktop Toggle) */}
          <button
            onClick={onToggleSidebar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            title="إغلاق القائمة الجانبية"
            aria-label="إغلاق القائمة الجانبية"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* User Identity Card (Clean, Light & Eye-friendly) */}
        <div className="p-3 bg-gradient-to-l from-emerald-50/80 to-slate-50 border-b border-slate-200/70 shrink-0">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200 shrink-0"></span>
              <span className="font-extrabold text-slate-900 truncate text-xs">
                {currentUser.name}
              </span>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-black border shrink-0 ${
              isSuperAdmin 
                ? 'bg-emerald-100 text-emerald-900 border-emerald-300' 
                : 'bg-blue-50 text-blue-900 border-blue-200'
            }`}>
              {AuthService.getRoleLabel(currentUser.role)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1.5 text-xs text-slate-500 font-semibold">
            <span>الأقسام المتاحة لك:</span>
            <span className="font-mono font-bold text-brand bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
              {isSuperAdmin ? 'كل الأقسام' : `${totalVisibleCount} أقسام`}
            </span>
          </div>
        </div>

        {/* Navigation Tabs (Organized, Categorized, Ordered) */}
        <div className="flex-1 py-3 px-3 space-y-4 overflow-y-auto">
          {navSections.map((section, sIdx) => {
            const visibleSectionItems = section.items.filter((item) => item.visible);
            if (visibleSectionItems.length === 0) return null;

            return (
              <div key={sIdx} className="space-y-1.5">
                <div className="px-3 pb-1 text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600/40"></span>
                  <span>{section.title}</span>
                </div>

                <div className="space-y-1">
                  {visibleSectionItems.map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectTab(item.id)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-gradient-to-l from-brand to-emerald-700 text-white shadow-sm font-extrabold'
                            : 'text-slate-700 hover:bg-slate-100/90 hover:text-brand'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`material-symbols-outlined text-xl ${
                              isActive ? 'text-white' : 'text-slate-400 group-hover:text-brand'
                            }`}
                          >
                            {item.icon}
                          </span>
                          <span>{item.label}</span>
                        </div>

                        {item.badge !== null ? (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                              isActive
                                ? 'bg-white/20 text-white'
                                : item.isPendingBadge
                                ? 'bg-amber-100 text-amber-900 border border-amber-300 font-black animate-pulse'
                                : item.highlight
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-slate-100 text-slate-700'
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
                </div>
              </div>
            );
          })}

          {/* Quick Action: Add New Committee */}
          {canAddNewCommittee && (
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  onOpenNewCommittee();
                  setIsOpenMobile(false);
                }}
                className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-extrabold bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-brand transition-all cursor-pointer shadow-2xs active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-lg">add_circle</span>
                <span>+ إضافة لجنة جديدة</span>
              </button>
            </div>
          )}

          {onOpenSettings && AuthService.can('settings.write') && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  onOpenSettings();
                  setIsOpenMobile(false);
                }}
                className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-extrabold bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">settings</span>
                <span>إعدادات النظام</span>
              </button>
            </div>
          )}

          {/* If non-admin has no granted tabs */}
          {totalVisibleCount === 0 && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs text-center space-y-1">
              <span className="material-symbols-outlined text-2xl text-amber-500 block mb-1">lock</span>
              <p className="font-bold">لا توجد أقسام مفعلة لك حالياً</p>
              <p className="text-xs text-slate-500">يرجى مراجعة فضيلة المشرف العام لمنحك الصلاحيات المناسبة.</p>
            </div>
          )}
        </div>

        {/* Footer info (Clean, subtle) */}
        <div className="p-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 text-center font-medium shrink-0">
          <span>مسجد الإمام البخاري © {new Date().getFullYear()}</span>
        </div>
      </aside>
    </>
  );
};
