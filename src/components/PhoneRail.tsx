import React from 'react';
import { AuthService } from '../services/AuthService';
import { AppUser } from '../types';
import { NavTab } from './Sidebar';

interface PhoneRailProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  currentUser: AppUser;
  pendingAssistantsCount?: number;
  todaysTasksCount?: number;
  /** Opens the drawer (system settings and the rest). Shown only when there is something in it. */
  onOpenMore?: () => void;
}

/** The pages in the order a field manager reaches for them; each opens its own page. */
const ITEMS: Array<{ id: NavTab; label: string; icon: string }> = [
  { id: 'home', label: 'الرئيسية', icon: 'home' },
  { id: 'committees', label: 'اللجان', icon: 'groups' },
  { id: 'summer_course', label: 'الكشوفات', icon: 'table_chart' },
  { id: 'exams', label: 'الامتحانات', icon: 'description' },
  { id: 'ceremonies', label: 'الحفلات', icon: 'celebration' },
  { id: 'calendar', label: 'التقويم', icon: 'calendar_month' },
  { id: 'daily_alerts', label: 'اليوم', icon: 'notifications_active' },
  { id: 'assistants', label: 'الفريق', icon: 'badge' },
  { id: 'stats', label: 'الإحصاء', icon: 'donut_large' },
  { id: 'courses', label: 'الدورات', icon: 'event_repeat' },
  { id: 'audit', label: 'السجل', icon: 'history' },
];

/**
 * Phones only: a thin rail on the right edge. One button per page the person may open, always in view,
 * so nothing sits behind a menu and there is no sideways scrolling to find a page.
 */
export const PhoneRail: React.FC<PhoneRailProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  pendingAssistantsCount = 0,
  todaysTasksCount = 0,
  onOpenMore,
}) => {
  const visible = ITEMS.filter((i) => i.id === 'home' || AuthService.canAccessTab(i.id, currentUser));
  const badge = (id: NavTab) => (id === 'assistants' ? pendingAssistantsCount : id === 'daily_alerts' ? todaysTasksCount : 0);

  return (
    <nav
      aria-label="التنقل بين الصفحات"
      className="lg:hidden fixed right-0 top-14 bottom-0 z-20 w-16 bg-white border-l border-slate-200 flex flex-col items-stretch gap-0.5 py-1.5 overflow-y-auto overscroll-contain"
    >
      {visible.map((item) => {
        const active = activeTab === item.id;
        const n = badge(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            aria-current={active ? 'page' : undefined}
            className={`relative mx-1 py-1.5 rounded-xl flex flex-col items-center gap-0.5 cursor-pointer active:scale-95 transition-colors ${
              active ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span className="material-symbols-outlined text-[22px] leading-none">{item.icon}</span>
            <span className="text-[11px] leading-tight font-bold truncate max-w-full px-0.5">{item.label}</span>
            {n > 0 && (
              <span className="absolute top-0.5 left-1 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-black leading-4 text-center">
                {n > 9 ? '9+' : n}
              </span>
            )}
          </button>
        );
      })}
      {onOpenMore && (
        <button
          type="button"
          onClick={onOpenMore}
          className="mx-1 mt-auto py-1.5 rounded-xl flex flex-col items-center gap-0.5 text-slate-600 hover:bg-slate-100 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[22px] leading-none">more_horiz</span>
          <span className="text-[11px] leading-tight font-bold">المزيد</span>
        </button>
      )}
    </nav>
  );
};
