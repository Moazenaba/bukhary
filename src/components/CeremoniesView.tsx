import React, { useState, useMemo } from 'react';
import { todayISO } from '../utils/stageUtils';
import { Committee, ScheduleTask, AppUser, StageKey } from '../types';
import { AuthService } from '../services/AuthService';
import { AttendeePicker, MyCeremonies } from './CeremonyAttendees';
import { CEREMONY_STATUS_LABEL, CeremonyPeriod, CeremonyStatus, ceremonyRows, ceremoniesPdfTable, ceremonyStatusPdfTable, exportCeremoniesToExcel, periodRange } from '../utils/reportExport';
import { deliverPdf } from '../utils/pdf';
import { toast } from './Toasts';

interface CeremoniesViewProps {
  committees: Committee[];
  scheduleTasks: ScheduleTask[];
  currentUser: AppUser;
  onUpdateCommitteeCeremony: (
    committeeId: string,
    ceremonyInfo: {
      date: string;
      time: string;
      place: string;
      notes?: string;
      completed: boolean;
      honoredCount?: number;
      attendeeUserIds?: string[];
    }
  ) => unknown;
  onToggleCommitteeStage: (committeeId: string, stageKey: StageKey) => void;
  onAddTask: (task: Omit<ScheduleTask, 'id'>) => unknown;
  onDeleteTask: (taskId: string) => void;
  onToggleTaskComplete: (taskId: string) => void;
  onOpenCommitteeDetails?: (committee: Committee) => void;
  /** Opens the committee's data form (edit what was entered when it was added). */
  onEditCommittee?: (committee: Committee) => void;
  onNavigateToDailyAlerts?: () => void;
  onNavigateToCalendar?: () => void;
}

const ARABIC_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// Generate dynamic week mapping starting from current date
const generateWeekMap = () => {
  const map: Record<string, string> = {};
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const iso = todayISO(d);
    const dayName = ARABIC_DAYS[d.getDay()];
    if (!map[dayName]) map[dayName] = iso;
  }
  return map;
};

const DAY_TO_DATE_MAP = generateWeekMap();

export function getArabicDayName(dateStr?: string): string {
  if (!dateStr) return 'الاثنين';
  try {
    const cleanDate = dateStr.split(' ')[0];
    const [y, m, d] = cleanDate.split('-').map(Number);
    if (!y || !m || !d) return 'الاثنين';
    const date = new Date(y, m - 1, d);
    return ARABIC_DAYS[date.getDay()] || 'الاثنين';
  } catch {
    return 'الاثنين';
  }
}

