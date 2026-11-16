import React, { useState } from 'react';
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
  const [showNames, setShowNames] = useState(false);
  const visible = ITEMS.filter((i) => i.id === 'home' || AuthService.canAccessTab(i.id, currentUser));
  const badge = (id: NavTab) => (id === 'assistants' ? pendingAssistantsCount : id === 'daily_alerts' ? todaysTasksCount : 0);
  const go = (id: NavTab) => {
    setActiveTab(id);
    setShowNames(false);
  };

  return (
    <>
      {/* The names, on demand: laid over the page so the rail itself stays thin. */}
      {showNames && (
        <>
          <button type="button" aria-label="إغلاق" className="lg:hidden fixed inset-0 z-30 bg-slate-900/30" onClick={() => setShowNames(false)} />
          <div role="menu" className="lg:hidden fixed right-12 top-12 z-40 w-52 max-h-[calc(100vh-4rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
            {visible.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() => go(item.id)}
                  className={`w-full min-h-11 px-3 rounded-xl flex items-center gap-3 text-sm font-bold cursor-pointer ${active ? 'bg-brand text-white' : 'text-ink hover:bg-slate-100'}`}
                >
                  <span className="material-symbols-outlined text-xl">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      <nav
        aria-label="التنقل بين الصفحات"
        className="lg:hidden fixed right-0 top-12 bottom-0 z-40 w-12 bg-white border-l border-slate-200 flex flex-col items-center gap-0.5 py-1 overflow-y-auto overscroll-contain"
      >
        <button
          type="button"
          onClick={() => setShowNames((v) => !v)}
          aria-label="أسماء الصفحات"
          aria-expanded={showNames}
          className="w-11 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[22px] leading-none">{showNames ? 'close' : 'menu_open'}</span>
        </button>
        {visible.map((item) => {
          const active = activeTab === item.id;
          const n = badge(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => go(item.id)}
              aria-label={item.label}
              title={item.label}
              aria-current={active ? 'page' : undefined}
              className={`relative w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer active:scale-95 transition-colors shrink-0 ${
                active ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="material-symbols-outlined text-[24px] leading-none">{item.icon}</span>
              {n > 0 && (
                <span className="absolute top-0.5 left-0.5 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-xs font-black leading-4 text-center">
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
            aria-label="المزيد"
            title="المزيد"
            className="mt-auto w-11 h-11 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[24px] leading-none">more_horiz</span>
          </button>
        )}
      </nav>
    </>
  );
};
