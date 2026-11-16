import { AuthService } from '../services/AuthService';
import { MyCeremonies } from './CeremonyAttendees';
import React, { useMemo } from 'react';
import { Committee, STAGES_LIST, AppUser, Course, ScheduleTask } from '../types';
import { calculateCurrentStage, todayISO } from '../utils/stageUtils';
import { overdueCommittees } from '../utils/overdue';
import { OverduePanel } from './OverduePanel';
import { useSettings } from '../data/queries';
import { NavTab } from './Sidebar';
import { PageHeader, primaryAction, quietAction } from './ui/PageHeader';

interface HomeOverviewViewProps {
  /** Committees of the current course: every figure on this page is about that course alone. */
  committees: Committee[];
  /** Committees of every course, only to count each course in the course list. */
  allCommittees?: Committee[];
  currentCourseId?: string;
  onNavigateCommittees: (stageFilter?: string) => void;
  onOpenDetails: (committee: Committee) => void;
  onOpenNewCommittee: () => void;
  currentUser: AppUser;
  courses?: Course[];
  scheduleTasks?: ScheduleTask[];
  onNavigateTab: (tab: NavTab) => void;
}

export const HomeOverviewView: React.FC<HomeOverviewViewProps> = ({
  committees,
  allCommittees = committees,
  currentCourseId,
  onNavigateCommittees,
  onOpenDetails,
  onOpenNewCommittee,
  currentUser,
  courses = [],
  scheduleTasks = [],
  onNavigateTab,
}) => {
  const isAdmin = currentUser.role === 'super_admin' || currentUser.role === 'admin';
  const total = committees.length;
  const ceremonyCount = committees.filter((c) => c.stages.ceremony?.completed).length;
  const { settings } = useSettings();
  const overdue = useMemo(
    () => overdueCommittees(committees, { overdueDays: settings.overdue_days, tasks: scheduleTasks }),
    [committees, settings.overdue_days, scheduleTasks]
  );
  // «في انتظار الامتحان» = only registered; «تم الامتحان» = waiting for correction.
  const examCount = committees.filter((c) => calculateCurrentStage(c.stages).key === 'registration').length;
  const scoringCount = committees.filter((c) => calculateCurrentStage(c.stages).key === 'exam').length;

  // Today's tasks for quick overview
  const todayIso = todayISO();
  const todayTasks = scheduleTasks.filter((t) => t.date === todayIso);
  // Committees assigned to this user, by id (the server's scope).
  const scope = AuthService.getPermissions()?.committeeScope;
  const myAssignedCommittees = Array.isArray(scope) ? committees.filter((c) => scope.includes(c.id)) : [];

  const firstName = currentUser.name.trim().split(/\s+/).slice(0, 2).join(' ');
  return (
    <>
    <PageHeader
      icon="home"
      title={`أهلاً، ${firstName}`}
      subtitle={`${AuthService.getRoleLabel(currentUser.role)} · ${total} لجنة${
        !isAdmin ? ` · ${myAssignedCommittees.length} مسندة إليك` : ''
      }`}
      actions={
        <>
          <button type="button" onClick={() => onNavigateCommittees()} className={primaryAction}>
            <span className="material-symbols-outlined text-lg">groups</span>
            <span>{isAdmin ? `اللجان (${total})` : `لجاني (${myAssignedCommittees.length})`}</span>
          </button>
          {isAdmin && AuthService.can('committees.create') && (
            <button type="button" onClick={onOpenNewCommittee} className={quietAction}>
              <span className="material-symbols-outlined text-lg">add</span>
              <span>لجنة جديدة</span>
            </button>
          )}
        </>
      }
    />
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 text-right items-start">
      {/* What needs attention now comes first (the right column on a wide screen, the top on a narrow one). */}
      <div className="xl:col-span-1 xl:order-1 space-y-6 min-w-0">
      <MyCeremonies committees={committees} scheduleTasks={scheduleTasks} onOpenCommitteeDetails={onOpenDetails} />
      <OverduePanel items={overdue} overdueDays={settings.overdue_days} onOpen={onOpenDetails} onShowAll={() => onNavigateCommittees('late')} />

      {/* Today's work: what is due, with a way into the full calendar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-emerald-300 shadow-xs">
        <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-emerald-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl">calendar_today</span>
            </span>
            <h3 className="font-bold text-base text-ink">أعمال اليوم</h3>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white font-mono">{todayTasks.length}</span>
          </div>
          <button type="button" onClick={() => onNavigateTab('calendar')} className="text-xs text-brand font-bold hover:underline cursor-pointer shrink-0">
            التقويم &larr;
          </button>
        </div>
        {todayTasks.length === 0 && <p className="text-sm text-muted">لا توجد أعمال مجدولة اليوم.</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-3">
          {todayTasks.slice(0, 4).map((task) => (
            <div
              key={task.id}
              onClick={() => onNavigateTab('calendar')}
              className={`p-3 rounded-xl border text-xs transition-all cursor-pointer hover:shadow-xs space-y-1.5 ${
                task.completed
                  ? 'bg-emerald-50/60 border-emerald-200'
                  : task.priority === 'urgent'
                  ? 'bg-red-50/50 border-red-200 hover:border-red-300'
                  : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-gray-500 font-bold">⏰ {task.time || 'صباحاً'}</span>
                <span
                  className={`text-xs px-1.5 py-0.2 rounded font-bold ${
                    task.completed
                      ? 'bg-emerald-200 text-emerald-900'
                      : task.priority === 'urgent'
                      ? 'bg-red-200 text-red-900'
                      : 'bg-blue-100 text-blue-900'
                  }`}
                >
                  {task.completed ? '✓ تم' : 'عاجل'}
                </span>
              </div>
              <h4 className="font-bold text-xs text-ink line-clamp-1">{task.title}</h4>
              {task.deliverable && (
                <p className="text-xs text-brand font-semibold truncate">
                  📦 {task.deliverable}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      </div>
      <div className="xl:col-span-2 xl:order-2 space-y-6 min-w-0">
      {/* Courses & Rounds Summary Bar */}
      {courses.length > 0 && (
        <div className="max-lg:hidden bg-white rounded-2xl p-5 border border-line/50 shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-line/30">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-xl text-brand">event_repeat</span>
              <h3 className="font-bold text-sm sm:text-base text-ink">
                الدورات والمسابقات الموسمية واللجان المربوطة بها:
              </h3>
            </div>
            {AuthService.canAccessTab('courses') && (
              <button
                onClick={() => onNavigateTab('courses')}
                className="text-xs text-brand font-bold hover:underline cursor-pointer"
              >
                إدارة الدورات وإضافة دورة جديدة &larr;
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3 gap-3 text-xs">
            {courses.map((c) => {
              const count = allCommittees.filter((comm) => comm.courseId === c.id).length;
              return (
                <div
                  key={c.id}
                  onClick={() => onNavigateTab('courses')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer hover:border-brand ${
                    c.id === currentCourseId
                      ? 'bg-emerald-50/40 border-emerald-500 ring-2 ring-emerald-400/30'
                      : 'bg-canvas border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span title={c.name} className="font-bold text-ink text-xs truncate max-w-[180px]">{c.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        c.status === 'active'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {c.id === currentCourseId ? 'معروضة الآن' : c.status === 'active' ? '⚡ نشطة' : 'مؤرشفة'}
                    </span>
                  </div>
                  <span className="text-xs text-muted block">
                    عدد اللجان المربوطة: <strong className="text-brand font-mono">{count} لجنة</strong>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4 Quick Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4 gap-2.5 sm:gap-4">
        <div
          onClick={() => onNavigateCommittees('registration')}
          className="bg-white p-3 sm:p-4 rounded-xl border border-line/50 hover:border-blue-400 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <span className="max-sm:hidden w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
              🟦
            </span>
            <span className="text-2xl font-bold font-mono text-blue-700">{examCount}</span>
          </div>
          <h3 className="font-bold text-sm text-ink group-hover:text-blue-700 transition-colors">
            في انتظار الامتحان
          </h3>
          <p className="text-xs text-muted mt-1 max-sm:hidden">لجان الطلاب فيها قيد أداء الاختبار</p>
        </div>

        <div
          onClick={() => onNavigateCommittees('exam')}
          className="bg-white p-3 sm:p-4 rounded-xl border border-line/50 hover:border-amber-400 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <span className="max-sm:hidden w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              🟠
            </span>
            <span className="text-2xl font-bold font-mono text-amber-700">{scoringCount}</span>
          </div>
          <h3 className="font-bold text-sm text-ink group-hover:text-amber-700 transition-colors">
            تم الامتحان (للتصحيح)
          </h3>
          <p className="text-xs text-muted mt-1 max-sm:hidden">لجان يجري تصحيح أوراقها حالياً</p>
        </div>

        <div
          onClick={() => onNavigateCommittees('ceremony')}
          className="bg-white p-3 sm:p-4 rounded-xl border border-line/50 hover:border-emerald-400 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <span className="max-sm:hidden w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              🟢
            </span>
            <span className="text-2xl font-bold font-mono text-emerald-700">{ceremonyCount}</span>
          </div>
          <h3 className="font-bold text-sm text-ink group-hover:text-emerald-700 transition-colors">
            تم الحفل والتكريم
          </h3>
          <p className="text-xs text-muted mt-1 max-sm:hidden">لجان اختتمت مراحلها بالكامل</p>
        </div>

        <div
          onClick={() => onNavigateCommittees()}
          className="max-sm:hidden bg-white p-3 sm:p-4 rounded-xl border border-line/50 hover:border-brand shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <span className="max-sm:hidden w-10 h-10 rounded-xl bg-tint text-brand flex items-center justify-center font-bold">
              <span className="material-symbols-outlined">menu_book</span>
            </span>
            <span className="text-2xl font-bold font-mono text-brand">{total}</span>
          </div>
          <h3 className="font-bold text-sm text-ink group-hover:text-brand transition-colors">
            إجمالي اللجان المسجلة
          </h3>
          <p className="text-xs text-muted mt-1 max-sm:hidden">موزعة على كافة قاعات مسجد البخاري</p>
        </div>
      </div>

      {/* Live spotlight */}
      <div className="bg-white rounded-2xl p-5 border border-line/50 shadow-xs">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-line/30">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <h3 className="font-bold text-base text-ink">
              أحدث اللجان في المنظومة
            </h3>
          </div>
          <button
            onClick={() => onNavigateCommittees()}
            className="text-xs text-brand font-semibold hover:underline"
          >
            عرض كافة اللجان &larr;
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
          {committees.slice(0, 3).map((comm) => {
            const status = calculateCurrentStage(comm.stages);
            return (
              <div
                key={comm.id}
                onClick={() => onOpenDetails(comm)}
                className="bg-canvas p-4 rounded-xl border border-line/40 hover:border-brand transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs font-mono text-brand">
                    لجنة #{comm.committeeNumber}
                  </span>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${status.badgeClass}`}
                  >
                    {status.emoji} {status.label}
                  </span>
                </div>
                <h4 className="font-bold text-xs text-ink mb-1 truncate">
                  {comm.committeeName}
                </h4>
                <p className="text-xs text-brand font-semibold mb-2 truncate">
                  {comm.competitionBook}
                </p>
                <div className="flex items-center justify-between pt-2 border-t border-line/20 text-xs text-muted">
                  <span>{comm.branch}</span>
                  <span className="text-brand font-bold">عرض التفاصيل &larr;</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>
    </>
  );
};

