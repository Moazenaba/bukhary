import React, { useState, useMemo } from 'react';
import { ScheduleTask, Committee, AppUser } from '../types';

interface DailyAlertsViewProps {
  tasks: ScheduleTask[];
  committees: Committee[];
  currentUser: AppUser;
  onToggleTaskComplete: (taskId: string) => void;
  onAddTask: (task: Omit<ScheduleTask, 'id'>) => void;
  onDeleteTask: (taskId: string) => void;
  onNavigateToCalendar: () => void;
  onOpenCommitteeDetails?: (committee: Committee) => void;
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
}) => {
  // Current active operational date: Monday 5 October 2026
  const primaryMondayISO = '2026-10-05';

  // Selected date filter (Defaults to Monday)
  const [selectedDate, setSelectedDate] = useState<string>(primaryMondayISO);
  const [viewMode, setViewMode] = useState<'selected_day' | 'all_schedule'>('selected_day');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Quick switcher days centered on Monday as Today
  const quickDays = [
    { dateStr: '2026-10-05', label: 'اليوم (الاثنين 10/5)', isToday: true },
    { dateStr: '2026-10-06', label: 'الثلاثاء 10/6', isToday: false },
    { dateStr: '2026-10-07', label: 'الأربعاء 10/7', isToday: false },
    { dateStr: '2026-10-08', label: 'الخميس 10/8', isToday: false },
    { dateStr: '2026-10-09', label: 'الجمعة 10/9', isToday: false },
    { dateStr: '2026-10-10', label: 'السبت 10/10', isToday: false },
    { dateStr: '2026-10-11', label: 'الأحد 10/11', isToday: false },
  ];

  // Form State for Adding a New Task
  const [newTitle, setNewTitle] = useState('');
  const [newTaskDate, setNewTaskDate] = useState(selectedDate);
  const [newTime, setNewTime] = useState('10:00 ص');
  const [newDeliverable, setNewDeliverable] = useState('');
  const [newCommitteeNum, setNewCommitteeNum] = useState<number | ''>('');
  const [newPriority, setNewPriority] = useState<'urgent' | 'high' | 'normal'>('urgent');
  const [newType, setNewType] = useState<'delivery' | 'receive' | 'exam' | 'scoring' | 'review' | 'general'>('delivery');
  const [newAssistant, setNewAssistant] = useState(currentUser.name);
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

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    onAddTask({
      title: newTitle.trim(),
      date: newTaskDate || selectedDate,
      time: newTime,
      deliverable: newDeliverable.trim() || undefined,
      committeeNumber: newCommitteeNum ? Number(newCommitteeNum) : undefined,
      priority: newPriority,
      type: newType,
      assignedAssistantName: newAssistant || currentUser.name,
      notes: newNotes.trim() || undefined,
      completed: false,
    });

    setNewTitle('');
    setNewDeliverable('');
    setNewCommitteeNum('');
    setNewNotes('');
    setIsAddModalOpen(false);
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
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#005c55] border border-emerald-200 text-xs font-black font-mono">
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
              setNewTaskDate(selectedDate);
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#005c55] hover:bg-[#004742] text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
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
              <span className="material-symbols-outlined text-base text-[#005c55]">event</span>
              <span>عرض المواعيد والتنبيهات حسب:</span>
            </span>
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('selected_day')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'selected_day' ? 'bg-[#005c55] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                اليوم المحدد ({tasks.filter(t => t.date === selectedDate).length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('all_schedule')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'all_schedule' ? 'bg-[#005c55] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                كافة المواعيد المجدولة ({tasks.length})
              </button>
            </div>
          </div>

          {/* Custom Date Picker */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-[11px] font-bold text-slate-500">اختر يوماً من التقويم:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setViewMode('selected_day');
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-800 outline-none focus:border-[#005c55]"
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
                    ? 'bg-[#005c55] text-white shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                <span>{q.label}</span>
                {countOnDay > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
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
            className="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:bg-white focus:border-[#005c55] outline-none"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-[#005c55] text-white shadow-2xs'
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
                setIsAddModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#005c55] hover:bg-[#004742] text-white text-xs font-bold cursor-pointer transition-all shadow-2xs"
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
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                          task.type === 'delivery'
                            ? 'bg-amber-50 text-amber-900 border-amber-300'
                            : task.type === 'exam'
                            ? 'bg-blue-50 text-blue-900 border-blue-300'
                            : task.type === 'scoring'
                            ? 'bg-teal-50 text-teal-900 border-teal-300'
                            : task.type === 'review'
                            ? 'bg-purple-50 text-purple-900 border-purple-300'
                            : 'bg-slate-100 text-slate-800 border-slate-300'
                        }`}
                      >
                        {task.type === 'delivery'
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
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[10px] font-bold border border-slate-300">
                        📅 {task.date}
                      </span>

                      {task.committeeNumber && (
                        <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 font-mono text-[10px] font-bold border border-teal-200">
                          لجنة #{task.committeeNumber}
                        </span>
                      )}

                      <span className="text-[11px] font-bold text-slate-500 font-mono flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-xs text-slate-400">schedule</span>
                        <span>{task.time || '10:00 ص'}</span>
                      </span>

                      {isUrgent && !task.completed && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[10px] font-black border border-rose-200 animate-pulse">
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
                    👤 المكلف: {task.assignedAssistantName || 'المشرف العام'}
                  </span>

                  <button
                    type="button"
                    onClick={() => onDeleteTask(task.id)}
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
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fadeIn">
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:bg-white focus:border-[#005c55] outline-none"
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold focus:bg-white focus:border-[#005c55] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">وقت التنفيذ</label>
                  <input
                    type="text"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    placeholder="10:00 ص"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono focus:bg-white focus:border-[#005c55] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">نوع العمل</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold focus:bg-white focus:border-[#005c55] outline-none"
                  >
                    <option value="delivery">📦 تسليم أوراق وكشوف</option>
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold focus:bg-white focus:border-[#005c55] outline-none"
                  >
                    <option value="urgent">🔴 عاجل جداً</option>
                    <option value="high">🟡 هام</option>
                    <option value="normal">🔵 عادي</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">رقم اللجنة (اختياري)</label>
                  <input
                    type="number"
                    value={newCommitteeNum}
                    onChange={(e) => setNewCommitteeNum(e.target.value ? parseInt(e.target.value) : '')}
                    placeholder="رقم اللجنة..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono focus:bg-white focus:border-[#005c55] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">المعاون المكلف</label>
                  <input
                    type="text"
                    value={newAssistant}
                    onChange={(e) => setNewAssistant(e.target.value)}
                    placeholder="اسم المعاون أو المشرف..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:bg-white focus:border-[#005c55] outline-none"
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:bg-white focus:border-[#005c55] outline-none"
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
                  className="px-5 py-2 rounded-xl bg-[#005c55] hover:bg-[#004742] text-white font-bold cursor-pointer shadow-xs"
                >
                  حفظ العمل والجدولة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
