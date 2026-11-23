import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DATA_ROOT_KEY, useCacheSetter, useServerData, useLiveRefresh, useSettings } from './data/queries';
import { overdueCommittees } from './utils/overdue';
import { applyFont } from './utils/fonts';
import {
  Committee,
  StageKey,
  NotificationItem,
  ExamItem,
  STAGES_LIST,
  AppUser,
  Course,
  ScheduleTask,
  SYSTEM_PERMISSIONS,
} from './types';
import { calculateCurrentStage, todayISO } from './utils/stageUtils';
import { CommitteeStep, planCommitteeSave } from './utils/committeeChanges';
import { createKeyedQueue } from './utils/keyedQueue';
import { exportExamInProgressToExcel, printExamInProgress } from './utils/reportExport';
import { readTabFromHash, writeTabToHash } from './utils/hashRoute';
import { SummerCourseRow } from './types/summerCourse';
import { Sidebar, NavTab } from './components/Sidebar';
import { TopNavBar } from './components/TopNavBar';
import { HeroStats } from './components/HeroStats';
import { SearchAndFilters } from './components/SearchAndFilters';
import { CommitteeCard } from './components/CommitteeCard';
import { CommitteeDetailModal } from './components/CommitteeDetailModal';
import { AddCommitteeModal } from './components/AddCommitteeModal';
import { AddExamModal } from './components/AddExamModal';
import { AddBookModal } from './components/AddBookModal';
const ExamsView = lazy(() => import('./components/ExamsView').then((m) => ({ default: m.ExamsView })));
const CoursesView = lazy(() => import('./components/CoursesView').then((m) => ({ default: m.CoursesView })));
const CalendarScheduleView = lazy(() => import('./components/CalendarScheduleView').then((m) => ({ default: m.CalendarScheduleView })));
const AssistantsView = lazy(() => import('./components/AssistantsView').then((m) => ({ default: m.AssistantsView })));
const AuditLogView = lazy(() => import('./components/AuditLogView').then((m) => ({ default: m.AuditLogView })));
import { AuthModal } from './components/AuthModal';
import { ForcedPasswordChange } from './components/ForcedPasswordChange';
import { ExportModal } from './components/ExportModal';
import { HomeOverviewView } from './components/HomeOverviewView';
const StatisticsView = lazy(() => import('./components/StatisticsView').then((m) => ({ default: m.StatisticsView })));
const SummerCourseTrackerView = lazy(() => import('./components/SummerCourseTrackerView').then((m) => ({ default: m.SummerCourseTrackerView })));
import { PhoneRail } from './components/PhoneRail';
import { SystemSettingsModal } from './components/SystemSettingsModal';
const DailyAlertsView = lazy(() => import('./components/DailyAlertsView').then((m) => ({ default: m.DailyAlertsView })));
const CeremoniesView = lazy(() => import('./components/CeremoniesView').then((m) => ({ default: m.CeremoniesView })));
import { Footer } from './components/Footer';
import { CentralLoginPortal } from './components/CentralLoginPortal';
import { SupabaseDatabaseModal } from './components/SupabaseDatabaseModal';
import { Toasts, toast } from './components/Toasts';
import { useAuth, AuthService, type AccessChanges } from './services/AuthService';
import { AvailabilityView } from './components/AvailabilityView';
import { ImpersonationBanner } from './components/ImpersonationBanner';
import { Book, CommitteeAction, DataService } from './services/DataService';
import { ApiError, errorMessage } from './services/api';

/** Runs a server call; on failure shows the server's message and returns undefined. */
async function attempt<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const result = await fn();
    if (success) toast.success(success);
    return result;
  } catch (err) {
    toast.error(errorMessage(err));
    return undefined;
  }
}


// Stable empty values, so a missing query result does not create a new array on every render.
const NO_COMMITTEES: Committee[] = [];
const NO_EXAMS: ExamItem[] = [];
const NO_BOOKS: Book[] = [];
const NO_COURSES: Course[] = [];
const NO_TASKS: ScheduleTask[] = [];
/** The course the user last chose, remembered on this device only. */
const CURRENT_COURSE_KEY = 'bukhari-current-course';
const NO_NOTIFICATIONS: NotificationItem[] = [];

