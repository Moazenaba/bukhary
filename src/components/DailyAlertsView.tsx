import React, { useState, useMemo } from 'react';
import { todayISO } from '../utils/stageUtils';
import { ScheduleTask, Committee, AppUser } from '../types';
import { AuthService } from '../services/AuthService';
import { AssigneeSelect, CommitteeSelect } from './AssigneeSelect';
import { exportCeremoniesToExcel } from '../utils/reportExport';
import { toast } from './Toasts';

interface DailyAlertsViewProps {
  tasks: ScheduleTask[];
  committees: Committee[];
  currentUser: AppUser;
  onToggleTaskComplete: (taskId: string) => void;
  /** Resolves to true once the server saved the task. */
  onAddTask: (task: Omit<ScheduleTask, 'id'>) => boolean | void | Promise<boolean | void>;
  onDeleteTask: (taskId: string) => void;
  onNavigateToCalendar: () => void;
  onOpenCommitteeDetails?: (committee: Committee) => void;
  onNavigateToCeremonies?: () => void;
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

export const DailyAlertsView: React.FC<DailyAlertsViewProps> = ({
  tasks,
  committees,
  currentUser,
  onToggleTaskComplete,
  onAddTask,
  onDeleteTask,
  onNavigateToCalendar,
  onOpenCommitteeDetails,
  onNavigateToCeremonies,
  onUpdateCommitteeCeremony,
}) => {
  // Current active operational date based on real time
  const primaryTodayISO = todayISO();

  // Selected date filter (Defaults to Today)
  const [selectedDate, setSelectedDate] = useState<string>(primaryTodayISO);
  const [viewMode, setViewMode] = useState<'selected_day' | 'all_schedule'>('selected_day');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddCeremonyModalOpen, setIsAddCeremonyModalOpen] = useState(false);

  // Dedicated Ceremony Modal Form State
  // Ceremonies and task links use committee ids: numbers repeat across courses (WEB-08).
  const [ceremonyCommitteeId, setCeremonyCommitteeId] = useState<string>('');
  const canWriteTasks = AuthService.can('tasks.write');
  const canScheduleCeremonies = AuthService.can('committees.finalize');
  const [ceremonyDay, setCeremonyDay] = useState<string>('الاثنين');
  const [ceremonyDateInput, setCeremonyDateInput] = useState<string>(selectedDate);
  const [ceremonyTimeInput, setCeremonyTimeInput] = useState<string>('');
  const [ceremonyHonoredCount, setCeremonyHonoredCount] = useState<number>(0);
  const [ceremonySheikhs, setCeremonySheikhs] = useState<string[]>([
    ...(committees[0]?.sheikhName ? [committees[0].sheikhName] : []),
  ]);
  const [ceremonyNewSheikh, setCeremonyNewSheikh] = useState<string>('');
  const [ceremonyPlaceInput, setCeremonyPlaceInput] = useState<string>('');
  const [ceremonyNotesInput, setCeremonyNotesInput] = useState<string>('');

  // Ceremonies scheduled for selectedDate
  const ceremoniesOnSelectedDate = useMemo(() => {
    return tasks.filter((t) => t.type === 'ceremony' && t.date === selectedDate);
  }, [tasks, selectedDate]);

