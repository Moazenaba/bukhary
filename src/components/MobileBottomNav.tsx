import React from 'react';
import { AppUser } from '../types';
import { NavTab } from './Sidebar';

interface MobileBottomNavProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  onOpenSidebar: () => void;
  currentUser: AppUser;
  pendingAssistantsCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
  onOpenSidebar,
  currentUser,
  pendingAssistantsCount = 0,
}) => {
  const isSuperAdmin = currentUser.role === 'super_admin';
  const perms = currentUser.permissions || [];

  // Determine which tabs to display in the bottom app bar
  const items: Array<{
    id: NavTab;
    label: string;
    icon: string;
    visible: boolean;
  }> = [
    {
      id: 'summer_course',
      label: 'الكشوفات',
      icon: 'table_chart',
      visible: isSuperAdmin || perms.includes('database_sheets'),
    },
    {
      id: 'committees',
      label: 'اللجان',
      icon: 'groups',
      visible: isSuperAdmin || perms.includes('manage_committees'),
    },
    {
      id: 'exams',
      label: 'الامتحانات',
      icon: 'description',
      visible: isSuperAdmin || perms.includes('exams_pdf'),
    },
    {
      id: 'calendar',
      label: 'التقويم',
      icon: 'calendar_month',
      visible: isSuperAdmin || perms.includes('calendar_schedule'),
    },
  ];

  const visibleItems = items.filter((item) => item.visible);

  return (
    <nav 
      aria-label="شريط التنقل السفلي للهواتف" 
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-2xl px-2 py-1.5 flex items-center justify-around text-center safe-area-bottom"
    >
      {visibleItems.map((item) => {
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`flex-1 py-1 px-1 flex flex-col items-center justify-center transition-all cursor-pointer relative active:scale-90 ${
              isActive ? 'text-[#005c55]' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {/* Active Top Bar Indicator */}
            {isActive && (
              <span className="absolute -top-1.5 w-6 h-1 bg-[#005c55] rounded-full animate-fadeIn" />
            )}
            
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
              isActive ? 'bg-emerald-50 text-[#005c55]' : 'text-slate-500'
            }`}>
              <span className="material-symbols-outlined text-xl">
                {item.icon}
              </span>
            </div>
            
            <span className={`text-[10px] tracking-tight mt-0.5 block truncate max-w-full ${
              isActive ? 'font-black text-[#005c55]' : 'font-semibold text-slate-500'
            }`}>
              {item.label}
            </span>
          </button>
        );
      })}

      {/* "More / Menu" Button that opens the slide-in drawer */}
      <button
        type="button"
        onClick={onOpenSidebar}
        className="flex-1 py-1 px-1 flex flex-col items-center justify-center text-slate-500 hover:text-slate-800 transition-all cursor-pointer relative active:scale-90"
      >
        {pendingAssistantsCount > 0 && (
          <span className="absolute top-0 right-1/4 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        )}
        
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
          <span className="material-symbols-outlined text-xl">
            menu
          </span>
        </div>
        
        <span className="text-[10px] font-semibold text-slate-500 tracking-tight mt-0.5 block truncate">
          القائمة
        </span>
      </button>
    </nav>
  );
};
