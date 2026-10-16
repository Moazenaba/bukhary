import React from 'react';
import { Committee, STAGES_LIST, AppUser, Course, ScheduleTask } from '../types';
import { calculateCurrentStage, todayISO } from '../utils/stageUtils';
import { NavTab } from './Sidebar';

interface HomeOverviewViewProps {
  committees: Committee[];
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
  onNavigateCommittees,
  onOpenDetails,
  onOpenNewCommittee,
  currentUser,
  courses = [],
  scheduleTasks = [],
  onNavigateTab,
}) => {
  const isSuperAdmin = currentUser.role === 'super_admin';
  const total = committees.length;
  const ceremonyCount = committees.filter((c) => c.stages.ceremony?.completed).length;
  const examCount = committees.filter(
    (c) => calculateCurrentStage(c.stages).key === 'exam'
  ).length;
  const scoringCount = committees.filter(
    (c) => calculateCurrentStage(c.stages).key === 'scoring'
  ).length;

  // Today's tasks for quick overview
  const todayIso = todayISO();
  const todayTasks = scheduleTasks.filter((t) => t.date === todayIso);
  const myAssignedCommittees = committees.filter((c) =>
    currentUser.assignedCommittees.includes(c.committeeNumber)
  );

  return (
    <div className="space-y-6 text-right">
      {/* Welcome Banner tailored to User Role */}
      <div className="bg-gradient-to-l from-brand via-[#0f766e] to-brand rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-semibold mb-3">
            <span className="material-symbols-outlined text-sm">verified</span>
            مسابقات مسجد البخاري العلمية
          </span>

          {isSuperAdmin ? (
            <>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">
                منظومة لجان الاختبار والتصحيح لمتون العقيدة
              </h2>
              <p className="text-sm text-teal-50 leading-relaxed mb-4">
                متابعة فورية ومباشرة لمراحل الاختبار: جاري الامتحان، التصحيح، تجميع الدرجات، المراجعة، كتابة الكشوفات، الاعتمادية، إعلان النتيجة، والحفل والتكريم.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => onNavigateCommittees()}
                  className="px-4 py-2 rounded-xl bg-white text-brand font-bold text-xs hover:bg-teal-50 transition-colors cursor-pointer"
                >
                  عرض قائمة اللجان ({total})
                </button>
                <button
                  onClick={onOpenNewCommittee}
                  className="px-4 py-2 rounded-xl bg-brand-light/20 border border-white/40 text-white font-semibold text-xs hover:bg-white/30 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">add_circle</span>
                  <span>تسجيل لجنة جديدة</span>
                </button>
                <button
                  onClick={() => onNavigateTab('calendar')}
                  className="px-4 py-2 rounded-xl bg-emerald-900/60 border border-white/30 text-white font-semibold text-xs hover:bg-emerald-900/80 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">calendar_month</span>
                  <span>جدول تسليمات اليوم</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">
                مرحباً بك: {currentUser.name}
              </h2>
              <p className="text-sm text-teal-50 leading-relaxed mb-4">
                أنت مسجل حالياً بحساب <strong>معاون معتمد</strong> • الصلاحيات المفعلة لك: <strong>{currentUser.permissions.join('، ') || 'لا توجد صلاحيات إضافية'}</strong>.
                {myAssignedCommittees.length > 0
                  ? ` لديك (${myAssignedCommittees.length}) لجان مسندة إليك لمتابعتها وتوثيق استلامها.`
                  : ' يمكنك متابعة جدول أعمالك والتسليمات الميدانية المقررة.'}
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => onNavigateCommittees()}
                  className="px-4 py-2 rounded-xl bg-white text-brand font-bold text-xs hover:bg-teal-50 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">groups</span>
                  <span>عرض لجاني المسندة ({myAssignedCommittees.length})</span>
                </button>
                <button
                  onClick={() => onNavigateTab('calendar')}
                  className="px-4 py-2 rounded-xl bg-brand-light/20 border border-white/40 text-white font-semibold text-xs hover:bg-white/30 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">calendar_month</span>
                  <span>جدول أعمالي وتسليماتي في التقويم</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Decorative background shape */}
        <div className="absolute left-6 -bottom-10 opacity-15 pointer-events-none">
          <span className="material-symbols-outlined text-[180px]">mosque</span>
        </div>
      </div>

      {/* Quick Friday 10/2 Deliverables Spotlight Card */}
      <div className="bg-white rounded-2xl p-5 border border-emerald-300 bg-gradient-to-l from-emerald-50/50 via-teal-50/30 to-white shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-emerald-200">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-xl">calendar_today</span>
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-ink">
                  تسليمات وأعمال اليوم بمسجد البخاري:
                </h3>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white font-mono">
                  {todayTasks.length} أعمال مقررة
                </span>
              </div>
              <p className="text-xs text-muted">
                مواعيد انعقاد اللجان الميدانية، تسليم كراسات الأسئلة، واستلام دفاتر التصحيح
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('calendar')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand hover:bg-success text-white text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
          >
            <span>فتح التقويم والكاليندر بالكامل</span>
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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

      {/* Courses & Rounds Summary Bar */}
      {courses.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-line/50 shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-line/30">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-xl text-brand">event_repeat</span>
              <h3 className="font-bold text-sm sm:text-base text-ink">
                الدورات والمسابقات الموسمية واللجان المربوطة بها:
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('courses')}
              className="text-xs text-brand font-bold hover:underline cursor-pointer"
            >
              إدارة الدورات وإضافة دورة جديدة &larr;
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {courses.slice(0, 3).map((c) => {
              const count = committees.filter((comm) => comm.courseId === c.id).length;
              return (
                <div
                  key={c.id}
                  onClick={() => onNavigateTab('courses')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer hover:border-brand ${
                    c.status === 'active'
                      ? 'bg-emerald-50/40 border-emerald-300'
                      : 'bg-canvas border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-ink text-xs truncate max-w-[180px]">{c.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        c.status === 'active'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {c.status === 'active' ? '⚡ نشطة' : 'مؤرشفة'}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => onNavigateCommittees('exam')}
          className="bg-white p-4 rounded-xl border border-line/50 hover:border-blue-400 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
              🟦
            </span>
            <span className="text-2xl font-bold font-mono text-blue-700">{examCount}</span>
          </div>
          <h3 className="font-bold text-sm text-ink group-hover:text-blue-700 transition-colors">
            جاري الامتحان الآن
          </h3>
          <p className="text-xs text-muted mt-1">لجان الطلاب فيها قيد أداء الاختبار</p>
        </div>

        <div
          onClick={() => onNavigateCommittees('scoring')}
          className="bg-white p-4 rounded-xl border border-line/50 hover:border-amber-400 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              🟠
            </span>
            <span className="text-2xl font-bold font-mono text-amber-700">{scoringCount}</span>
          </div>
          <h3 className="font-bold text-sm text-ink group-hover:text-amber-700 transition-colors">
            في مرحلة التصحيح
          </h3>
          <p className="text-xs text-muted mt-1">لجان يجري تصحيح أوراقها حالياً</p>
        </div>

        <div
          onClick={() => onNavigateCommittees('ceremony')}
          className="bg-white p-4 rounded-xl border border-line/50 hover:border-emerald-400 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              🟢
            </span>
            <span className="text-2xl font-bold font-mono text-emerald-700">{ceremonyCount}</span>
          </div>
          <h3 className="font-bold text-sm text-ink group-hover:text-emerald-700 transition-colors">
            تم الحفل والتكريم
          </h3>
          <p className="text-xs text-muted mt-1">لجان اختتمت مراحلها بالكامل</p>
        </div>

        <div
          onClick={() => onNavigateCommittees()}
          className="bg-white p-4 rounded-xl border border-line/50 hover:border-brand shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="w-10 h-10 rounded-xl bg-tint text-brand flex items-center justify-center font-bold">
              <span className="material-symbols-outlined">menu_book</span>
            </span>
            <span className="text-2xl font-bold font-mono text-brand">{total}</span>
          </div>
          <h3 className="font-bold text-sm text-ink group-hover:text-brand transition-colors">
            إجمالي اللجان المسجلة
          </h3>
          <p className="text-xs text-muted mt-1">موزعة على كافة قاعات مسجد البخاري</p>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
  );
};