export default function App() {
  // The open screen is kept in the URL hash, so reloads, Back and shared links work (WEB-17).
  const [activeTab, setActiveTabState] = useState<NavTab>(() => readTabFromHash() ?? 'home');
  const setActiveTab = useCallback((tab: NavTab) => {
    setActiveTabState(tab);
    writeTabToHash(tab);
  }, []);
  useEffect(() => {
    const onHash = () => {
      const tab = readTabFromHash();
      if (tab) setActiveTabState(tab);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('bukhari_sidebar_desktop_open');
      if (saved !== null) return JSON.parse(saved);
    } catch {
      // ignore
    }
    // A small laptop window starts with the menu closed so the content gets the width.
    return typeof window === 'undefined' || window.innerWidth >= 1280;
  });

  const handleToggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsMobileSidebarOpen((prev) => !prev);
    } else {
      setIsSidebarOpen((prev) => {
        const next = !prev;
        try {
          localStorage.setItem('bukhari_sidebar_desktop_open', JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    }
  };

  // ---- Server data (never cached in localStorage) ----

  const {
    ready,
    currentUser,
    users,
    profiles,
    can,
    logout,
    updateUser,
    approveUser,
    scheduleInterview,
    rejectUser,
    deleteUser,
    createUser,
    saveProfile,
    deleteProfile,
    assignProfileToUser,
    setSuperAdmin,
    resetPassword,
  } = useAuth();

  // Server data lives in the query cache, keyed by the logged-in user. The setters below keep
  // their old names and call sites, but they write to the cache, so every screen reads one copy.
  const queryClient = useQueryClient();
  const server = useServerData(currentUser?.id);
  // The font chosen in «إعدادات النظام».
  // Only once the real settings arrived: the defaults shown before must not replace the font this
  // device remembers (that made it download two fonts).
  const { query: settingsQuery } = useSettings(Boolean(currentUser));
  const chosenFont = settingsQuery.data?.font_family;
  useEffect(() => {
    if (chosenFont) void applyFont(chosenFont);
  }, [chosenFont]);
  // Changes made elsewhere (another phone, another admin) appear without reloading the page.
  useLiveRefresh(Boolean(currentUser) && !currentUser?.mustChangePassword);
  // Every course stands alone: all screens show only the current course's data. The raw lists
  // (all courses) are used only to keep the cache, to place people on committees and to list courses.
  const allCommittees = server.queries.committees.data ?? NO_COMMITTEES;
  const exams = server.queries.exams.data ?? NO_EXAMS;
  const books = server.queries.books.data ?? NO_BOOKS;
  const courses = server.queries.courses.data ?? NO_COURSES;
  const allTasks = server.queries.tasks.data ?? NO_TASKS;
  const allNotifications = server.queries.notifications.data ?? NO_NOTIFICATIONS;
  const [storedCourseId, setStoredCourseId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CURRENT_COURSE_KEY);
    } catch {
      return null;
    }
  });
  // The chosen course if it still exists, else the default (current) course, else any active one.
  const currentCourseId =
    courses.find((c) => c?.id === storedCourseId)?.id ??
    courses.find((c) => c?.isDefault)?.id ??
    courses.find((c) => c?.status === 'active')?.id ??
    courses[0]?.id;
  const committees = useMemo(
    () => (currentCourseId ? allCommittees.filter((c) => c.courseId === currentCourseId || !c.courseId) : allCommittees),
    [allCommittees, currentCourseId]
  );
  // Tasks and notices about a committee of another course are hidden; general ones stay.
  const courseOfCommittee = useMemo(() => new Map(allCommittees.map((c) => [c.id, c.courseId])), [allCommittees]);
  const inCurrentCourse = (committeeId?: string | null) => {
    if (!committeeId || !currentCourseId) return true;
    const course = courseOfCommittee.get(committeeId);
    return !course || course === currentCourseId;
  };
  const scheduleTasks = useMemo(
    () => allTasks.filter((t) => inCurrentCourse(t.committeeId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTasks, courseOfCommittee, currentCourseId]
  );
  const notifications = useMemo(
    () => allNotifications.filter((n) => inCurrentCourse(n.committeeId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allNotifications, courseOfCommittee, currentCourseId]
  );
  // Only system permissions grant anything (D-01); custom labels are no longer offered.
  const customPermissions = SYSTEM_PERMISSIONS;
  const savedBooks = useMemo(() => books.map((b) => b.name), [books]);
  const setCommittees = useCacheSetter(server.keys.committees, NO_COMMITTEES);
  const setExams = useCacheSetter(server.keys.exams, NO_EXAMS);
  const setBooks = useCacheSetter(server.keys.books, NO_BOOKS);
  const setCourses = useCacheSetter(server.keys.courses, NO_COURSES);
  const setScheduleTasks = useCacheSetter(server.keys.tasks, NO_TASKS);
  const setNotifications = useCacheSetter(server.keys.notifications, NO_NOTIFICATIONS);
  const isLoadingDatabase = Object.values(server.queries).some((q) => q.isLoading);
  const failedQuery = Object.values(server.queries).find((q) => q.error);
  const loadError = failedQuery?.error ? errorMessage(failedQuery.error) : null;
  const loadAll = () => {
    void server.refetchAll();
  };

  // On logout, drop all cached server data so the next user never sees it.
  useEffect(() => {
    if (!currentUser?.id) queryClient.removeQueries({ queryKey: DATA_ROOT_KEY });
  }, [currentUser?.id, queryClient]);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);


  const replaceCommittee = (saved: Committee) =>
    setCommittees((prev) => (prev.some((c) => c.id === saved.id) ? prev.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...prev]));
  const replaceTask = (saved: ScheduleTask) =>
    setScheduleTasks((prev) => (prev.some((t) => t.id === saved.id) ? prev.map((t) => (t.id === saved.id ? saved : t)) : [saved, ...prev]));

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState<'all' | 'late' | StageKey>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'committeeNumber' | 'book'>('newest');
  const [assistantOnlyFilter, setAssistantOnlyFilter] = useState(false);
  const [needsScoringFilter, setNeedsScoringFilter] = useState(false);
  const [genderFilter, setGenderFilter] = useState<'all' | 'men' | 'women'>('all');

  // Users only see screens the server's permissions make useful to them.
  useEffect(() => {
    if (!currentUser || currentUser.role === 'super_admin') return;
    if (!AuthService.canAccessTab(activeTab, currentUser)) setActiveTab('home');
  }, [currentUser, activeTab, setActiveTab]);

  const ITEMS_PER_PAGE = 6;
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedCommitteeId, setSelectedCommitteeId] = useState<string | null>(null);
  const selectedCommitteeForDetails = useMemo(
    () => committees.find((c) => c.id === selectedCommitteeId) ?? null,
    [committees, selectedCommitteeId]
  );
  // «تعديل» buttons open the same details window, scrolled to the data form.
  const [detailStartsInEdit, setDetailStartsInEdit] = useState(false);
  const setSelectedCommitteeForDetails = (c: Committee | null) => {
    setDetailStartsInEdit(false);
    setSelectedCommitteeId(c?.id ?? null);
  };
  const openCommitteeEditor = (c: Committee) => {
    setDetailStartsInEdit(true);
    setSelectedCommitteeId(c.id);
  };
  const [isAddCommitteeOpen, setIsAddCommitteeOpen] = useState(false);
  const [isAddExamOpen, setIsAddExamOpen] = useState(false);
  const [isAddBookOpen, setIsAddBookOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // ---------------- Committees ----------------

  // Saves of one committee run one at a time, each with the version the previous one returned (WEB-10).
  const committeeQueue = useMemo(() => createKeyedQueue(), []);
  /** Sheet edits per committee that are still being saved (see onUpdateCommitteeFields). */
  const pendingFieldEdits = useRef<Record<string, Partial<Committee>>>({});

  const latestCommittee = (id: string) =>
    queryClient.getQueryData<Committee[]>(server.keys.committees)?.find((c) => c.id === id);

  const runStep = async (step: CommitteeStep, current: Committee): Promise<Committee> => {
    if (step.kind === 'action') return DataService.committeeAction(current.id, step.action, current.updatedAt);
    if (step.kind === 'patchScoring') {
      return DataService.patchCommittee(current.id, { scoringDetails: step.scoringDetails, expectedUpdatedAt: current.updatedAt });
    }
    return DataService.saveCommittee({ ...step.committee, updatedAt: current.updatedAt });
  };

  /**
   * Applies the steps in order. Success is reported only after the server confirmed every step
   * (WEB-09); on failure the server's message is shown and the committee is reloaded, so screens
   * fall back to what is really stored. Returns whether everything was saved.
   */
  const runCommitteeSteps = (committeeId: string, steps: CommitteeStep[], success?: string): Promise<boolean> =>
    committeeQueue.run(committeeId, async () => {
      if (steps.length === 0) return true;
      let current = latestCommittee(committeeId);
      if (!current) return false;
      try {
        for (const step of steps) {
          current = await runStep(step, current);
          replaceCommittee(current);
        }
        // The server keeps the ceremony's calendar task in step with the ceremony's date and stage.
        if (steps.some((st) => st.kind === 'action' && (st.action.type === 'scheduleCeremony' || ('stage' in st.action && st.action.stage === 'ceremony')))) {
          void queryClient.invalidateQueries({ queryKey: server.keys.tasks });
        }
        if (success) toast.success(success);
        return true;
      } catch (err) {
        toast.error(errorMessage(err));
        void server.queries.committees.refetch();
        return false;
      }
    });

  const runCommitteeAction = (committeeId: string, action: CommitteeAction, success?: string) =>
    runCommitteeSteps(committeeId, [{ kind: 'action', action }], success);

  const handleQuickToggleStage = (committeeId: string, stageKey: StageKey) => {
    const c = committees.find((x) => x.id === committeeId);
    if (!c) return;
    const done = Boolean(c.stages[stageKey]?.completed);
    void runCommitteeAction(committeeId, done ? { type: 'reopenStage', stage: stageKey } : { type: 'completeStage', stage: stageKey });
  };

  const handleSetStage = (committeeId: string, stageKey: StageKey, completed: boolean) =>
    runCommitteeAction(committeeId, completed ? { type: 'completeStage', stage: stageKey } : { type: 'reopenStage', stage: stageKey });

  /** Saves edits from the detail modal as the smallest set of server calls; resolves to success. */
  const handleSaveCommittee = async (updated: Committee): Promise<boolean> => {
    const existing = latestCommittee(updated.id);
    if (!existing) {
      const saved = await attempt(() => DataService.saveCommittee(updated), 'تم حفظ بيانات اللجنة');
      if (saved) replaceCommittee(saved);
      return Boolean(saved);
    }
    const steps = planCommitteeSave(existing, updated);
    if (steps.some((st) => st.kind === 'saveBase') && !AuthService.canOnCommittee('committees.update', existing)) {
      toast.error('ليس لديك صلاحية تعديل البيانات الأساسية للجنة');
      return false;
    }
    return runCommitteeSteps(updated.id, steps, steps.length ? 'تم الحفظ' : undefined);
  };

  const handleAddCommittee = async (newComm: Committee, newBookName?: string) => {
    const saved = await attempt(() => DataService.saveCommittee(newComm), `تم تسجيل اللجنة رقم ${newComm.committeeNumber}`);
    if (!saved) return undefined;
    replaceCommittee(saved);
    if (newBookName && !savedBooks.includes(newBookName) && can('books.write')) await handleAddBook(newBookName);
    return saved;
  };

  // Opens the committee linked to a course-sheet row. Creating a committee from a row needs the
  // user's explicit confirmation (WEB-15) and the right to create committees.
  const handleOpenRowDetails = async (row: SummerCourseRow) => {
    const matched =
      committees.find((c) => row.committeeId && c.id === row.committeeId) ||
      committees.find((c) => c.committeeNumber === row.number && (!row.courseId || c.courseId === row.courseId));
    if (matched) {
      setSelectedCommitteeForDetails(matched);
      return;
    }
    if (!can('committees.create')) {
      toast.error('لا توجد لجنة مسجلة لهذا الصف، وإنشاء اللجان غير متاح لك');
      return;
    }
    const courseId = row.courseId || courses.find((c) => c.isDefault)?.id;
    if (!courseId) {
      toast.error('حدد الدورة التي يتبعها هذا الصف قبل فتح تفاصيل اللجنة');
      return;
    }
    if (!window.confirm(`لا توجد لجنة رقم ${row.number} في هذه الدورة. هل تريد إنشاءها من بيانات هذا الصف؟`)) return;
    const created = await handleAddCommittee({
      id: row.committeeId || `comm-${crypto.randomUUID()}`,
      committeeNumber: row.number,
      committeeName: row.sheikh_name ? `لجنة ${row.sheikh_name}` : `لجنة #${row.number}`,
      sheikhName: row.sheikh_name || undefined,
      studentsCount: row.students_count || 0,
      branch: row.place || '',
      competitionBook: row.book || '',
      courseId,
      members: [],
      generalNotes: row.notes || '',
      // Stages are completed through the workflow afterwards; a new committee starts empty.
      stages: Object.fromEntries(STAGES_LIST.map((st) => [st.key, { completed: false }])) as Committee['stages'],
      createdDate: todayISO(),
      createdAtTime: '',
    });
    if (created) setSelectedCommitteeForDetails(created);
  };

  const handleDeleteCommittee = async (committeeId: string) => {
    const ok = await attempt(() => DataService.deleteCommittee(committeeId), 'تم حذف اللجنة');
    if (ok) setCommittees((prev) => prev.filter((c) => c.id !== committeeId));
  };

  const handleReceiveCommittee = (committeeId: string, cancel = false) =>
    runCommitteeAction(
      committeeId,
      cancel ? { type: 'cancelReception' } : { type: 'receive', status: 'received' },
      cancel ? 'تم إلغاء توثيق الاستلام' : 'تم توثيق استلام اللجنة'
    );

  const handleApproveExamReadiness = (committeeId: string, revoke = false) =>
    runCommitteeAction(
      committeeId,
      revoke ? { type: 'revokeReadiness' } : { type: 'approveReadiness' },
      revoke ? 'تم إلغاء اعتماد الجاهزية' : 'تم اعتماد جاهزية الامتحان'
    );

  /** The server stores the ceremony and keeps its single calendar task in step (WEB-08). */
  const handleUpdateCommitteeCeremony = async (
    committeeId: string,
    info: { date: string; time: string; place: string; notes?: string; completed: boolean; honoredCount?: number; attendingSheikhs?: string[]; attendeeUserIds?: string[] }
  ) => {
    const c = committees.find((x) => x.id === committeeId);
    if (!c) {
      toast.error('اللجنة غير موجودة');
      return false;
    }
    const steps: CommitteeStep[] = [
      {
        kind: 'action',
        action: {
          type: 'scheduleCeremony',
          ceremonyDate: info.date || null,
          ceremonyTime: info.time || null,
          ceremonyPlace: info.place || null,
          notes: info.notes || null,
          honoredStudentsCount: info.honoredCount ?? c.ceremonyDetails?.honoredStudentsCount ?? null,
          attendingSheikhs: info.attendingSheikhs ?? c.ceremonyDetails?.attendingSheikhs ?? [],
          ...(info.attendeeUserIds ? { attendeeUserIds: info.attendeeUserIds } : {}),
        },
      },
    ];
    const done = Boolean(c.stages.ceremony?.completed);
    if (info.completed !== done) {
      steps.push({ kind: 'action', action: info.completed ? { type: 'completeStage', stage: 'ceremony' } : { type: 'reopenStage', stage: 'ceremony' } });
    }
    return runCommitteeSteps(committeeId, steps, 'تم حفظ موعد الحفل');
  };

  // ---------------- Exams & books ----------------

  /** One outcome message per action (WEB-24): either everything was saved, or what failed is said. */
  const handleAddExam = async (newExam: ExamItem, file?: File) => {
    let saved: ExamItem;
    try {
      saved = await DataService.saveExam(newExam);
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
    let final = saved;
    if (file) {
      try {
        await DataService.uploadExamFile(saved.id, file, file.name);
        final = { ...saved, hasFile: true, pdfFileName: file.name };
      } catch (err) {
        setExams((prev) => [saved, ...prev.filter((e) => e.id !== saved.id)]);
        toast.error(`تم حفظ بيانات الامتحان، لكن تعذر رفع ملف PDF: ${errorMessage(err)}. ارفعه من بطاقة الامتحان.`);
        return true;
      }
    }
    setExams((prev) => [final, ...prev.filter((e) => e.id !== final.id)]);
    toast.success(file ? 'تم حفظ الامتحان ورفع الملف' : 'تم حفظ الامتحان');
    if (newExam.book && !savedBooks.includes(newExam.book) && can('books.write')) await handleAddBook(newExam.book);
    return true;
  };

  const handleUploadExamFile = async (examId: string, file: File) => {
    const ok = await attempt(() => DataService.uploadExamFile(examId, file, file.name), 'تم رفع ملف الامتحان');
    if (ok) setExams((prev) => prev.map((e) => (e.id === examId ? { ...e, hasFile: true, pdfFileName: file.name } : e)));
  };

  const handleDeleteExam = async (examId: string) => {
    const ok = await attempt(() => DataService.deleteExam(examId), 'تم حذف الامتحان');
    if (ok) setExams((prev) => prev.filter((e) => e.id !== examId));
  };

  const handleAddBook = async (bookName: string) => {
    const name = bookName.trim();
    if (!name || savedBooks.includes(name)) return;
    const saved = await attempt(() => DataService.saveBook({ id: `book-${crypto.randomUUID()}`, name }), 'تمت إضافة الكتاب');
    if (saved) setBooks((prev) => [...prev, saved].sort((a, b) => a.name.localeCompare(b.name, 'ar')));
  };

  const handleDeleteBook = async (bookName: string) => {
    const book = books.find((b) => b.name === bookName);
    if (!book) return;
    const ok = await attempt(() => DataService.deleteBook(book.id), 'تم حذف الكتاب');
    if (ok) setBooks((prev) => prev.filter((b) => b.id !== book.id));
  };

  // ---------------- Users ----------------

  const handleApproveAssistant = (userId: string, access: AccessChanges = {}) =>
    attempt(() => approveUser(userId, access), 'تم اعتماد الحساب');

  const handleScheduleInterview = (userId: string, interviewDate: string, interviewNotes?: string) =>
    attempt(() => scheduleInterview(userId, interviewDate, interviewNotes), 'تم تحديد موعد المقابلة');

  const handleRejectAssistant = (userId: string, reason?: string) =>
    attempt(() => rejectUser(userId, reason), 'تم تسجيل الاعتذار عن الطلب');

  const handleUpdateAssistantUser = (updatedUser: AppUser, access?: AccessChanges) =>
    attempt(() => updateUser(updatedUser, access), 'تم حفظ بيانات المستخدم');

  const handleAddAssistantDirect = (newUserData: Omit<AppUser, 'id' | 'createdAt'> & { password: string }) =>
    attempt(() => createUser(newUserData), 'تم إنشاء الحساب، وسيُطلب منه تغيير كلمة المرور عند أول دخول');

  const handleDeleteAssistant = (userId: string) => attempt(() => deleteUser(userId), 'تم حذف المستخدم');

  const handleResetPassword = (userId: string, temporaryPassword: string) =>
    attempt(() => resetPassword(userId, temporaryPassword), 'تمت إعادة تعيين كلمة المرور، وسيُطلب منه اختيار كلمة جديدة');

  // ---------------- Courses ----------------

  const handleAddCourse = async (newCourseData: Omit<Course, 'id' | 'createdAt'>): Promise<Course | undefined> => {
    const saved = await attempt(
      () => DataService.saveCourse({ ...newCourseData, id: `course-${crypto.randomUUID()}`, createdAt: todayISO() }),
      `تمت إضافة الدورة: ${newCourseData.name}`
    );
    if (!saved) return undefined;
    setCourses((prev) => [saved, ...prev.map((c) => (saved.isDefault ? { ...c, isDefault: false } : c))]);
    return saved;
  };

  const handleUpdateCourse = async (updatedCourse: Course) => {
    const saved = await attempt(() => DataService.saveCourse(updatedCourse), 'تم حفظ الدورة');
    if (!saved) return;
    setCourses((prev) => prev.map((c) => (c.id === saved.id ? saved : saved.isDefault ? { ...c, isDefault: false } : c)));
    // The server renames the course on its committees too.
    setCommittees((prev) => prev.map((c) => (c.courseId === saved.id ? { ...c, courseName: saved.name } : c)));
  };

  /** A course with sheet rows is deleted only after the user confirms the rows go too (API-27). */
  const handleDeleteCourse = async (courseId: string) => {
    try {
      await DataService.deleteCourse(courseId);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 409 && err.message.includes('كشف'))) {
        toast.error(errorMessage(err));
        return;
      }
      if (!window.confirm(err.message)) return;
      const ok = await attempt(() => DataService.deleteCourse(courseId, true));
      if (!ok) return;
    }
    toast.success('تم حذف الدورة');
    setCourses((prev) => prev.filter((c) => c.id !== courseId));
  };

  const handleSetDefaultCourse = (courseId: string) => {
    const target = courses.find((c) => c.id === courseId);
    if (target) handleUpdateCourse({ ...target, isDefault: true, status: 'active' });
  };

  // ---------------- Tasks ----------------

  /** Tasks reference the committee and the assignee by id; the server fills in number and name (WEB-07). */
  const handleAddScheduleTask = async (newTaskData: Omit<ScheduleTask, 'id'>) => {
    const saved = await attempt(() => DataService.saveTask({ ...newTaskData, id: `task-${crypto.randomUUID()}` }), 'تمت جدولة المهمة');
    if (saved) replaceTask(saved);
    return Boolean(saved);
  };

  const handleToggleTaskComplete = async (taskId: string) => {
    const task = scheduleTasks.find((t) => t.id === taskId);
    if (!task) return;
    const saved = await attempt(() => DataService.toggleTask(taskId, !task.completed));
    if (saved) replaceTask(saved);
    // Ticking a ceremony in the calendar records «تم الحفل» on its committee (server side).
    if (saved && taskId.startsWith('task-ceremony-')) void server.queries.committees.refetch();
  };

  const handleDeleteScheduleTask = async (taskId: string) => {
    const ok = await attempt(() => DataService.deleteTask(taskId), 'تم حذف المهمة');
    if (ok) setScheduleTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  // ---------------- Session ----------------

  const handleLogout = () => {
    setSelectedCommitteeId(null);
    setActiveTab('home');
    logout();
  };

  const handleMarkNotificationsAsRead = async () => {
    if (!notifications.some((n) => !n.read)) return;
    const ok = await attempt(() => DataService.markAllNotificationsRead());
    if (ok) setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  // ---------------- Derived values ----------------

  // Late committees (the «متأخرة» filter): same rules as the home page and daily alerts.
  const { settings: appSettings } = useSettings(Boolean(currentUser));
  const lateIds = useMemo(
    () => new Set(overdueCommittees(committees, { overdueDays: appSettings.overdue_days, tasks: scheduleTasks }).map((x) => x.committee.id)),
    [committees, appSettings.overdue_days, scheduleTasks]
  );
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: committees.length };
    STAGES_LIST.forEach((s) => {
      counts[s.key] = 0;
    });
    committees.forEach((c) => {
      const status = calculateCurrentStage(c.stages);
      counts[status.key] = (counts[status.key] || 0) + 1;
    });
    counts.late = lateIds.size;
    return counts;
  }, [committees, lateIds]);

  const activeCommitteesCount = useMemo(() => committees.filter((c) => !c.stages.ceremony?.completed).length, [committees]);
  const completedCeremonyCount = useMemo(() => committees.filter((c) => c.stages.ceremony?.completed).length, [committees]);

  const filteredCommittees = useMemo(() => {
    let list = [...committees];
    if (selectedStage === 'late') list = list.filter((c) => lateIds.has(c.id));
    else if (selectedStage !== 'all') list = list.filter((c) => calculateCurrentStage(c.stages).key === selectedStage);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          String(c.committeeNumber).includes(q) ||
          c.committeeName.toLowerCase().includes(q) ||
          c.competitionBook.toLowerCase().includes(q) ||
          c.branch.toLowerCase().includes(q) ||
          (c.associationName && c.associationName.toLowerCase().includes(q)) ||
          c.members.some((m) => m.toLowerCase().includes(q)) ||
          (c.sheikhName && c.sheikhName.toLowerCase().includes(q)) ||
          (c.sheikhPhone && c.sheikhPhone.toLowerCase().includes(q)) ||
          (c.sheikhCountry && c.sheikhCountry.toLowerCase().includes(q)) ||
          (c.generalNotes && c.generalNotes.toLowerCase().includes(q))
      );
    }
    if (genderFilter === 'women') list = list.filter((c) => c.isWomenCommittee);
    else if (genderFilter === 'men') list = list.filter((c) => !c.isWomenCommittee);
    if ((currentUser?.role === 'sheikh' || currentUser?.role === 'committee_head') && assistantOnlyFilter) {
      list = list.filter((c) => AuthService.canAccessCommittee(c));
    }
    if (needsScoringFilter) list = list.filter((c) => c.scoringDetails?.questions?.some((q) => !q.completed));
    if (sortBy === 'newest') list.sort((a, b) => b.committeeNumber - a.committeeNumber);
    else if (sortBy === 'oldest' || sortBy === 'committeeNumber') list.sort((a, b) => a.committeeNumber - b.committeeNumber);
    else if (sortBy === 'book') list.sort((a, b) => a.competitionBook.localeCompare(b.competitionBook, 'ar'));
    return list;
  }, [committees, selectedStage, searchQuery, sortBy, assistantOnlyFilter, needsScoringFilter, currentUser, genderFilter, lateIds]);

  const totalPages = Math.ceil(filteredCommittees.length / ITEMS_PER_PAGE) || 1;
  const paginatedCommittees = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredCommittees.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredCommittees, currentPage]);
  const startIndexDisplay = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endIndexDisplay = Math.min(currentPage * ITEMS_PER_PAGE, filteredCommittees.length);

  const selectCourse = (courseId: string) => {
    setStoredCourseId(courseId);
    setSelectedCommitteeId(null);
    setCurrentPage(1);
    try {
      localStorage.setItem(CURRENT_COURSE_KEY, courseId);
    } catch {
      // Private window or blocked storage: the choice just lasts until the page is reloaded.
    }
  };
  const nextCommitteeNumber = useMemo(
    () => (committees.length === 0 ? 1 : Math.max(...committees.map((c) => c.committeeNumber), 0) + 1),
    [committees]
  );

  // Join requests are announced (badges) to admins and super admins only.
  const pendingAssistantsCount = useMemo(
    () => (currentUser?.role === 'super_admin' || currentUser?.role === 'admin' ? users.filter((u) => u.status === 'pending').length : 0),
    [users, currentUser?.role]
  );
  const todaysTasksCount = useMemo(() => {
    const today = todayISO();
    return scheduleTasks.filter((t) => t.date === today && !t.completed).length;
  }, [scheduleTasks]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas text-ink-soft" role="status">
        جارٍ التحقق من الجلسة...
      </div>
    );
  }

  // Unauthenticated users see the login / join-request portal.
  if (!currentUser) {
    return (
      <>
        <CentralLoginPortal />
        <Toasts />
      </>
    );
  }

  // After an admin reset the password, nothing else opens until a new one is chosen (WEB-02).
  if (currentUser.mustChangePassword) {
    return (
      <>
        <ForcedPasswordChange currentUser={currentUser} onLogout={handleLogout} />
        <Toasts />
      </>
    );
  }

  return (
    <div className="bg-canvas text-ink min-h-screen flex text-right selection:bg-brand-light selection:text-[#00201d]">
      {/* 1. Sidebar Navigation (التابات في الجنب) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpenMobile={isMobileSidebarOpen}
        setIsOpenMobile={setIsMobileSidebarOpen}
        isOpenDesktop={isSidebarOpen}
        onToggleSidebar={handleToggleSidebar}
        committeesCount={committees.length}
        examsCount={exams.length}
        coursesCount={courses.length}
        calendarTasksCount={scheduleTasks.filter((t) => !t.completed).length}
        pendingAssistantsCount={pendingAssistantsCount}
        todaysTasksCount={todaysTasksCount}
        ceremoniesCount={committees.filter((c) => c.stages.ceremony?.completed).length}
        onOpenNewCommittee={() => setIsAddCommitteeOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        currentUser={currentUser}
      />

      {/* 2. Main Content Canvas */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen max-lg:overflow-x-hidden transition-all duration-300">
        <ImpersonationBanner />
        {/* Top Header */}
        <TopNavBar
          currentUser={currentUser}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onOpenNewCommittee={() => setIsAddCommitteeOpen(true)}
          onOpenExport={() => setIsExportOpen(true)}
          onOpenDatabaseModal={can('database.admin') ? () => setIsSupabaseModalOpen(true) : undefined}
          canBackup={can('database.backup')}
          canSendNotifications={can('notifications.create')}
          committees={committees}
          courses={courses}
          currentCourseId={currentCourseId}
          onSelectCourse={selectCourse}
          onNotificationSent={() => void server.queries.notifications.refetch()}
          onSignOut={handleLogout}
          notifications={notifications}
          onOpenNotificationCommittee={(commId) => {
            const found = committees.find((c) => c.id === commId);
            if (found) {
              setSelectedCommitteeForDetails(found);
            }
          }}
          onMarkNotificationsAsRead={handleMarkNotificationsAsRead}
          onToggleSidebar={handleToggleSidebar}
          isSidebarOpen={isSidebarOpen}
          todaysTasksCount={todaysTasksCount}
          onNavigateToDailyAlerts={() => setActiveTab('daily_alerts')}
        />

        {/* Tab Views */}
        <main className="flex-1 w-full min-w-0 max-w-[2200px] mx-auto pl-2.5 pr-14 sm:pl-6 sm:pr-[5.5rem] lg:px-6 2xl:px-10 py-3 sm:py-8 lg:pb-8">
          <Suspense fallback={<div role="status" aria-live="polite" className="py-16 text-center text-sm text-muted">جاري التحميل…</div>}>
          {isLoadingDatabase && (
            <div role="status" className="mb-4 rounded-xl bg-[#dce9ff]/60 text-ink text-sm px-4 py-3">
              جارٍ تحميل البيانات من الخادم...
            </div>
          )}
          {loadError && (
            <div role="alert" className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <span>تعذر تحميل البيانات: {loadError}</span>
              <button type="button" onClick={loadAll} className="px-3 py-1.5 rounded-lg bg-red-700 text-white text-xs font-bold cursor-pointer">
                إعادة المحاولة
              </button>
            </div>
          )}
          {activeTab === 'home' && (
            <HomeOverviewView
              committees={committees}
              allCommittees={allCommittees}
              currentCourseId={currentCourseId}
              currentUser={currentUser}
              courses={courses}
              scheduleTasks={scheduleTasks}
              onNavigateTab={setActiveTab}
              onNavigateCommittees={(stageFilter) => {
                setActiveTab('committees');
                if (stageFilter && stageFilter !== 'all') {
                  setSelectedStage(stageFilter as StageKey | 'late');
                } else {
                  setSelectedStage('all');
                }
                setCurrentPage(1);
              }}
              onOpenDetails={(c) => setSelectedCommitteeForDetails(c)}
              onOpenNewCommittee={() => setIsAddCommitteeOpen(true)}
            />
          )}

          {activeTab === 'summer_course' && (
            <SummerCourseTrackerView
              committees={committees}
              courses={courses}
              currentCourseId={currentCourseId}
              onSelectCourse={selectCourse}
              currentUser={currentUser}
              onSetCommitteeStage={handleSetStage}
              onAddCommitteeFromRow={(newComm) => handleAddCommittee(newComm)}
              onUpdateCommitteeCourse={(committeeId, courseId) => {
                const target = committees.find((c) => c.id === committeeId);
                if (target) handleSaveCommittee({ ...target, courseId });
              }}
              onUpdateCommitteeFields={(committeeId, patch) => {
                // Cells edited one after another (name, then place) are saved together: a later save carries the
                // earlier edits still on their way, so it never writes the old value back over them.
                const merged = { ...pendingFieldEdits.current[committeeId], ...patch };
                pendingFieldEdits.current[committeeId] = merged;
                const target = latestCommittee(committeeId);
                if (!target) return false;
                return handleSaveCommittee({ ...target, ...merged }).finally(() => {
                  if (pendingFieldEdits.current[committeeId] === merged) delete pendingFieldEdits.current[committeeId];
                });
              }}
              onAddCourse={handleAddCourse}
              onNavigateToCommittees={() => setActiveTab('committees')}
              onOpenCommitteeDetails={handleOpenRowDetails}
            />
          )}

          {activeTab === 'exams' && (
            <ExamsView
              exams={exams}
              savedBooks={savedBooks}
              onOpenAddExam={() => setIsAddExamOpen(true)}
              onOpenAddBook={() => setIsAddBookOpen(true)}
              onDeleteExam={handleDeleteExam}
              onDeleteBook={handleDeleteBook}
              onUploadFile={handleUploadExamFile}
            />
          )}

          {activeTab === 'assistants' && (
            <AssistantsView
              users={users}
              committees={allCommittees}
              exams={exams}
              currentUser={currentUser}
              profiles={profiles}
              onSaveProfile={saveProfile}
              onDeleteProfile={deleteProfile}
              courses={courses}
              onAssignProfile={(uId, pId) => attempt(() => assignProfileToUser(uId, pId), 'تم تطبيق البروفايل')}
              onSetSuperAdmin={setSuperAdmin}
              onApproveAssistant={handleApproveAssistant}
              onScheduleInterview={handleScheduleInterview}
              onRejectAssistant={handleRejectAssistant}
              onUpdateAssistantUser={handleUpdateAssistantUser}
              onAddAssistantDirect={handleAddAssistantDirect}
              onDeleteAssistant={handleDeleteAssistant}
              onResetPassword={handleResetPassword}
              onOpenAuthModal={() => setIsAuthModalOpen(true)}
              onOpenCommitteeDetails={(c) => setSelectedCommitteeForDetails(c)}
              onCommitteeChanged={replaceCommittee}
              customPermissions={customPermissions}
            />
          )}

          {activeTab === 'courses' && (
            <CoursesView
              courses={courses}
              committees={allCommittees}
              currentCourseId={currentCourseId}
              currentUser={currentUser}
              onAddCourse={handleAddCourse}
              onUpdateCourse={handleUpdateCourse}
              onDeleteCourse={handleDeleteCourse}
              onSetDefaultCourse={handleSetDefaultCourse}
              onNavigateCommitteesByCourse={(courseId) => {
                selectCourse(courseId);
                setActiveTab('committees');
                setCurrentPage(1);
              }}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarScheduleView
              tasks={scheduleTasks}
              committees={committees}
              currentUser={currentUser}
              onAddTask={handleAddScheduleTask}
              onToggleTaskComplete={handleToggleTaskComplete}
              onDeleteTask={handleDeleteScheduleTask}
              onOpenCommitteeDetails={(c) => setSelectedCommitteeForDetails(c)}
              onUpdateCommitteeCeremony={handleUpdateCommitteeCeremony}
            />
          )}

          {activeTab === 'stats' && (
            <StatisticsView committees={committees} allCommittees={allCommittees} courses={courses} currentCourseId={currentCourseId} />
          )}

          {activeTab === 'audit' && <AuditLogView />}
          {activeTab === 'availability' && <AvailabilityView />}

          {activeTab === 'ceremonies' && (
            <CeremoniesView
              committees={committees}
              scheduleTasks={scheduleTasks}
              currentUser={currentUser}
              onUpdateCommitteeCeremony={handleUpdateCommitteeCeremony}
              onToggleCommitteeStage={handleQuickToggleStage}
              onAddTask={handleAddScheduleTask}
              onDeleteTask={handleDeleteScheduleTask}
              onToggleTaskComplete={handleToggleTaskComplete}
              onOpenCommitteeDetails={(c) => setSelectedCommitteeForDetails(c)}
              onEditCommittee={openCommitteeEditor}
              onNavigateToDailyAlerts={() => setActiveTab('daily_alerts')}
              onNavigateToCalendar={() => setActiveTab('calendar')}
            />
          )}

          {activeTab === 'daily_alerts' && (
            <DailyAlertsView
              tasks={scheduleTasks}
              committees={committees}
              currentUser={currentUser}
              onToggleTaskComplete={handleToggleTaskComplete}
              onAddTask={handleAddScheduleTask}
              onDeleteTask={handleDeleteScheduleTask}
              onNavigateToCalendar={() => setActiveTab('calendar')}
              onOpenCommitteeDetails={(c) => setSelectedCommitteeForDetails(c)}
              onNavigateToCeremonies={() => setActiveTab('ceremonies')}
              onUpdateCommitteeCeremony={handleUpdateCommitteeCeremony}
            />
          )}

          {activeTab === 'committees' && (
            <>
              {/* Assigned committees bar for committee heads and sheikhs */}
              {(currentUser.role === 'sheikh' || currentUser.role === 'committee_head') && (
                <div className="mb-6 p-4 rounded-2xl bg-gradient-to-l from-emerald-50 via-teal-50 to-white border border-teal-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-bold text-brand text-sm block flex items-center gap-1.5 mb-1">
                      <span className="material-symbols-outlined text-lg">person_pin</span>
                      <span>مرحباً بك: {currentUser.name} ({AuthService.getRoleLabel(currentUser.role)})</span>
                    </span>
                    <span className="text-ink-soft block leading-relaxed">
                      اللجان المسندة إليك:{' '}
                      <strong>
                        {currentUser.allCommitteesAllowed
                          ? 'كل اللجان'
                          : currentUser.assignedCommittees.map((c) => `#${c}`).join('، ') || 'لم تُسند إليك لجان بعد'}
                      </strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setAssistantOnlyFilter(!assistantOnlyFilter);
                        setNeedsScoringFilter(false);
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 ${
                        assistantOnlyFilter
                          ? 'bg-brand text-white'
                          : 'bg-white border border-line text-ink hover:bg-emerald-50'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">filter_alt</span>
                      <span>لجاني المسندة فقط ({currentUser.allCommitteesAllowed ? 'الكل' : (currentUser.assignedCommitteeIds ?? []).length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setNeedsScoringFilter(!needsScoringFilter);
                        setAssistantOnlyFilter(false);
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 ${
                        needsScoringFilter
                          ? 'bg-amber-600 text-white'
                          : 'bg-white border border-amber-300 text-amber-900 hover:bg-amber-50'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">edit_note</span>
                      <span>لجان بها أسئلة تحتاج تصحيح</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Hero Stats */}
              <HeroStats
                totalCommittees={committees.length}
                activeCommittees={activeCommitteesCount}
                completedCommittees={completedCeremonyCount}
                onAddCommittee={can('committees.create') ? () => setIsAddCommitteeOpen(true) : undefined}
              />

              {/* Search & Actions Toolbar */}
              <SearchAndFilters
                searchQuery={searchQuery}
                setSearchQuery={(q) => {
                  setSearchQuery(q);
                  setCurrentPage(1);
                }}
                selectedStage={selectedStage}
                setSelectedStage={(stg) => {
                  setSelectedStage(stg);
                  setCurrentPage(1);
                }}
                stageCounts={stageCounts}
                sortBy={sortBy}
                setSortBy={setSortBy}
                genderFilter={genderFilter}
                setGenderFilter={(g) => {
                  setGenderFilter(g);
                  setCurrentPage(1);
                }}
                onExportExamInProgress={() => {
                  const n = exportExamInProgressToExcel(committees);
                  if (n === 0) toast.info('لا توجد لجان في مرحلة «في انتظار الامتحان» حالياً');
                  else toast.success(`تم تصدير كشف ${n} لجنة جاري امتحانها الآن`);
                }}
                onPrintExamInProgress={() => {
                  if (printExamInProgress(committees) === 0) toast.info('لا توجد لجان في مرحلة «في انتظار الامتحان» حالياً');
                }}
              />

              {/* Committees Grid */}
              {paginatedCommittees.length > 0 ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-6">
                  {paginatedCommittees.map((committee) => (
                    <CommitteeCard
                      key={committee.id}
                      committee={committee}
                      currentUser={currentUser}
                      onReceiveCommittee={handleReceiveCommittee}
                      onApproveExamReadiness={handleApproveExamReadiness}
                      onViewDetails={(c) => setSelectedCommitteeForDetails(c)}
                      onEditCommittee={openCommitteeEditor}
                      onQuickToggleStage={handleQuickToggleStage}
                      onDeleteCommittee={can('committees.delete') ? handleDeleteCommittee : undefined}
                    />
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-2xl p-12 text-center border border-line/40 shadow-xs">
                  <span className="material-symbols-outlined text-4xl text-muted mb-2 block">
                    search_off
                  </span>
                  <h3 className="font-bold text-base text-ink mb-1">
                    لا توجد لجان مطابقة لمعايير البحث
                  </h3>
                  <p className="text-xs text-muted mb-4">
                    جرب تغيير كلمات البحث، أو إزالة التصفية لعرض اللجان الأخرى.
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedStage('all');
                    }}
                    className="px-4 py-2 rounded-xl bg-brand text-white text-xs font-semibold hover:bg-success cursor-pointer"
                  >
                    إعادة ضبط البحث والتصفية
                  </button>
                </div>
              )}

              {/* Bottom Pagination */}
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-line/40">
                <div className="text-[13px] text-ink-soft">
                  عرض{' '}
                  <span className="font-semibold text-ink">
                    {filteredCommittees.length > 0
                      ? `${startIndexDisplay} إلى ${endIndexDisplay}`
                      : '0'}
                  </span>{' '}
                  من إجمالي{' '}
                  <span className="font-semibold text-ink">
                    {filteredCommittees.length}
                  </span>{' '}
                  لجنة مسجلة
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-line/60 text-muted hover:text-ink hover:bg-[#dce9ff]/40 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    title="الصفحة السابقة"
                  >
                    <span className="material-symbols-outlined text-lg">chevron_right</span>
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                    <button
                      key={pg}
                      onClick={() => setCurrentPage(pg)}
                      className={`w-9 h-9 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        currentPage === pg
                          ? 'bg-brand text-white'
                          : 'border border-line/60 text-ink hover:bg-[#dce9ff]/40'
                      }`}
                    >
                      {pg}
                    </button>
                  ))}

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-line/60 text-ink hover:bg-[#dce9ff]/40 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    title="الصفحة التالية"
                  >
                    <span className="material-symbols-outlined text-lg">chevron_left</span>
                  </button>
                </div>
              </div>
            </>
          )}
          </Suspense>
        </main>

        {/* Phones: a thin rail with a button per page (replaces the bottom bar and the floating button). */}
        <PhoneRail
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          currentUser={currentUser}
          pendingAssistantsCount={pendingAssistantsCount}
          todaysTasksCount={todaysTasksCount}
          onOpenMore={can('settings.write') ? () => setIsMobileSidebarOpen(true) : undefined}
        />

        {/* Footer */}
        <Footer />
      </div>

      {/* Modals */}
      {isSettingsOpen && <SystemSettingsModal onClose={() => setIsSettingsOpen(false)} />}
      <CommitteeDetailModal
        committee={selectedCommitteeForDetails}
        startInEdit={detailStartsInEdit}
        currentUser={currentUser}
        courses={courses}
        onReceiveCommittee={handleReceiveCommittee}
        onApproveExamReadiness={handleApproveExamReadiness}
        onClose={() => setSelectedCommitteeForDetails(null)}
        onSaveCommittee={handleSaveCommittee}
        onCommitteeChanged={replaceCommittee}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {isAddCommitteeOpen && <AddCommitteeModal
        isOpen={isAddCommitteeOpen}
        onClose={() => setIsAddCommitteeOpen(false)}
        onAddCommittee={handleAddCommittee}
        nextCommitteeNumber={nextCommitteeNumber}
        savedBooks={savedBooks}
        courses={courses}
        defaultCourseId={currentCourseId}
        onAddCourse={handleAddCourse}
      />}

      {isAddExamOpen && <AddExamModal
        isOpen={isAddExamOpen}
        onClose={() => setIsAddExamOpen(false)}
        onAddExam={handleAddExam}
        savedBooks={savedBooks}
      />}

      {isAddBookOpen && <AddBookModal
        isOpen={isAddBookOpen}
        onClose={() => setIsAddBookOpen(false)}
        onAddBook={handleAddBook}
        existingBooks={savedBooks}
      />}

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        committees={filteredCommittees}
      />

      <SupabaseDatabaseModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
        onRefreshData={loadAll}
      />
      <Toasts />
    </div>
  );
}