export const CeremoniesView: React.FC<CeremoniesViewProps> = ({
  committees,
  scheduleTasks,
  currentUser,
  onUpdateCommitteeCeremony,
  onToggleCommitteeStage,
  onAddTask,
  onDeleteTask,
  onToggleTaskComplete,
  onOpenCommitteeDetails,
  onEditCommittee,
  onNavigateToDailyAlerts,
  onNavigateToCalendar,
}) => {
  const [filterStatus, setFilterStatus] = useState<'all' | 'today' | 'scheduled' | 'completed' | 'unscheduled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBook, setSelectedBook] = useState('all');

  // Modal State for Scheduling Ceremony
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [targetCommittee, setTargetCommittee] = useState<Committee | null>(null);
  
  // Ceremony Form fields
  const [ceremonyDate, setCeremonyDate] = useState(todayISO());
  const [ceremonyDayName, setCeremonyDayName] = useState(ARABIC_DAYS[new Date().getDay()]);
  const [ceremonyTime, setCeremonyTime] = useState('08:00 م (بعد صلاة العشاء)');
  const [ceremonyPlace, setCeremonyPlace] = useState('');
  const [honoredCount, setHonoredCount] = useState<number>(0);
  const [ceremonyNotes, setCeremonyNotes] = useState('');
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);

  // Ceremonies sheet export (daily / weekly / monthly)
  const [exportPeriod, setExportPeriod] = useState<CeremonyPeriod>('day');
  const [exportAnchor, setExportAnchor] = useState(todayISO());
  const exportRange = periodRange(exportPeriod, exportAnchor || todayISO());
  const exportCount = useMemo(
    () => ceremonyRows(committees, scheduleTasks, exportPeriod, exportAnchor || todayISO()).length,
    [committees, scheduleTasks, exportPeriod, exportAnchor]
  );
  const handleExportCeremonies = () => {
    const n = exportCeremoniesToExcel(committees, scheduleTasks, exportPeriod, exportAnchor || todayISO());
    if (n === 0) toast.info('لا توجد حفلات مجدولة في هذه الفترة');
    else toast.success(`تم تصدير كشف ${n} حفل`);
  };

  // PDF: «تصدير» saves the file on the device; «مشاركة» sends it through the phone's share sheet.
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  type PdfJob = { count: number; filename: string; table: Parameters<typeof deliverPdf>[0] };
  const runPdf = async (key: string, mode: 'export' | 'share', make: () => PdfJob, empty: string) => {
    const job = make();
    if (job.count === 0) {
      toast.info(empty);
      return;
    }
    setPdfBusy(`${key}:${mode}`);
    try {
      const result = await deliverPdf(job.table, job.filename, mode);
      if (result === 'downloaded') toast.success(`تم تصدير «${job.table.title.split(' — ')[0]}» PDF (${job.count})`);
      if (result === 'fallback') toast.info('المشاركة غير متاحة في هذا المتصفح؛ تم تنزيل ملف PDF لترسله بنفسك');
    } catch {
      toast.error(mode === 'share' ? 'تعذرت مشاركة ملف PDF' : 'تعذر إنشاء ملف PDF');
    } finally {
      setPdfBusy(null);
    }
  };
  const periodPdf = () => ceremoniesPdfTable(committees, scheduleTasks, exportPeriod, exportAnchor || todayISO());
  const handleExportCeremoniesPdf = () => runPdf('period', 'export', periodPdf, 'لا توجد حفلات مجدولة في هذه الفترة');
  const handleShareCeremoniesPdf = () => runPdf('period', 'share', periodPdf, 'لا توجد حفلات مجدولة في هذه الفترة');
  const statusCounts = {
    not_held: committees.filter((c) => !c.stages.ceremony?.completed).length,
    held: committees.filter((c) => c.stages.ceremony?.completed).length,
  };
  const statusPdf = (status: CeremonyStatus) => () => ceremonyStatusPdfTable(committees, scheduleTasks, status, committees[0]?.courseName);

  // Certificate / Honor Roll Print Modal
  const [honorRollCommittee, setHonorRollCommittee] = useState<Committee | null>(null);

  // Extract distinct competition books
  const competitionBooks = useMemo(() => {
    const set = new Set<string>();
    committees.forEach((c) => {
      if (c.competitionBook) set.add(c.competitionBook);
    });
    return Array.from(set);
  }, [committees]);

  // The ceremony's calendar task is created and kept in step by the server, one per committee id.
  const getLinkedCeremonyTask = (committee: Committee) =>
    scheduleTasks.find((t) => t.id === `task-ceremony-${committee.id}`) ??
    scheduleTasks.find((t) => t.type === 'ceremony' && t.committeeId === committee.id);

  // Select day handler
  const handleSelectDayName = (day: string) => {
    setCeremonyDayName(day);
    if (DAY_TO_DATE_MAP[day]) {
      setCeremonyDate(DAY_TO_DATE_MAP[day]);
    }
  };

  // Select date handler
  const handleSelectDate = (dateVal: string) => {
    setCeremonyDate(dateVal);
    setCeremonyDayName(getArabicDayName(dateVal));
  };

  // Open Schedule Modal for a specific committee
  const handleOpenScheduleModal = (comm: Committee) => {
    setTargetCommittee(comm);
    const existingTask = getLinkedCeremonyTask(comm);
    if (existingTask) {
      const d = existingTask.date || todayISO();
      setCeremonyDate(d);
      setCeremonyDayName(getArabicDayName(d));
      setCeremonyTime(existingTask.time || '');
      setCeremonyNotes(existingTask.notes || '');
    } else {
      const today = todayISO();
      setCeremonyDate(today);
      setCeremonyDayName(ARABIC_DAYS[new Date().getDay()]);
      setCeremonyTime('08:00 م (بعد صلاة العشاء)');
      setCeremonyNotes('');
    }
    setHonoredCount(comm.studentsCount || 0);
    setAttendeeIds((comm.ceremonyDetails?.attendees ?? []).map((a) => a.id));
    if (comm.ceremonyDetails?.ceremonyPlace) setCeremonyPlace(comm.ceremonyDetails.ceremonyPlace);
    setIsScheduleModalOpen(true);
  };

  // Saves the ceremony on the committee. The server creates or moves its single calendar task (WEB-08).
  const handleSaveCeremonySchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCommittee) return;
    const ok = await onUpdateCommitteeCeremony(targetCommittee.id, {
      date: ceremonyDate,
      time: ceremonyTime,
      place: ceremonyPlace,
      notes: ceremonyNotes,
      attendeeUserIds: attendeeIds,
      completed: targetCommittee.stages.ceremony?.completed || false,
      honoredCount: Number(honoredCount) || undefined,
    });
    if (ok === false) return;
    setIsScheduleModalOpen(false);
    setTargetCommittee(null);
  };

  // Completing the ceremony stage also completes its calendar task on the server.
  const handleToggleCeremonyComplete = (comm: Committee) => {
    if (!AuthService.canOnCommittee('committees.finalize', comm)) return;
    onToggleCommitteeStage(comm.id, 'ceremony');
  };

  // Filtered Committees
  const filteredCommittees = useMemo(() => {
    return committees.filter((comm) => {
      const isCeremonyDone = comm.stages.ceremony?.completed;
      const linkedTask = getLinkedCeremonyTask(comm);
      const todayIso = todayISO();
      const isTodayCeremony = linkedTask?.date === todayIso;
      const isScheduled = !!linkedTask?.date;

      // Status Filter
      if (filterStatus === 'today' && !isTodayCeremony) return false;
      if (filterStatus === 'scheduled' && (!isScheduled || isCeremonyDone)) return false;
      if (filterStatus === 'completed' && !isCeremonyDone) return false;
      if (filterStatus === 'unscheduled' && (isScheduled || isCeremonyDone)) return false;

      // Book Filter
      if (selectedBook !== 'all' && comm.competitionBook !== selectedBook) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = comm.committeeName.toLowerCase().includes(q);
        const matchNumber = comm.committeeNumber.toString().includes(q);
        const matchSheikh = (comm.sheikhName || '').toLowerCase().includes(q);
        const matchBook = comm.competitionBook.toLowerCase().includes(q);
        const matchPlace = (comm.associationName || '').toLowerCase().includes(q);
        if (!matchName && !matchNumber && !matchSheikh && !matchBook && !matchPlace) {
          return false;
        }
      }

      return true;
    });
  }, [committees, filterStatus, selectedBook, searchQuery, scheduleTasks]);

  // Statistics
  const totalCommitteesCount = committees.length;
  const completedCeremoniesCount = committees.filter((c) => c.stages.ceremony?.completed).length;
  const scheduledUpcomingCount = committees.filter((c) => {
    if (c.stages.ceremony?.completed) return false;
    const task = getLinkedCeremonyTask(c);
    return !!task?.date;
  }).length;
  const todayIso = todayISO();
  const todayCeremoniesCount = committees.filter((c) => {
    const task = getLinkedCeremonyTask(c);
    return task?.date === todayIso;
  }).length;
  const totalStudentsHonored = committees
    .filter((c) => c.stages.ceremony?.completed)
    .reduce((acc, c) => acc + (c.studentsCount || 0), 0);

  return (
    <div className="space-y-6 text-right animate-fadeIn pb-12">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-l from-emerald-900 via-brand to-teal-900 rounded-3xl p-6 sm:p-7 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-amber-300 font-bold text-xs mb-2.5 border border-white/20">
              <span className="material-symbols-outlined text-sm">celebration</span>
              <span>منظومة الحفلات والتكريم وتوزيع الجوائز</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
              إدارة وجدولة حفلات التكريم والختام
            </h1>
            <p className="text-xs sm:text-sm text-teal-100 max-w-2xl mt-1.5 leading-relaxed">
              مربوطة تلقائياً ببيانات لجان المسابقة: أي ميعاد حفل تحدده ينتقل مباشرة إلى <strong>التنبيهات والمهام اليومية</strong> و<strong>تقويم المواعيد</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {onNavigateToDailyAlerts && (
              <button
                type="button"
                onClick={onNavigateToDailyAlerts}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black transition-all shadow-md cursor-pointer active:scale-95"
              >
                <span className="material-symbols-outlined text-base">notifications_active</span>
                <span>التنبيهات اليومية ({todayCeremoniesCount} حفل اليوم) ↗</span>
              </button>
            )}

            {onNavigateToCalendar && (
              <button
                type="button"
                onClick={onNavigateToCalendar}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/30 text-xs font-bold transition-all cursor-pointer active:scale-95"
              >
                <span className="material-symbols-outlined text-base">calendar_month</span>
                <span>عرض التقويم العام ↗</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ceremonies sheet export */}
      <section aria-labelledby="ceremonies-export" className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-2xs flex flex-col lg:flex-row lg:items-end gap-3 text-xs">
        <div className="lg:flex-1">
          <h2 id="ceremonies-export" className="text-sm font-black text-slate-900 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base text-brand">download</span>
            تصدير ومشاركة كشف الحفلات (Excel / PDF)
          </h2>
          <p className="text-slate-500 mt-1">
            الموعد والمكان واسم الشيخ ومكانه وعدد الطلاب المكرمين والمشايخ والمدعوين ومراقبي اللجنة — من {exportRange.from}
            {exportRange.to !== exportRange.from && <> إلى {exportRange.to}</>}
          </p>
        </div>
        <div role="group" aria-label="فترة الكشف" className="inline-flex rounded-xl border border-slate-200 overflow-hidden self-start lg:self-auto">
          {([['day', 'يومي'], ['week', 'أسبوعي'], ['month', 'شهري']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={exportPeriod === key}
              onClick={() => setExportPeriod(key)}
              className={`px-4 py-2 font-bold cursor-pointer transition-all ${exportPeriod === key ? 'bg-brand text-white' : 'bg-white text-slate-700 hover:bg-emerald-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 font-bold text-slate-700">
          <span>{exportPeriod === 'day' ? 'اليوم' : exportPeriod === 'week' ? 'أي يوم في الأسبوع' : 'أي يوم في الشهر'}</span>
          <input
            type="date"
            value={exportAnchor}
            onChange={(e) => setExportAnchor(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand font-mono"
          />
        </label>
        <button
          type="button"
          onClick={handleExportCeremonies}
          disabled={exportCount === 0}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand text-white font-black hover:opacity-90 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-base">table_view</span>
          <span>Excel ({exportCount} حفل)</span>
        </button>
        <button
          type="button"
          onClick={handleExportCeremoniesPdf}
          disabled={exportCount === 0 || pdfBusy !== null}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-700 text-white font-black hover:opacity-90 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="تنزيل كشف الحفلات ملف PDF على الجهاز"
        >
          <span className="material-symbols-outlined text-base">picture_as_pdf</span>
          <span>{pdfBusy === 'period:export' ? 'جاري الإنشاء...' : 'تصدير PDF'}</span>
        </button>
        <button
          type="button"
          onClick={handleShareCeremoniesPdf}
          disabled={exportCount === 0 || pdfBusy !== null}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-black hover:opacity-90 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="مشاركة كشف الحفلات PDF (واتساب وغيره)"
        >
          <span className="material-symbols-outlined text-base">share</span>
          <span>{pdfBusy === 'period:share' ? 'جاري التجهيز...' : 'مشاركة PDF'}</span>
        </button>
      </section>

      {/* «لم يتم الحفل» / «تم الحفل» reports, organised like the course sheets */}
      <section aria-labelledby="ceremony-status-pdf" className="bg-white rounded-2xl border border-amber-200 p-4 shadow-2xs space-y-3 text-xs">
        <div>
          <h2 id="ceremony-status-pdf" className="text-sm font-black text-slate-900 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base text-amber-600">picture_as_pdf</span>
            كشف «لم يتم الحفل» و«تم الحفل» (PDF)
          </h2>
          <p className="text-slate-500 mt-1">بنفس بيانات الكشوفات: اسم الشيخ، المكان، الكتاب، عدد الطلاب، وموعد ومكان الحفل، مع الإجمالي.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(['not_held', 'held'] as const).map((status) => (
            <div key={status} className={`rounded-xl border p-3 flex flex-col gap-2 ${status === 'held' ? 'border-emerald-200 bg-emerald-50/40' : 'border-orange-200 bg-orange-50/40'}`}>
              <span className="font-black text-slate-800">
                {CEREMONY_STATUS_LABEL[status]} ({statusCounts[status]} لجنة)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => runPdf(status, 'export', statusPdf(status), `لا توجد لجان «${CEREMONY_STATUS_LABEL[status]}»`)}
                  disabled={statusCounts[status] === 0 || pdfBusy !== null}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-700 text-white font-black hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={`تصدير كشف ${CEREMONY_STATUS_LABEL[status]} PDF`}
                >
                  <span className="material-symbols-outlined text-base">picture_as_pdf</span>
                  <span>{pdfBusy === `${status}:export` ? 'جاري الإنشاء...' : 'تصدير PDF'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => runPdf(status, 'share', statusPdf(status), `لا توجد لجان «${CEREMONY_STATUS_LABEL[status]}»`)}
                  disabled={statusCounts[status] === 0 || pdfBusy !== null}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white font-black hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={`مشاركة كشف ${CEREMONY_STATUS_LABEL[status]} PDF`}
                >
                  <span className="material-symbols-outlined text-base">share</span>
                  <span>{pdfBusy === `${status}:share` ? 'جاري التجهيز...' : 'مشاركة'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <MyCeremonies committees={committees} scheduleTasks={scheduleTasks} onOpenCommitteeDetails={onOpenCommitteeDetails} />

      {/* 2. Key Performance Indicators (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-bold block">إجمالي لجان المسابقة</span>
            <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">
              {totalCommitteesCount}
            </span>
          </div>
          <span className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">groups</span>
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-2xs flex items-center justify-between bg-amber-50/30">
          <div>
            <span className="text-xs text-amber-800 font-bold block">
              حفلات اليوم ({ARABIC_DAYS[new Date().getDay()]} {new Date().getDate()}/{new Date().getMonth() + 1})
            </span>
            <span className="text-2xl font-black text-amber-700 font-mono mt-1 block">
              {todayCeremoniesCount}
            </span>
          </div>
          <span className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">event_available</span>
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-blue-200 p-4 shadow-2xs flex items-center justify-between bg-blue-50/30">
          <div>
            <span className="text-xs text-blue-800 font-bold block">حفلات مجدولة قادمة</span>
            <span className="text-2xl font-black text-blue-700 font-mono mt-1 block">
              {scheduledUpcomingCount}
            </span>
          </div>
          <span className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-800 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">schedule</span>
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-2xs flex items-center justify-between bg-emerald-50/30">
          <div>
            <span className="text-xs text-emerald-800 font-bold block">
              تم التكريم والحفل ({Math.round((completedCeremoniesCount / (totalCommitteesCount || 1)) * 100)}%)
            </span>
            <span className="text-2xl font-black text-emerald-700 font-mono mt-1 block">
              {completedCeremoniesCount}
            </span>
          </div>
          <span className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">emoji_events</span>
          </span>
        </div>
      </div>

      {/* 3. Filter and Search Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <span className="material-symbols-outlined absolute right-3 top-2.5 text-slate-400 text-lg">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث برقم اللجنة، الشيخ، الكتاب، المسجد..."
            className="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:bg-white focus:border-brand outline-none"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          {/* Status Tabs */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterStatus === 'all'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل ({totalCommitteesCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('today')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterStatus === 'today'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              حفلات اليوم ({todayCeremoniesCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('scheduled')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterStatus === 'scheduled'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              المجدولة ({scheduledUpcomingCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('completed')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterStatus === 'completed'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              المكتملة ({completedCeremoniesCount})
            </button>
          </div>

          {/* Book Filter */}
          <select
            value={selectedBook}
            onChange={(e) => setSelectedBook(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 focus:border-brand outline-none shrink-0"
          >
            <option value="all">كافة المتون والكتب</option>
            {competitionBooks.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4. Ceremonies Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filteredCommittees.length === 0 ? (
          <div className="col-span-full bg-white rounded-3xl border border-slate-200 p-12 text-center">
            <span className="material-symbols-outlined text-5xl text-slate-400 mb-3 block">
              celebration
            </span>
            <h3 className="text-base font-bold text-slate-800 mb-1">
              لا توجد حفلات مطابقة للبحث أو التصفية الحالية
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              يمكنك اختيار تصفية أخرى أو جدولة موعد حفل جديد لأي لجنة من لجان المسابقة.
            </p>
          </div>
        ) : (
          filteredCommittees.map((comm) => {
            const isCompleted = comm.stages.ceremony?.completed;
            const linkedTask = getLinkedCeremonyTask(comm);
            const todayIso = todayISO();
            const isToday = linkedTask?.date === todayIso;
            const hasSchedule = !!linkedTask?.date;

            return (
              <div
                key={comm.id}
                className={`bg-white rounded-3xl border p-5 shadow-xs transition-all flex flex-col justify-between relative overflow-hidden ${
                  isCompleted
                    ? 'border-emerald-300 ring-2 ring-emerald-100 bg-emerald-50/10'
                    : isToday
                    ? 'border-amber-400 ring-2 ring-amber-200 bg-amber-50/20'
                    : hasSchedule
                    ? 'border-blue-200 hover:border-blue-400'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Top Badge & Number */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-10 h-10 rounded-2xl bg-emerald-700 text-white flex items-center justify-center font-black font-mono shadow-xs text-base">
                        #{comm.committeeNumber}
                      </span>
                      <div>
                        <span className="text-xs font-bold text-slate-400 block font-mono">
                          {comm.branch || '—'}
                        </span>
                        <h3 className="text-sm font-black text-slate-900 leading-tight">
                          {comm.committeeName}
                        </h3>
                      </div>
                    </div>

                    {/* Status Pill */}
                    <div>
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black border border-emerald-300">
                          <span className="material-symbols-outlined text-xs">verified</span>
                          <span>
                            {comm.stages.ceremony?.completedAt?.includes('تلقائياً')
                              ? 'تم الحفل تلقائياً'
                              : 'تم الحفل والتكريم'}
                          </span>
                        </span>
                      ) : isToday ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400 text-slate-950 text-xs font-black shadow-xs animate-pulse">
                          <span className="material-symbols-outlined text-xs">alarm_on</span>
                          <span>حفل اليوم ({getArabicDayName(linkedTask?.date)})</span>
                        </span>
                      ) : hasSchedule ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 text-xs font-bold border border-blue-200">
                          <span className="material-symbols-outlined text-xs">schedule</span>
                          <span>مجدول: يوم {getArabicDayName(linkedTask?.date)}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
                          <span>بانتظار تحديد اليوم والموعد</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Details Meta */}
                  <div className="space-y-2 py-3 border-y border-slate-100 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400">الكتاب / المسابقة:</span>
                      <span className="font-bold text-slate-800">{comm.competitionBook}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400">الشيخ المشرف:</span>
                      <span className="font-bold text-brand">{comm.sheikhName || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400">عدد الطلاب المكرمين:</span>
                      <span className="font-black text-slate-900 font-mono bg-slate-100 px-2 py-0.5 rounded-md">
                        {comm.studentsCount || 0} طالب
                      </span>
                    </div>

                    {comm.ceremonyDetails?.attendees && comm.ceremonyDetails.attendees.length > 0 && (
                      <p className="text-xs text-slate-600">
                        <span className="text-slate-400">المدعوون: </span>
                        {comm.ceremonyDetails.attendees.map((a) => a.name).join('، ')}
                      </p>
                    )}
                    {/* Scheduled Info Box */}
                    {hasSchedule && (
                      <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-2.5 mt-2 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-blue-950">
                          <span className="material-symbols-outlined text-sm text-blue-700">event</span>
                          <span>
                            الموعد: يوم {getArabicDayName(linkedTask?.date)} ({linkedTask?.date}) — {linkedTask?.time || 'لم يحدد الوقت'}
                          </span>
                        </div>
                        {linkedTask?.notes && (
                          <div className="text-xs text-blue-800 leading-tight">
                            📍 {linkedTask.notes}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-4 space-y-2">
                  {/* Primary Action Button */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenScheduleModal(comm)}
                      className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs cursor-pointer transition-all active:scale-95"
                    >
                      <span className="material-symbols-outlined text-sm text-slate-600">edit_calendar</span>
                      <span>{hasSchedule ? 'تعديل الميعاد واليوم' : 'جدولة الميعاد واليوم'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleCeremonyComplete(comm)}
                      disabled={!AuthService.canOnCommittee('committees.finalize', comm)}
                      className={`w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95 ${
                        isCompleted
                          ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                          : 'bg-brand hover:bg-brand-deep text-white shadow-xs'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {isCompleted ? 'published_with_changes' : 'done_all'}
                      </span>
                      <span>{isCompleted ? 'إلغاء التمام' : 'إتمام الحفل الآن'}</span>
                    </button>
                  </div>

                  {/* Certificate / Honor Roll Button */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setHonorRollCommittee(comm)}
                      className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">workspace_premium</span>
                      <span>كشف التكريم والشهادات</span>
                    </button>

                    {onEditCommittee && AuthService.canOnCommittee('committees.update', comm) && (
                      <button
                        type="button"
                        onClick={() => onEditCommittee(comm)}
                        aria-label={`تعديل بيانات لجنة ${comm.committeeNumber}`}
                        className="text-xs font-bold text-brand hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                        <span>تعديل بيانات اللجنة</span>
                      </button>
                    )}

                    {onOpenCommitteeDetails && (
                      <button
                        type="button"
                        onClick={() => onOpenCommitteeDetails(comm)}
                        className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        تفاصيل اللجنة ↗
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 5. Schedule Ceremony Modal */}
      {isScheduleModalOpen && targetCommittee && (
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-200 text-right">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black">
                  <span className="material-symbols-outlined text-2xl">celebration</span>
                </span>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    جدولة حفل تكريم لجنة #{targetCommittee.committeeNumber}
                  </h3>
                  <span className="text-xs text-slate-500">
                    {targetCommittee.committeeName} — {targetCommittee.competitionBook}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsScheduleModalOpen(false);
                  setTargetCommittee(null);
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveCeremonySchedule} className="space-y-4 text-xs">
              {/* Day selection input */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <label className="block text-slate-800 font-bold">
                  اختر يوم الحفل <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {ARABIC_DAYS.map((day) => {
                    const isSelected = ceremonyDayName === day;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => handleSelectDayName(day)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-brand text-white shadow-xs scale-105'
                            : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
                <div className="text-xs text-brand font-semibold mt-1">
                  ✓ اليوم المحدد حالياً: <strong>يوم {ceremonyDayName}</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    تاريخ الحفل <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={ceremonyDate}
                    onChange={(e) => handleSelectDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold focus:bg-white focus:border-brand outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    وقت وتوقيت الحفل <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={ceremonyTime}
                    onChange={(e) => setCeremonyTime(e.target.value)}
                    placeholder="مثال: 08:00 م (بعد صلاة العشاء)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:bg-white focus:border-brand outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  مكان إقامة الحفل <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={ceremonyPlace}
                  onChange={(e) => setCeremonyPlace(e.target.value)}
                  placeholder="مثال: القاعة الكبرى - مسجد الإمام البخاري"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:bg-white focus:border-brand outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    عدد الطلاب المكرمين والشهادات
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={honoredCount}
                    onChange={(e) => setHonoredCount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold focus:bg-white focus:border-brand outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    الشيخ المكرم
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={targetCommittee.sheikhName || ''}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 font-bold cursor-not-allowed"
                  />
                </div>
              </div>

              <AttendeePicker selectedIds={attendeeIds} onChange={setAttendeeIds} />

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  ملاحظات وترتيبات الحفل (اختياري)
                </label>
                <textarea
                  rows={2}
                  value={ceremonyNotes}
                  onChange={(e) => setCeremonyNotes(e.target.value)}
                  placeholder="مثال: تجهيز أجهزة الصوتيات والدروع التذكارية وكشف توقيعات استلام الجوائز..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium focus:bg-white focus:border-brand outline-none"
                />
              </div>

              <p className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-950 font-bold text-xs">
                يظهر الموعد تلقائياً في التنبيهات اليومية وتقويم المواعيد ليوم ({ceremonyDate}).
              </p>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsScheduleModalOpen(false);
                    setTargetCommittee(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-deep text-white font-bold cursor-pointer shadow-md"
                >
                  حفظ وتأكيد الميعاد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Certificate & Honor Roll View Modal */}
      {honorRollCommittee && (
        <div role="dialog" aria-modal="true" aria-label="نافذة" className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 text-right">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-2xl bg-emerald-700 text-white flex items-center justify-center font-black">
                  <span className="material-symbols-outlined text-2xl">workspace_premium</span>
                </span>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    كشف شرف وتكريم لجنة #{honorRollCommittee.committeeNumber}
                  </h3>
                  <span className="text-xs text-slate-500">
                    مسابقة: {honorRollCommittee.competitionBook}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHonorRollCommittee(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Certificate Preview Card */}
            <div className="border-4 border-double border-amber-400 bg-gradient-to-b from-amber-50/50 via-white to-amber-50/30 rounded-2xl p-6 text-center space-y-3 relative overflow-hidden shadow-inner">
              <div className="text-xs font-black text-emerald-900 tracking-widest">
                بِسْمِ اللَّـهِ الرَّحْمَـٰنِ الرَّحِيمِ
              </div>
              <div className="text-xs font-bold text-slate-500">
                مسجد الإمام البخاري — الدورة العلمية المكثفة
              </div>
              <h2 className="text-lg font-black text-amber-900 font-serif">
                شهادة تكريم وتقدير واجتياز
              </h2>
              <p className="text-xs text-slate-700 leading-relaxed max-w-md mx-auto">
                يُشهد بأن طلاب لجنة <strong>(#{honorRollCommittee.committeeNumber} - {honorRollCommittee.committeeName})</strong> بإشراف فضيلة الشيخ <strong>{honorRollCommittee.sheikhName || '—'}</strong> قد أتموا بنجاح اختبار كتاب:
              </p>
              <div className="inline-block px-4 py-1.5 rounded-xl bg-emerald-800 text-white font-black text-sm shadow-xs">
                📖 {honorRollCommittee.competitionBook}
              </div>
              <div className="text-xs text-slate-600 pt-2 font-mono">
                عدد الطلاب المكرمين: {honorRollCommittee.studentsCount || 0} طالب وطالبة
              </div>
            </div>

            <div className="pt-5 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs cursor-pointer shadow-xs"
              >
                <span className="material-symbols-outlined text-base">print</span>
                <span>طباعة شهادات التكريم</span>
              </button>

              <button
                type="button"
                onClick={() => setHonorRollCommittee(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
