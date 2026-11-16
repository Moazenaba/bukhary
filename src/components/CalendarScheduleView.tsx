import React, { useState, useMemo } from 'react';
import { PageHeader, primaryAction, quietAction } from './ui/PageHeader';
import { todayISO } from '../utils/stageUtils';
import { ScheduleTask, Committee, AppUser } from '../types';
import { AuthService } from '../services/AuthService';
import { AssigneeSelect, CommitteeSelect } from './AssigneeSelect';

interface CalendarScheduleViewProps {
  tasks: ScheduleTask[];
  committees: Committee[];
  currentUser: AppUser;
  /** Resolves to true once the server saved the task. */
  onAddTask: (task: Omit<ScheduleTask, 'id'>) => boolean | void | Promise<boolean | void>;
  onToggleTaskComplete: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onOpenCommitteeDetails?: (committee: Committee) => void;
  onUpdateCommitteeCeremony?: (
    committeeId: string,
    ceremonyInfo: {
      date: string;
      time: string;
      place: string;
      notes?: string;
      completed: boolean;
      honoredCount?: number;
      attendingSheikhs?: string[];
    }
  ) => unknown;
}

export const CalendarScheduleView: React.FC<CalendarScheduleViewProps> = ({
  tasks,
  committees,
  currentUser,
  onAddTask,
  onToggleTaskComplete,
  onDeleteTask,
  onOpenCommitteeDetails,
  onUpdateCommitteeCeremony,
}) => {
  // Current view date (year and month). Defaults to today
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayISO());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'all' | 'mine' | 'deliverables'>('all');

  // Delivery / Task Mode: manual delivery vs ceremony
  const [deliveryMode, setDeliveryMode] = useState<'manual' | 'ceremony'>('manual');

  // Ceremony specific states
  const [ceremonyCommitteeId, setCeremonyCommitteeId] = useState<string>('');

  const [ceremonyHonoredCount, setCeremonyHonoredCount] = useState<number | ''>('');
  const [ceremonySheikhs, setCeremonySheikhs] = useState<string[]>([]);
  const [ceremonyNewSheikhInput, setCeremonyNewSheikhInput] = useState<string>('');
  const [ceremonyDate, setCeremonyDate] = useState<string>(todayISO());
  const [ceremonyTime, setCeremonyTime] = useState<string>('');
  const [ceremonyPlace, setCeremonyPlace] = useState<string>('مسجد الإمام البخاري');
  const [ceremonyNotes, setCeremonyNotes] = useState<string>('');

  // Generate dynamic quick switcher days starting from current date
  const quickDates = useMemo(() => {
    const dates = [];
    const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const iso = todayISO(d);
      const dayOfWeek = d.getDay();
      const label = i === 0 ? `اليوم (${dayNames[dayOfWeek]} ${d.getDate()}/${d.getMonth() + 1})` : `${dayNames[dayOfWeek]} ${d.getDate()}/${d.getMonth() + 1}`;
      dates.push({ dateStr: iso, label, isFriday: dayOfWeek === 5 });
    }
    return dates;
  }, []);

  // New task form state
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDate, setNewTaskDate] = useState(todayISO());
  const [newTaskTime, setNewTaskTime] = useState('10:00 ص');
  const [newTaskDeliverable, setNewTaskDeliverable] = useState('');
  const [newTaskCommitteeId, setNewTaskCommitteeId] = useState<string>('');
  const [newTaskPriority, setNewTaskPriority] = useState<'urgent' | 'high' | 'normal'>('urgent');
  const [newTaskType, setNewTaskType] = useState<'delivery' | 'receive' | 'exam' | 'scoring' | 'review' | 'general'>('delivery');
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState<string>(currentUser.id);
  const [saving, setSaving] = useState(false);
  // Controls follow the server's permissions (WEB-09).
  const canWriteTasks = AuthService.can('tasks.write');
  const canScheduleCeremonies = AuthService.can('committees.finalize');
  // "My tasks": assigned to me (by id), or linked to a committee assigned to me.
  const inMyCommittees = (committeeId?: string) => {
    const scope = AuthService.getPermissions()?.committeeScope;
    return Boolean(committeeId) && Array.isArray(scope) && scope.includes(committeeId as string);
  };
  const [newTaskNotes, setNewTaskNotes] = useState('');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  // Month navigation
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };
  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDateStr(todayISO(today));
  };

  // Days in month calculation
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday, 6 is Saturday

  // Arabic days headers (start with Saturday)
  const arabicDayNames = [
    { name: 'السبت', short: 'سبت' },
    { name: 'الأحد', short: 'أحد' },
    { name: 'الاثنين', short: 'اثنين' },
    { name: 'الثلاثاء', short: 'ثلاثاء' },
    { name: 'الأربعاء', short: 'أربعاء' },
    { name: 'الخميس', short: 'خميس' },
    { name: 'الجمعة', short: 'جمعة' },
  ];

  // Map JS getDay() (0: Sun ... 6: Sat) to Saturday-first index (0: Sat ... 6: Fri)
  const offsetToSaturday = (dayIdx: number) => {
    return (dayIdx + 1) % 7;
  };

  const startOffset = offsetToSaturday(firstDayIndex);

  // Month name in Arabic
  const monthNamesArabic = [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ];

  // Helper to format date string YYYY-MM-DD
  const formatDateString = (y: number, m: number, d: number) => {
    const mm = String(m + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  };

  // Group tasks by date
  const tasksByDate = useMemo(() => {
    const map: Record<string, ScheduleTask[]> = {};
    tasks.forEach((t) => {
      if (!map[t.date]) map[t.date] = [];
      map[t.date].push(t);
    });
    return map;
  }, [tasks]);

  // Tasks for the currently selected day
  const selectedDayTasks = tasksByDate[selectedDateStr] || [];

  // Filtered tasks for the currently selected day
  const displayedDayTasks = useMemo(() => {
    let list = selectedDayTasks;
    if (taskFilter === 'mine') {
      list = list.filter(
        (t) =>
          t.assignedAssistantId === currentUser.id || inMyCommittees(t.committeeId)
      );
    } else if (taskFilter === 'deliverables') {
      list = list.filter((t) => !!t.deliverable);
    }
    return list;
  }, [selectedDayTasks, taskFilter, currentUser]);

  const myTasksCount = useMemo(() => {
    return selectedDayTasks.filter(
      (t) =>
        t.assignedAssistantId === currentUser.id || inMyCommittees(t.committeeId)
    ).length;
  }, [selectedDayTasks, currentUser]);

  const deliverablesCount = useMemo(() => {
    return selectedDayTasks.filter((t) => !!t.deliverable).length;
  }, [selectedDayTasks]);

  // Parse Arabic day name for selected date
  const selectedDayInfo = useMemo(() => {
    const [y, m, d] = selectedDateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeek = dateObj.getDay();
    const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    return {
      dayName: dayNames[dayOfWeek],
      formatted: `${d} ${monthNamesArabic[m - 1]} ${y}`,
      shortDate: `${d}/${m}`,
      isFriday: dayOfWeek === 5,
    };
  }, [selectedDateStr]);

  const handleOpenAddModal = (dateStr?: string) => {
    const targetDate = dateStr || selectedDateStr;
    setDeliveryMode('manual');
    setNewTaskDate(targetDate);
    setNewTaskTitle('');
    setNewTaskDeliverable('');
    setNewTaskNotes('');
    setNewTaskCommitteeId('');
    setNewTaskPriority('urgent');
    setNewTaskType('delivery');
    setNewTaskTime('09:00 ص');
    setNewTaskAssigneeId(currentUser.id);
    setIsAddModalOpen(true);
  };

  const handleOpenAddCeremonyModal = (dateStr?: string) => {
    const targetDate = dateStr || selectedDateStr;
    setDeliveryMode('ceremony');
    setCeremonyDate(targetDate);
    const firstComm = committees.find((c) => AuthService.canOnCommittee('committees.finalize', c));
    if (firstComm) {
      setCeremonyCommitteeId(firstComm.id);
      setCeremonyHonoredCount(firstComm.ceremonyDetails?.honoredStudentsCount ?? firstComm.studentsCount ?? '');
      setCeremonySheikhs(
        firstComm.ceremonyDetails?.attendingSheikhs?.length
          ? [...firstComm.ceremonyDetails.attendingSheikhs]
          : firstComm.sheikhName
          ? [firstComm.sheikhName]
          : []
      );
      setCeremonyPlace(firstComm.ceremonyDetails?.ceremonyPlace || firstComm.branch || '');
      setCeremonyTime(firstComm.ceremonyDetails?.ceremonyTime || '');
      setCeremonyNotes(firstComm.ceremonyDetails?.notes || '');
    }
    setIsAddModalOpen(true);
  };

  const handleAddCeremonySheikh = () => {
    const trimmed = ceremonyNewSheikhInput.trim();
    if (!trimmed) return;
    if (!ceremonySheikhs.includes(trimmed)) {
      setCeremonySheikhs([...ceremonySheikhs, trimmed]);
    }
    setCeremonyNewSheikhInput('');
  };

  const handleRemoveCeremonySheikh = (idx: number) => {
    setCeremonySheikhs(ceremonySheikhs.filter((_, i) => i !== idx));
  };

  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (deliveryMode === 'ceremony') {
      // The ceremony is stored on the committee; the server creates its single calendar task (WEB-08).
      const selectedComm = committees.find((c) => c.id === ceremonyCommitteeId);
      if (!selectedComm || !onUpdateCommitteeCeremony) return;
      const sheikhs = ceremonySheikhs.length > 0 ? ceremonySheikhs : selectedComm.sheikhName ? [selectedComm.sheikhName] : [];
      const count = ceremonyHonoredCount !== '' ? Number(ceremonyHonoredCount) : selectedComm.studentsCount || undefined;
      setSaving(true);
      try {
        const ok = await onUpdateCommitteeCeremony(selectedComm.id, {
          date: ceremonyDate,
          time: ceremonyTime.trim(),
          place: ceremonyPlace.trim() || selectedComm.branch || '',
          notes: ceremonyNotes.trim(),
          completed: Boolean(selectedComm.stages.ceremony?.completed),
          honoredCount: count,
          attendingSheikhs: sheikhs,
        });
        if (ok !== false) setIsAddModalOpen(false);
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!newTaskTitle.trim()) return;
    setSaving(true);
    try {
      const ok = await onAddTask({
        title: newTaskTitle.trim(),
        date: newTaskDate,
        time: newTaskTime.trim() || undefined,
        deliverable: newTaskDeliverable.trim() || undefined,
        committeeId: newTaskCommitteeId || undefined,
        assignedAssistantId: newTaskAssigneeId || undefined,
        type: newTaskType,
        priority: newTaskPriority,
        completed: false,
        notes: newTaskNotes.trim() || undefined,
      });
      if (ok !== false) setIsAddModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-right">
      <PageHeader
        icon="calendar_month"
        title="التقويم والمواعيد"
        subtitle={`${selectedDayInfo.dayName} ${selectedDayInfo.shortDate}`}
        actions={
          <>
            <button type="button" onClick={() => handleOpenAddModal(selectedDateStr)} hidden={!canWriteTasks} className={primaryAction}>
              <span className="material-symbols-outlined text-lg">add_task</span>
              <span>إضافة عمل</span>
            </button>
            <button type="button" onClick={goToToday} className={quietAction}>
              <span className="material-symbols-outlined text-lg">today</span>
              <span>اليوم</span>
            </button>
          </>
        }
      />

      {/* Quick Upcoming Days Strip (الوصول السريع للأيام ومواعيد الجمعة) */}
      <div className="bg-white rounded-2xl border border-line/60 p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-lg">event_upcoming</span>
            </span>
            <div>
              <span className="font-bold text-sm text-ink block">الأيام القادمة</span>
              <span className="text-xs text-muted">اضغط على يوم لعرض أعماله</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pb-1">
          {quickDates.map((q) => {
            const isSelected = selectedDateStr === q.dateStr;
            const dayTasksCount = tasksByDate[q.dateStr]?.length || 0;
            return (
              <button
                key={q.dateStr}
                type="button"
                onClick={() => {
                  setSelectedDateStr(q.dateStr);
                  const [y, m] = q.dateStr.split('-').map(Number);
                  if (m - 1 !== month || y !== year) {
                    setCurrentDate(new Date(y, m - 1, 1));
                  }
                }}
                className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-2 border cursor-pointer active:scale-95 ${
                  isSelected
                    ? 'bg-brand text-white border-brand shadow-sm ring-2 ring-brand/30'
                    : q.isFriday
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950 hover:bg-emerald-100'
                    : 'bg-canvas border-gray-200 text-ink hover:bg-gray-100'
                }`}
              >
                <span>{q.label}</span>
                {dayTasksCount > 0 && (
                  <span
                    className={`text-xs font-mono px-1.5 py-0.2 rounded-full font-bold ${
                      isSelected ? 'bg-white text-brand' : 'bg-red-500 text-white'
                    }`}
                  >
                    {dayTasksCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Calendar on Right / Day Details on Left */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* RIGHT COLUMN: CALENDAR GRID (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-line/60 p-5 shadow-xs space-y-4">
          {/* Calendar Header with Navigation */}
          <div className="flex items-center justify-between pb-3 border-b border-line/30">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base sm:text-lg text-ink">
                {monthNamesArabic[month]} {year}
              </h3>
              <span className="text-xs text-muted font-semibold">
                ({new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { month: 'long', year: 'numeric' }).format(new Date(year, month, 15))})
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={prevMonth}
                className="p-2 rounded-xl text-ink-soft hover:bg-tint border border-line/50 transition-colors cursor-pointer"
                title="الشهر السابق"
              >
                <span className="material-symbols-outlined text-lg">chevron_right</span>
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="p-2 rounded-xl text-ink-soft hover:bg-tint border border-line/50 transition-colors cursor-pointer"
                title="الشهر التالي"
              >
                <span className="material-symbols-outlined text-lg">chevron_left</span>
              </button>
            </div>
          </div>

          {/* Weekday Labels (Saturday to Friday) */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-muted py-1">
            {arabicDayNames.map((d, i) => (
              <div
                key={d.name}
                className={`py-1.5 rounded-lg ${
                  i === 6 ? 'text-emerald-800 bg-emerald-50/70 font-extrabold' : ''
                }`}
              >
                {d.name}
              </div>
            ))}
          </div>

          {/* Month Days Grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {/* Empty slots before first day */}
            {Array.from({ length: startOffset }).map((_, idx) => (
              <div key={`empty-${idx}`} className="h-20 sm:h-24 rounded-xl bg-gray-50/50 border border-transparent" />
            ))}

            {/* Days of month */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const dateStr = formatDateString(year, month, dayNum);
              const dayTasks = tasksByDate[dateStr] || [];
              const isSelected = selectedDateStr === dateStr;
              const isFriday = (startOffset + idx) % 7 === 6;
              const hasUrgent = dayTasks.some((t) => t.priority === 'urgent' && !t.completed);

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setSelectedDateStr(dateStr)}
                  className={`h-20 sm:h-24 p-1.5 rounded-xl border text-right transition-all cursor-pointer flex flex-col justify-between relative group ${
                    isSelected
                      ? 'border-brand bg-brand/10 ring-2 ring-brand/40 shadow-xs'
                      : isFriday
                      ? 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-400'
                      : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50'
                  }`}
                >
                  {/* Day Number & Header */}
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs font-mono ${
                        isSelected
                          ? 'bg-brand text-white'
                          : isFriday
                          ? 'bg-emerald-200/80 text-emerald-900 font-extrabold'
                          : 'text-ink'
                      }`}
                    >
                      {dayNum}
                    </span>

                    {/* Badge for tasks count */}
                    {dayTasks.length > 0 && (
                      <span
                        className={`text-xs font-bold px-1.5 py-0.2 rounded-full font-mono ${
                          hasUrgent
                            ? 'bg-red-500 text-white animate-pulse'
                            : 'bg-emerald-600 text-white'
                        }`}
                        title={`${dayTasks.length} أعمال وتسليمات`}
                      >
                        {dayTasks.length}
                      </span>
                    )}
                  </div>

                  {/* Tasks Snippets */}
                  <div className="w-full space-y-1 overflow-hidden">
                    {dayTasks.slice(0, 2).map((t) => (
                      <div
                        key={t.id}
                        className={`text-xs font-semibold truncate rounded px-1 py-0.5 leading-tight ${
                          t.completed
                            ? 'line-through text-gray-400 bg-gray-100'
                            : t.priority === 'urgent'
                            ? 'bg-red-50 text-red-800 border border-red-200'
                            : 'bg-emerald-50 text-emerald-800'
                        }`}
                      >
                        {t.title}
                      </div>
                    ))}
                    {dayTasks.length > 2 && (
                      <span className="text-xs text-gray-500 block font-mono">
                        +{dayTasks.length - 2} أخرى...
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Calendar Legend */}
          <div className="pt-3 border-t border-line/30 flex items-center justify-between text-xs text-muted flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span>يوم الجمعة (مواعيد اللجان)</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                <span>تسليم عاجل ومهم</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-300"></span>
                <span>تم الإنجاز</span>
              </span>
            </div>
            <span>انقر على أي يوم لمعاينة كافة أعماله</span>
          </div>
        </div>

        {/* LEFT COLUMN: SELECTED DAY DETAILS & TASKS (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-line/60 p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            {/* Selected Date Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-line/30">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-brand text-white flex items-center justify-center font-bold text-sm">
                    <span className="material-symbols-outlined text-lg">event</span>
                  </span>
                  <div>
                    <h3 className="font-bold text-base text-ink leading-snug">
                      {selectedDayInfo.dayName}، {selectedDayInfo.formatted}
                    </h3>
                    <span className="text-xs text-muted">
                      (الموافق: {selectedDayInfo.shortDate})
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenAddCeremonyModal(selectedDateStr)}
                  hidden={!canScheduleCeremonies}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-xs active:scale-95"
                  title="إضافة ميعاد حفل تكريم وتوزيع جوائز للجنة في هذا اليوم"
                >
                  <span className="text-sm">🎉</span>
                  <span>إضافة حفلة</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenAddModal(selectedDateStr)}
            hidden={!canWriteTasks}
                  className="px-3 py-1.5 rounded-xl bg-brand hover:bg-success text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  <span>إضافة تسليم</span>
                </button>
              </div>
            </div>

            {/* Summary Alert Box for that Day */}
            <div
              className={`mt-4 p-3.5 rounded-xl border text-xs flex items-center justify-between ${
                selectedDayTasks.length > 0
                  ? selectedDayInfo.isFriday
                    ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-medium'
                    : 'bg-teal-50 border-teal-200 text-teal-950'
                  : 'bg-gray-50 border-gray-200 text-gray-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-xl text-emerald-700">checklist</span>
                <div>
                  <span className="font-bold block text-sm">
                    {selectedDayTasks.length > 0
                      ? `لديك (${selectedDayTasks.length}) أعمال وتسليمات مطلوبة في هذا اليوم`
                      : 'لا توجد تسليمات مسجلة لهذا اليوم حتى الآن'}
                  </span>
                  {selectedDayInfo.isFriday && (
                    <span className="text-xs text-emerald-800">
                      يوم الجمعة هو الموعد الرسمي لانعقاد اللجان الميدانية بمسجد البخاري.
                    </span>
                  )}
                </div>
              </div>

              {selectedDayTasks.length > 0 && (
                <span className="text-xs font-mono font-bold bg-white px-2.5 py-1 rounded-lg border border-emerald-200 shadow-2xs">
                  {selectedDayTasks.filter((t) => t.completed).length} / {selectedDayTasks.length} تم
                </span>
              )}
            </div>

            {/* Task Filter Tabs */}
            <div className="mt-3 flex items-center gap-1.5 border-b border-line/30 pb-2 text-xs">
              <button
                type="button"
                onClick={() => setTaskFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  taskFilter === 'all'
                    ? 'bg-brand text-white shadow-2xs'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                الكل ({selectedDayTasks.length})
              </button>
              <button
                type="button"
                onClick={() => setTaskFilter('mine')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  taskFilter === 'mine'
                    ? 'bg-brand text-white shadow-2xs'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                مهامي المكلف بها ({myTasksCount})
              </button>
              <button
                type="button"
                onClick={() => setTaskFilter('deliverables')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  taskFilter === 'deliverables'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-gray-600 hover:bg-amber-50'
                }`}
              >
                📦 تسليمات فقط ({deliverablesCount})
              </button>
            </div>

            {/* Tasks Cards List for Selected Day */}
            <div className="mt-3 space-y-3 max-h-[480px] overflow-y-auto pe-1">
              {displayedDayTasks.map((task) => {
                const linkedCommittee = task.committeeNumber
                  ? committees.find((c) => c.committeeNumber === task.committeeNumber)
                  : undefined;

                return (
                  <div
                    key={task.id}
                    className={`p-3.5 rounded-xl border transition-all space-y-2 ${
                      task.completed
                        ? 'bg-gray-50/80 border-gray-200 opacity-75'
                        : task.priority === 'urgent'
                        ? 'bg-red-50/40 border-red-200 hover:border-red-400'
                        : 'bg-white border-line/60 hover:border-brand/50 shadow-2xs'
                    }`}
                  >
                    {/* Task Title & Status Toggle */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleTaskComplete(task.id)}
                          disabled={!(canWriteTasks || task.assignedAssistantId === currentUser.id)}
                          className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold transition-colors cursor-pointer mt-0.5 shrink-0 ${
                            task.completed
                              ? 'bg-emerald-600 text-white'
                              : 'border-2 border-gray-300 hover:border-brand'
                          }`}
                          title={task.completed ? 'إلغاء التأشير كمكتمل' : 'تأشير كتم التسليم والإنجاز'}
                        >
                          {task.completed ? '✓' : ''}
                        </button>

                        <div>
                          <h4
                            className={`font-bold text-xs sm:text-sm text-ink leading-snug ${
                              task.completed ? 'line-through text-gray-500' : ''
                            }`}
                          >
                            {task.title}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
                            <span className="font-mono">⏰ {task.time || 'صباحاً'}</span>
                            {task.assignedAssistantName && (
                              <>
                                <span>•</span>
                                <span>👤 المكلف: {task.assignedAssistantName}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-md shrink-0 ${
                          task.completed
                            ? 'bg-emerald-100 text-emerald-800'
                            : task.priority === 'urgent'
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {task.completed ? '✓ تم التسليم' : task.priority === 'urgent' ? 'عاجل اليوم' : 'مجدول'}
                      </span>
                    </div>

                    {/* Deliverable Box ("واللي محتاج أسلمها وكده") */}
                    {task.deliverable && (
                      <div className="bg-canvas p-2.5 rounded-lg border border-line/40 text-xs">
                        <span className="font-bold text-ink block text-xs mb-0.5 flex items-center gap-1">
                          <span>📦 المطلوب تسليمه:</span>
                        </span>
                        <p className="text-xs text-ink-soft leading-relaxed">
                          {task.deliverable}
                        </p>
                      </div>
                    )}

                    {/* Notes / Linked Committee / Open Committee Action */}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-200/50">
                      {linkedCommittee ? (
                        <button
                          type="button"
                          onClick={() => onOpenCommitteeDetails && onOpenCommitteeDetails(linkedCommittee)}
                          className="text-xs text-brand font-bold flex items-center gap-1 hover:underline cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">groups</span>
                          <span>لجنة #{linkedCommittee.committeeNumber}: {linkedCommittee.committeeName} &larr;</span>
                        </button>
                      ) : task.committeeNumber ? (
                        <span className="text-xs text-brand font-bold flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">groups</span>
                          <span>مرتبط بلجنة #{task.committeeNumber}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">عمل عام للمسابقات</span>
                      )}

                      <button
                        type="button"
                        onClick={() => onDeleteTask(task.id)}
                        // A ceremony's task belongs to the committee: its date is changed or cleared from the ceremonies screen.
                        hidden={!AuthService.can('tasks.delete') || task.id.startsWith('task-ceremony-')}
                        className="text-red-500 hover:text-red-700 text-xs font-semibold cursor-pointer"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                );
              })}

              {selectedDayTasks.length === 0 && (
                <div className="p-8 text-center bg-canvas rounded-xl border border-dashed border-line/60">
                  <span className="material-symbols-outlined text-3xl text-gray-400 mb-1 block">
                    event_available
                  </span>
                  <p className="text-xs font-bold text-gray-600">
                    لا توجد أعمال مجدولة في هذا التاريخ
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    يمكنك إضافة تسليمات جديدة لهذا اليوم باستخدام الزر أعلاه.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Footer Action */}
          <div className="pt-3 border-t border-line/30">
            <button
              type="button"
              onClick={() => handleOpenAddModal(selectedDateStr)}
            hidden={!canWriteTasks}
              className="w-full py-2.5 px-3 rounded-xl border-2 border-dashed border-brand/40 text-brand hover:bg-tint font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-sm">add_circle</span>
              <span>+ إضافة مهمة أو تسليم ليوم {selectedDayInfo.dayName} ({selectedDayInfo.shortDate})</span>
            </button>
          </div>
        </div>
      </div>

      {/* ADD TASK MODAL */}
      {isAddModalOpen && (
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto text-right">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-line/50 max-h-[92vh] overflow-y-auto animate-in fade-in duration-150">
            <div className="px-5 py-4 bg-gradient-to-l from-emerald-50 to-tint border-b border-line/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-brand text-white flex items-center justify-center font-bold shadow-xs">
                  <span className="material-symbols-outlined text-xl">add_task</span>
                </span>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-ink">
                    إضافة عمل أو تسليم مجدول في التقويم
                  </h3>
                  <p className="text-xs text-muted">
                    جدولة أعمال اللجان وتحديد ما يلزم تسليمه والشخص المسؤول
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Delivery / Task Type Selector */}
            <div className="p-3 bg-slate-50 border-b border-line/40 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setDeliveryMode('manual')}
                className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all border ${
                  deliveryMode === 'manual'
                    ? 'bg-brand text-white border-brand shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="material-symbols-outlined text-sm">inventory_2</span>
                <span>تسليم يدوي / استلام أوراق ومهام</span>
              </button>

              <button
                type="button"
                onClick={() => setDeliveryMode('ceremony')}
                className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all border ${
                  deliveryMode === 'ceremony'
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-white text-amber-900 border-amber-200 hover:bg-amber-50'
                }`}
              >
                <span>🎉</span>
                <span>إضافة حفل وتكريم لجنة</span>
              </button>
            </div>

            <form onSubmit={handleCreateTaskSubmit} className="p-5 space-y-4 text-xs">
              {deliveryMode === 'ceremony' ? (
                /* CEREMONY FORM FIELDS */
                <div className="space-y-4">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 flex items-start gap-2">
                    <span className="text-lg">🎉</span>
                    <p className="text-xs leading-relaxed">
                      <strong>جدولة حفل تكريم:</strong> ستسجل في قاعدة بيانات اللجنة الميدانية وتظهر تلقائياً في شاشة الحفلات والتنبيهات اليومية والتقويم.
                    </p>
                  </div>

                  {/* Select Committee */}
                  <div>
                    <label className="block font-bold text-ink mb-1">
                      اللجنة المراد إقامة وتوثيق الحفل لها <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={ceremonyCommitteeId}
                      onChange={(e) => {
                        const val = e.target.value;
                        const found = committees.find((c) => c.id === val);
                        if (found) {
                          setCeremonyCommitteeId(found.id);
                          setCeremonyHonoredCount(
                            found.ceremonyDetails?.honoredStudentsCount ?? found.studentsCount ?? ''
                          );
                          setCeremonySheikhs(
                            found.ceremonyDetails?.attendingSheikhs?.length
                              ? [...found.ceremonyDetails.attendingSheikhs]
                              : found.sheikhName
                              ? [found.sheikhName]
                              : []
                          );
                          setCeremonyPlace(
                            found.ceremonyDetails?.ceremonyPlace || found.branch || ''
                          );
                        }
                      }}
                      className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-600 font-bold"
                      required
                    >
                      <option value="">اختر اللجنة</option>
                      {committees
                        .filter((c) => AuthService.canOnCommittee('committees.finalize', c))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            لجنة #{c.committeeNumber} - {c.committeeName}{c.courseName ? ` — ${c.courseName}` : ''} - الشيخ:{' '}
                            {c.sheikhName || '—'}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* 1. عدد الطلاب الذين سيتم تكريمهم */}
                  <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-200 space-y-1">
                    <label className="block font-bold text-ink">
                      🏆 عدد الطلاب الذين سيتم تكريمهم (الناجحين فقط) <span className="text-red-500">*</span>:
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={ceremonyHonoredCount}
                      onChange={(e) =>
                        setCeremonyHonoredCount(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      placeholder="اكتب عدد الطلاب الذين سيتم تكريمهم..."
                      className="w-full bg-white border border-line rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none focus:border-amber-600"
                      required
                    />
                    <span className="text-xs text-slate-500 block leading-tight">
                      * يحدد عدد المكرمين يدوياً نظراً لاحتمالية رسوب أو غياب بعض الطلاب وعدم تكريمهم جميعاً.
                    </span>
                  </div>

                  {/* 2. موعد الحفل بالتاريخ والوقت (يكتبه بيده) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-ink mb-1">
                        📅 موعد الحفل بالتاريخ <span className="text-red-500">*</span>:
                      </label>
                      <input
                        type="date"
                        value={ceremonyDate}
                        onChange={(e) => setCeremonyDate(e.target.value)}
                        className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-600 font-mono font-bold"
                        required
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-ink mb-1">
                        ⏰ موعد الحفل بالوقت (اكتبه بيدك) <span className="text-red-500">*</span>:
                      </label>
                      <input
                        type="text"
                        placeholder="مثال: 4 العصر، 4 المغرب، 08:30 م..."
                        value={ceremonyTime}
                        onChange={(e) => setCeremonyTime(e.target.value)}
                        className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-600 font-bold"
                        required
                      />
                    </div>
                  </div>

                  {/* 3. أسماء المشايخ الذين سيحضرون الحفل (إضافة أكثر من شيخ) */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-xs text-ink flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-brand">person_add</span>
                        <span>أسماء المشايخ والضيوف الحاضرين للحفل:</span>
                      </label>
                      <span className="text-xs font-bold text-slate-500 font-mono">
                        ({ceremonySheikhs.length}) مشايخ مضافين
                      </span>
                    </div>

                    {/* Chips */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {ceremonySheikhs.map((sheikh, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 shadow-2xs"
                        >
                          <span>{sheikh}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveCeremonySheikh(idx)}
                            className="w-4 h-4 rounded-full hover:bg-rose-100 hover:text-rose-700 flex items-center justify-center cursor-pointer text-slate-400"
                            title="حذف الشيخ"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>

                    {/* Add new sheikh input + button */}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={ceremonyNewSheikhInput}
                        onChange={(e) => setCeremonyNewSheikhInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCeremonySheikh();
                          }
                        }}
                        placeholder="اكتب اسم الشيخ واضغط إضافة عضو آخر..."
                        className="flex-1 bg-white border border-line rounded-xl px-3 py-1.5 text-xs outline-none focus:border-brand font-semibold"
                      />
                      <button
                        type="button"
                        onClick={handleAddCeremonySheikh}
                        className="px-3 py-1.5 rounded-xl bg-brand hover:bg-brand-deep text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                      >
                        <span className="material-symbols-outlined text-sm">add</span>
                        <span>+ إضافة عضو آخر</span>
                      </button>
                    </div>
                  </div>

                  {/* 4. مكان إقامة الحفل وملاحظات */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-ink mb-1">📍 مكان إقامة الحفل:</label>
                      <input
                        type="text"
                        placeholder="مثال: القاعة الكبرى بمسجد البخاري..."
                        value={ceremonyPlace}
                        onChange={(e) => setCeremonyPlace(e.target.value)}
                        className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-600"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-ink mb-1">📝 ملاحظات وترتيبات:</label>
                      <input
                        type="text"
                        placeholder="مثال: تجهيز أجهزة الصوت والدروع والشهادات..."
                        value={ceremonyNotes}
                        onChange={(e) => setCeremonyNotes(e.target.value)}
                        className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-600"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* MANUAL DELIVERY FORM FIELDS */
                <div className="space-y-4">
                  <div>
                    <label className="block font-bold text-ink mb-1">
                      اسم العمل أو المهمة <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: تسليم أوراق أسئلة لجنة 1، استلام دفاتر التصحيح..."
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      className="w-full bg-canvas border border-line rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-brand font-semibold"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-ink mb-1">
                        تاريخ اليوم <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={newTaskDate}
                        onChange={(e) => setNewTaskDate(e.target.value)}
                        className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-brand font-mono"
                        required
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-ink mb-1">
                        وقت التسليم أو التنفيذ
                      </label>
                      <input
                        type="text"
                        placeholder="مثال: 09:30 ص، قبل صلاة العصر..."
                        value={newTaskTime}
                        onChange={(e) => setNewTaskTime(e.target.value)}
                        className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-brand"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-ink mb-1">
                      ما يلزم تسليمه أو استلامه بالتحديد ("واللي محتاج أسلمها وكده")
                    </label>
                    <textarea
                      rows={2}
                      placeholder="مثال: كراسات أسئلة الامتحان، كشوف درجات موقعة، تقرير الغياب، أوراق الإجابة..."
                      value={newTaskDeliverable}
                      onChange={(e) => setNewTaskDeliverable(e.target.value)}
                      className="w-full bg-canvas border border-line rounded-xl p-2.5 text-xs outline-none focus:border-brand"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-ink mb-1">اللجنة المرتبطة</label>
                      <CommitteeSelect
                        committees={committees}
                        value={newTaskCommitteeId}
                        onChange={setNewTaskCommitteeId}
                        emptyLabel="بدون لجنة (عام)"
                        className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-brand"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-ink mb-1">الأولوية</label>
                      <select
                        value={newTaskPriority}
                        onChange={(e) => setNewTaskPriority(e.target.value as any)}
                        className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-brand"
                      >
                        <option value="urgent">🔴 عاجل وضروري</option>
                        <option value="high">🟠 مرتفع</option>
                        <option value="normal">🟢 عادي</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-ink mb-1">المكلف / المعاون</label>
                      <AssigneeSelect
                        value={newTaskAssigneeId}
                        onChange={setNewTaskAssigneeId}
                        className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-brand"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-ink mb-1">ملاحظات إضافية</label>
                    <textarea
                      rows={2}
                      placeholder="تعليمات القاعة، مكان التسليم، أرقام التواصل..."
                      value={newTaskNotes}
                      onChange={(e) => setNewTaskNotes(e.target.value)}
                      className="w-full bg-canvas border border-line rounded-xl p-2.5 text-xs outline-none focus:border-brand"
                    />
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-line/30 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-gray-600 border border-gray-300 hover:bg-gray-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-xl text-white font-bold cursor-pointer shadow-xs active:scale-[0.98] ${
                    deliveryMode === 'ceremony'
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700'
                      : 'bg-brand hover:bg-success'
                  }`}
                >
                  {deliveryMode === 'ceremony' ? 'حفظ وتثبيت الحفل في المنظومة' : 'حفظ العمل في التقويم'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