  // Generate dynamic quick switcher days starting from today
  const quickDays = useMemo(() => {
    const days = [];
    const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const iso = todayISO(d);
      const label = i === 0 ? `اليوم (${dayNames[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1})` : `${dayNames[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
      days.push({ dateStr: iso, label, isToday: i === 0 });
    }
    return days;
  }, []);

  // Form State for Adding a New Task
  const [newTitle, setNewTitle] = useState('');
  const [newTaskDate, setNewTaskDate] = useState(selectedDate);
  const [newTime, setNewTime] = useState('10:00 ص');
  const [newDeliverable, setNewDeliverable] = useState('');
  const [newCommitteeId, setNewCommitteeId] = useState<string>('');
  const [newPriority, setNewPriority] = useState<'urgent' | 'high' | 'normal'>('urgent');
  const [newType, setNewType] = useState<
    'delivery' | 'custom_delivery' | 'ceremony' | 'receive' | 'exam' | 'scoring' | 'review' | 'general'
  >('delivery');
  const [customDeliveryText, setCustomDeliveryText] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState<string>(currentUser.id);
  const [newNotes, setNewNotes] = useState('');

  // Selected Date Display String (Arabic)
  const formattedSelectedDate = useMemo(() => {
    try {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        const monthNames = [
          'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
          'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
        ];
        return `${dayNames[d.getDay()]} ${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}م`;
      }
    } catch {}
    return selectedDate;
  }, [selectedDate]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const finalType = newType === 'custom_delivery' ? 'delivery' : (newType as any);
    const finalDeliverable = newType === 'custom_delivery' && customDeliveryText.trim()
      ? `نوع التسليم اليدوي: ${customDeliveryText.trim()} • ${newDeliverable}`.trim()
      : newDeliverable.trim();

    const ok = await onAddTask({
      title: newTitle.trim(),
      date: newTaskDate || selectedDate,
      time: newTime,
      deliverable: finalDeliverable || undefined,
      committeeId: newCommitteeId || undefined,
      priority: newPriority,
      type: finalType,
      assignedAssistantId: newAssigneeId || undefined,
      notes: newNotes.trim() || undefined,
      completed: false,
    });
    if (ok === false) return;

    setNewTitle('');
    setNewDeliverable('');
    setCustomDeliveryText('');
    setNewCommitteeId('');
    setNewNotes('');
    setIsAddModalOpen(false);
  };

  const handleAddSheikhToCeremony = () => {
    const trimmed = ceremonyNewSheikh.trim();
    if (!trimmed) return;
    if (!ceremonySheikhs.includes(trimmed)) {
      setCeremonySheikhs([...ceremonySheikhs, trimmed]);
    }
    setCeremonyNewSheikh('');
  };

  const handleRemoveSheikhFromCeremony = (idx: number) => {
    setCeremonySheikhs(ceremonySheikhs.filter((_, i) => i !== idx));
  };

  const handleCreateCeremony = async (e: React.FormEvent) => {
    e.preventDefault();
    const comm = committees.find((c) => c.id === ceremonyCommitteeId);
    if (!comm || !onUpdateCommitteeCeremony) return;
    // The ceremony is stored on the committee; the server keeps its one calendar task (WEB-08).
    const ok = await onUpdateCommitteeCeremony(comm.id, {
      date: ceremonyDateInput,
      time: ceremonyTimeInput,
      place: ceremonyPlaceInput,
      notes: ceremonyNotesInput,
      completed: Boolean(comm.stages.ceremony?.completed),
      honoredCount: ceremonyHonoredCount,
      attendingSheikhs: ceremonySheikhs,
    });
    if (ok !== false) setIsAddCeremonyModalOpen(false);
  };

  // Filter tasks based on view mode (selected day vs all schedule) and status and search
  const displayedTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Date filter
      if (viewMode === 'selected_day') {
        if (task.date !== selectedDate) return false;
      }

      // Status filter
      if (statusFilter === 'pending' && task.completed) return false;
      if (statusFilter === 'completed' && !task.completed) return false;

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchTitle = task.title.toLowerCase().includes(query);
        const matchAssistant = (task.assignedAssistantName || '').toLowerCase().includes(query);
        const matchDeliverable = (task.deliverable || '').toLowerCase().includes(query);
        const matchNotes = (task.notes || '').toLowerCase().includes(query);
        const matchComm = task.committeeNumber?.toString().includes(query);
        const matchDate = task.date.includes(query);
        if (!matchTitle && !matchAssistant && !matchDeliverable && !matchNotes && !matchComm && !matchDate) {
          return false;
        }
      }
      return true;
    });
  }, [tasks, viewMode, selectedDate, statusFilter, searchQuery]);

  // Statistics for active view
  const currentViewTasks = viewMode === 'selected_day' ? tasks.filter((t) => t.date === selectedDate) : tasks;
  const totalCount = currentViewTasks.length;
  const completedCount = currentViewTasks.filter((t) => t.completed).length;
  const pendingCount = totalCount - completedCount;
  const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 100;

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-xs shrink-0">
            <span className="material-symbols-outlined text-2xl">notifications_active</span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
                التنبيهات والمهام اليومية
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-brand border border-emerald-200 text-xs font-black font-mono">
                📅 {viewMode === 'selected_day' ? formattedSelectedDate : 'كافة المواعيد المجدولة'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              مربوطة مباشرة بجدول تقويم المواعيد: أي عمل تضيفه في أي يوم يظهر هنا فوراً.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setCeremonyDateInput(selectedDate);
              if (canScheduleCeremonies) setIsAddCeremonyModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black transition-all shadow-xs cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-lg">celebration</span>
            <span>+ إضافة وجدولة حفلة</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setNewTaskDate(selectedDate);
              if (canWriteTasks) setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-deep text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-lg">add_task</span>
            <span>+ إضافة عمل / تنبيه لليوم</span>
          </button>

          <button
            type="button"
            onClick={onNavigateToCalendar}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-300 transition-all cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-lg text-slate-600">calendar_month</span>
            <span>عرض جدول التقويم الكامل ↗</span>
          </button>
        </div>
      </div>

      {/* Date Switcher & Mode Bar (اختيار اليوم / الاثنين / الثلاثاء / إلخ) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1">
              <span className="material-symbols-outlined text-base text-brand">event</span>
              <span>عرض المواعيد والتنبيهات حسب:</span>
            </span>
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('selected_day')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'selected_day' ? 'bg-brand text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                اليوم المحدد ({tasks.filter(t => t.date === selectedDate).length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('all_schedule')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'all_schedule' ? 'bg-brand text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                كافة المواعيد المجدولة ({tasks.length})
              </button>
            </div>
          </div>

          {/* Custom Date Picker */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-bold text-slate-500">اختر يوماً من التقويم:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setViewMode('selected_day');
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-800 outline-none focus:border-brand"
            />
          </div>
        </div>

        {/* Quick Days Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {quickDays.map((q) => {
            const countOnDay = tasks.filter((t) => t.date === q.dateStr).length;
            const isSelected = viewMode === 'selected_day' && selectedDate === q.dateStr;
            return (
              <button
                key={q.dateStr}
                type="button"
                onClick={() => {
                  setSelectedDate(q.dateStr);
                  setViewMode('selected_day');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-brand text-white shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                <span>{q.label}</span>
                {countOnDay > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-xs font-mono ${
                      isSelected ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {countOnDay}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Mini-Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-bold block">
              {viewMode === 'selected_day' ? 'مهام اليوم المحدد' : 'إجمالي كافة المهام'}
            </span>
            <span className="text-2xl font-black text-slate-900 font-mono mt-0.5 block">
              {totalCount}
            </span>
          </div>
          <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-xl">list_alt</span>
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs text-amber-700 font-bold block">قيد المتابعة والتنفيذ</span>
            <span className="text-2xl font-black text-amber-600 font-mono mt-0.5 block">
              {pendingCount}
            </span>
          </div>
          <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-xl">pending_actions</span>
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs text-emerald-700 font-bold block">المنجز ({completionPercentage}%)</span>
            <span className="text-2xl font-black text-emerald-600 font-mono mt-0.5 block">
              {completedCount}
            </span>
          </div>
          <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-xl">check_circle</span>
          </span>
        </div>
      </div>

      {/* Ceremony Alert Banner if today has ceremonies */}
      {ceremoniesOnSelectedDate.length > 0 && (
        <div className="bg-gradient-to-l from-amber-500 via-amber-400 to-amber-500 rounded-3xl p-5 text-slate-950 shadow-md border-2 border-amber-300 animate-fadeIn flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="w-12 h-12 rounded-2xl bg-slate-950 text-amber-300 flex items-center justify-center font-black shrink-0 text-2xl shadow-xs">
              🎉
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full bg-slate-950 text-amber-300 text-xs font-black uppercase tracking-wider">
                  تنبيه حفل وتكريم اليوم
                </span>
                <h3 className="text-base font-black">
                  اليوم موعد إقامة حفل تكريم وتوزيع جوائز ({ceremoniesOnSelectedDate.length}) لجنة!
                </h3>
              </div>
              <p className="text-xs font-bold text-slate-900 mt-1 leading-relaxed">
                {ceremoniesOnSelectedDate
                  .map((c) => `لجنة #${c.committeeNumber || ''} (${c.title})`)
                  .join(' • ')}
              </p>
              <div className="text-xs font-semibold text-slate-800 mt-0.5">
                📍 يرجى تجهيز شهادات التقدير والدروع التذكارية وكشوف التكريم للطلاب والشيخ المشرف.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => {
                const n = exportCeremoniesToExcel(committees, tasks, 'day', selectedDate);
                if (n === 0) toast.info('لا توجد حفلات مسجلة على لجانها في هذا اليوم');
                else toast.success(`تم تصدير كشف ${n} حفل`);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-slate-950 hover:bg-amber-50 text-xs font-black shadow-xs cursor-pointer transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-base">download</span>
              <span>كشف حفلات اليوم Excel</span>
            </button>
            {onNavigateToCeremonies && (
              <button
                type="button"
                onClick={onNavigateToCeremonies}
                className="px-4 py-2.5 rounded-xl bg-slate-950 text-amber-300 hover:bg-slate-900 text-xs font-black shadow-xs cursor-pointer transition-all active:scale-95"
              >
                فتح تاب الحفلات والتكريم ↗
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <span className="material-symbols-outlined absolute right-3 top-2.5 text-slate-400 text-lg">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في المهام، المكلف، التاريخ، اللجنة..."
            className="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:bg-white focus:border-brand outline-none"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-brand text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            الكل ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'pending'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            المتبقي ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('completed')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'completed'
                ? 'bg-emerald-700 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            المنجز ({completedCount})
          </button>
        </div>
      </div>

      {/* Tasks List */}
      <div className="space-y-3">
        {displayedTasks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-slate-400 mb-2 block">
              task_alt
            </span>
            <h3 className="text-base font-bold text-slate-800 mb-1">
              {totalCount === 0
                ? `لا توجد مهام مسجلة ليوم (${formattedSelectedDate})`
                : 'لا توجد نتائج تطابق معايير التصفية الحالية'}
            </h3>
            <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
              يمكنك إضافة عمل لهذا اليوم مباشرة، أو استعراض الأيام الأخرى أو الجدول الكامل.
            </p>
            <button
              type="button"
              onClick={() => {
                setNewTaskDate(selectedDate);
                if (canWriteTasks) setIsAddModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand hover:bg-brand-deep text-white text-xs font-bold cursor-pointer transition-all shadow-2xs"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              <span>+ إضافة عمل ليوم {formattedSelectedDate.split(' ')[0]}</span>
            </button>
          </div>
        ) : (
          displayedTasks.map((task) => {
            const isUrgent = task.priority === 'urgent';
            return (
              <div
                key={task.id}
                className={`bg-white rounded-2xl border p-4 sm:p-5 shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  task.completed
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : task.type === 'ceremony'
                    ? 'border-amber-400 ring-2 ring-amber-200 bg-amber-50/30'
                    : isUrgent
                    ? 'border-rose-300 ring-1 ring-rose-200'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  {/* Checkbox Toggle Button */}
                  <button
                    type="button"
                    onClick={() => onToggleTaskComplete(task.id)}
                    disabled={!(canWriteTasks || task.assignedAssistantId === currentUser.id)}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 transition-all cursor-pointer mt-0.5 active:scale-95 ${
                      task.completed
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-slate-100 hover:bg-emerald-100 text-slate-400 hover:text-emerald-700 border border-slate-300'
                    }`}
                    title={task.completed ? 'إلغاء التحديد' : 'تحديد كمنجز الآن'}
                  >
                    <span className="material-symbols-outlined text-xl">
                      {task.completed ? 'check' : 'radio_button_unchecked'}
                    </span>
                  </button>

                  {/* Task Content */}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className={`px-2 py-0.5 rounded-md text-xs font-black border ${
                          task.type === 'ceremony'
                            ? 'bg-amber-100 text-amber-950 border-amber-300 shadow-2xs'
                            : task.type === 'delivery'
                            ? 'bg-amber-50 text-amber-900 border-amber-300'
                            : task.type === 'exam'
                            ? 'bg-blue-50 text-blue-900 border-blue-300'
                            : task.type === 'scoring'
                            ? 'bg-teal-50 text-teal-900 border-teal-300'
                            : task.type === 'review'
                            ? 'bg-teal-50 text-teal-900 border-teal-300'
                            : 'bg-slate-100 text-slate-800 border-slate-300'
                        }`}
                      >
                        {task.type === 'ceremony'
                          ? '🎉 حفل وتكريم'
                          : task.type === 'delivery'
                          ? '📦 تسليم'
                          : task.type === 'exam'
                          ? '📝 امتحان'
                          : task.type === 'scoring'
                          ? '✍️ تصحيح'
                          : task.type === 'review'
                          ? '🔍 مراجعة'
                          : '📌 عمل مجدول'}
                      </span>

                      {/* Date Badge */}
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-xs font-bold border border-slate-300">
                        📅 {task.date}
                      </span>

                      {task.committeeNumber && (
                        <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 font-mono text-xs font-bold border border-teal-200">
                          لجنة #{task.committeeNumber}
                        </span>
                      )}

                      <span className="text-xs font-bold text-slate-500 font-mono flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-xs text-slate-400">schedule</span>
                        <span>{task.time || 'بدون وقت محدد'}</span>
                      </span>

                      {isUrgent && !task.completed && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-xs font-black border border-rose-200 animate-pulse">
                          ⚠️ عاجل
                        </span>
                      )}
                    </div>

                    <h4
                      className={`font-bold text-sm text-slate-900 leading-snug ${
                        task.completed ? 'line-through text-slate-400' : ''
                      }`}
                    >
                      {task.title}
                    </h4>

                    {task.deliverable && (
                      <p className="text-xs text-amber-800 bg-amber-50/70 px-2.5 py-1 rounded-lg border border-amber-200/80 mt-1.5 inline-block">
                        📋 المطلوب: {task.deliverable}
                      </p>
                    )}

                    {task.notes && (
                      <p className="text-xs text-slate-500 mt-1">
                        💬 {task.notes}
                      </p>
                    )}
                  </div>
                </div>

                {/* Left Meta & Delete Actions */}
                <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                  <span className="text-xs text-slate-500 font-medium bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                    👤 المكلف: {task.assignedAssistantName || 'غير محدد'}
                  </span>

                  <button
                    type="button"
                    onClick={() => onDeleteTask(task.id)}
                    hidden={!AuthService.can('tasks.delete')}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="حذف هذا التنبيه"
                  >
                    <span className="material-symbols-outlined text-lg">delete</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Task Modal */}
      {isAddModalOpen && (
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-right">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black">
                  <span className="material-symbols-outlined text-lg">add_task</span>
                </span>
                <h3 className="text-base font-black text-slate-900">إضافة تنبيه / عمل جديد في التقويم</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  عنوان العمل أو التكليف <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="مثال: تسليم أوراق إجابات لجنة رقم 3، بدء تصحيح متن الآجرومية..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:bg-white focus:border-brand outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    تاريخ التنفيذ <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={newTaskDate}
                    onChange={(e) => setNewTaskDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold focus:bg-white focus:border-brand outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">وقت التنفيذ</label>
                  <input
                    type="text"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    placeholder="10:00 ص"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono focus:bg-white focus:border-brand outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">نوع العمل</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold focus:bg-white focus:border-brand outline-none"
                  >
                    <option value="delivery">📦 تسليم أوراق وكشوف</option>
                    <option value="custom_delivery">✍️ تسليم يدوي مخصص (تكتب نوعه بيدك)</option>
                    <option value="ceremony">🎉 حفل تكريم وتوزيع جوائز</option>
                    <option value="receive">📥 استلام دفاتر</option>
                    <option value="exam">📝 موعد اختبار</option>
                    <option value="scoring">✍️ تصحيح ورصد</option>
                    <option value="review">🔍 مراجعة وتدقيق</option>
                    <option value="general">📌 عمل عام</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">الأولوية</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold focus:bg-white focus:border-brand outline-none"
                  >
                    <option value="urgent">🔴 عاجل جداً</option>
                    <option value="high">🟡 هام</option>
                    <option value="normal">🔵 عادي</option>
                  </select>
                </div>
              </div>

              {newType === 'custom_delivery' && (
                <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200">
                  <label className="block text-slate-800 font-bold mb-1">
                    اكتب نوع التسليم المطلوب يدوياً: <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customDeliveryText}
                    onChange={(e) => setCustomDeliveryText(e.target.value)}
                    placeholder="مثال: تسليم دروع التكريم، تسليم كشوفات الجمعية، تسليم جوائز نقدية..."
                    className="w-full px-3 py-2 rounded-xl bg-white border border-amber-300 font-medium focus:border-amber-600 outline-none"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">اللجنة (اختياري)</label>
                  <CommitteeSelect
                    committees={committees}
                    value={newCommitteeId}
                    onChange={setNewCommitteeId}
                    emptyLabel="بدون لجنة"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-brand outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">المعاون المكلف</label>
                  <AssigneeSelect
                    value={newAssigneeId}
                    onChange={setNewAssigneeId}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:bg-white focus:border-brand outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">ما يلزم تسليمه / المطلوب (اختياري)</label>
                <input
                  type="text"
                  value={newDeliverable}
                  onChange={(e) => setNewDeliverable(e.target.value)}
                  placeholder="مثال: دفاتر الإجابات + كشف التوقيعات"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:bg-white focus:border-brand outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-deep text-white font-bold cursor-pointer shadow-xs"
                >
                  حفظ العمل والجدولة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dedicated Add Ceremony Modal */}
      {isAddCeremonyModalOpen && (
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-right">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-xs">
                  <span className="material-symbols-outlined text-2xl">celebration</span>
                </span>
                <div>
                  <h3 className="text-base font-black text-slate-900">إضافة وجدولة حفل تكريم جديد</h3>
                  <span className="text-xs text-slate-500">
                    تسمع تلقائياً في التنبيهات اليومية وتاب الحفلات وتفاصيل اللجنة
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCeremonyModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateCeremony} className="space-y-4 text-xs">
              {/* Committee select */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  اختر اللجنة المقررة <span className="text-rose-500">*</span>
                </label>
                <select
                  value={ceremonyCommitteeId}
                  required
                  onChange={(e) => {
                    setCeremonyCommitteeId(e.target.value);
                    const found = committees.find((c) => c.id === e.target.value);
                    if (found) {
                      setCeremonyHonoredCount(found.studentsCount || 0);
                      if (found.sheikhName) {
                        setCeremonySheikhs([found.sheikhName]);
                      }
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold focus:bg-white focus:border-brand outline-none"
                >
                  <option value="">اختر اللجنة</option>
                  {committees
                    .filter((c) => AuthService.canOnCommittee('committees.finalize', c))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        لجنة #{c.committeeNumber}: {c.committeeName}{c.courseName ? ` — ${c.courseName}` : ''} ({c.sheikhName || '—'})
                      </option>
                    ))}
                </select>
              </div>

              {/* Day & Date selection */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    يوم الحفل <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={ceremonyDay}
                    onChange={(e) => {
                      setCeremonyDay(e.target.value);
                      const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
                      const dayMap: Record<string, string> = {};
                      const now = new Date();
                      for (let i = 0; i < 7; i++) {
                        const d = new Date(now);
                        d.setDate(now.getDate() + i);
                        dayMap[dayNames[d.getDay()]] = todayISO(d);
                      }
                      if (dayMap[e.target.value]) {
                        setCeremonyDateInput(dayMap[e.target.value]);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold focus:bg-white focus:border-brand outline-none"
                  >
                    <option value="الاثنين">الاثنين</option>
                    <option value="الثلاثاء">الثلاثاء</option>
                    <option value="الأربعاء">الأربعاء</option>
                    <option value="الخميس">الخميس</option>
                    <option value="الجمعة">الجمعة</option>
                    <option value="السبت">السبت</option>
                    <option value="الأحد">الأحد</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    تاريخ الحفل <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={ceremonyDateInput}
                    onChange={(e) => setCeremonyDateInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold focus:bg-white focus:border-brand outline-none"
                  />
                </div>
              </div>

              {/* Time (manual text) & Honored Count */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    وقت الحفل (اكتبه بيدك) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={ceremonyTimeInput}
                    onChange={(e) => setCeremonyTimeInput(e.target.value)}
                    placeholder="مثال: 4 العصر، 4 المغرب، 8:00 م"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-semibold focus:bg-white focus:border-brand outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    عدد الطلاب المكرمين فعلياً
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={ceremonyHonoredCount}
                    onChange={(e) => setCeremonyHonoredCount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold focus:bg-white focus:border-brand outline-none"
                  />
                </div>
              </div>

              {/* Attending sheikhs dynamic list (+ إضافة عضو آخر) */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">أسماء المشايخ والضيوف الحاضرين للحفل:</label>
                  <span className="text-xs font-bold text-slate-500 font-mono">
                    ({ceremonySheikhs.length}) مشايخ
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {ceremonySheikhs.map((sh, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 shadow-2xs"
                    >
                      <span>{sh}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSheikhFromCeremony(idx)}
                        className="text-slate-400 hover:text-rose-600 cursor-pointer text-xs"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={ceremonyNewSheikh}
                    onChange={(e) => setCeremonyNewSheikh(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSheikhToCeremony();
                      }
                    }}
                    placeholder="اكتب اسم الشيخ واضغط إضافة عضو آخر..."
                    className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold outline-none focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={handleAddSheikhToCeremony}
                    className="px-3 py-1.5 rounded-xl bg-brand text-white text-xs font-bold shrink-0 cursor-pointer shadow-2xs"
                  >
                    + إضافة عضو آخر
                  </button>
                </div>
              </div>

              {/* Place & Notes */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">مكان إقامة الحفل</label>
                <input
                  type="text"
                  value={ceremonyPlaceInput}
                  onChange={(e) => setCeremonyPlaceInput(e.target.value)}
                  placeholder="مثال: القاعة الكبرى - مسجد الإمام البخاري"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:bg-white focus:border-brand outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">ملاحظات وترتيبات الحفل (اختياري)</label>
                <textarea
                  rows={2}
                  value={ceremonyNotesInput}
                  onChange={(e) => setCeremonyNotesInput(e.target.value)}
                  placeholder="ملاحظات وتجهيزات الدروع وشهادات التكريم..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:bg-white focus:border-brand outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddCeremonyModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-deep text-white font-bold cursor-pointer shadow-md"
                >
                  حفظ الحفلة وإدراج التنبيه
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
