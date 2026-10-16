/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DATA_ROOT_KEY, useCacheSetter, useServerData } from './data/queries';
import {
  Committee,
  StageKey,
  NotificationItem,
  ExamItem,
  STAGES_LIST,
  AppUser,
  AssistantPermission,
  PermissionDefinition,
  Course,
  ScheduleTask,
  SYSTEM_PERMISSIONS,
} from './types';
import { calculateCurrentStage, getCurrentFormattedDateTime, todayISO } from './utils/stageUtils';
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
import { AuthModal } from './components/AuthModal';
import { ExportModal } from './components/ExportModal';
import { HomeOverviewView } from './components/HomeOverviewView';
const StatisticsView = lazy(() => import('./components/StatisticsView').then((m) => ({ default: m.StatisticsView })));
const SummerCourseTrackerView = lazy(() => import('./components/SummerCourseTrackerView').then((m) => ({ default: m.SummerCourseTrackerView })));
import { MobileBottomNav } from './components/MobileBottomNav';
const DailyAlertsView = lazy(() => import('./components/DailyAlertsView').then((m) => ({ default: m.DailyAlertsView })));
const CeremoniesView = lazy(() => import('./components/CeremoniesView').then((m) => ({ default: m.CeremoniesView })));
import { Footer } from './components/Footer';
import { CentralLoginPortal } from './components/CentralLoginPortal';
import { SupabaseDatabaseModal } from './components/SupabaseDatabaseModal';
import { Toasts, toast } from './components/Toasts';
import { useAuth, AuthService } from './services/AuthService';
import { Book, CommitteePatch, DataService } from './services/DataService';
import { errorMessage } from './services/api';

const BASE_COMMITTEE_FIELDS = [
  'committeeNumber', 'committeeName', 'associationName', 'members', 'branch', 'competitionBook', 'generalNotes',
  'courseId', 'sheikhName', 'sheikhPhone', 'sheikhCountry', 'studentsCount', 'isWomenCommittee',
] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

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
const NO_NOTIFICATIONS: NotificationItem[] = [];
const NO_PERMISSIONS: PermissionDefinition[] = [];

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('bukhari_sidebar_desktop_open');
      if (saved !== null) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return true;
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
  } = useAuth();

  // Server data lives in the query cache, keyed by the logged-in user. The setters below keep
  // their old names and call sites, but they write to the cache, so every screen reads one copy.
  const queryClient = useQueryClient();
  const server = useServerData(currentUser?.id);
  const committees = server.queries.committees.data ?? NO_COMMITTEES;
  const exams = server.queries.exams.data ?? NO_EXAMS;
  const books = server.queries.books.data ?? NO_BOOKS;
  const courses = server.queries.courses.data ?? NO_COURSES;
  const scheduleTasks = server.queries.tasks.data ?? NO_TASKS;
  const notifications = server.queries.notifications.data ?? NO_NOTIFICATIONS;
  const customPermissions = useMemo(
    () => [...SYSTEM_PERMISSIONS, ...(server.queries.customPermissions.data ?? [])],
    [server.queries.customPermissions.data]
  );
  const savedBooks = useMemo(() => books.map((b) => b.name), [books]);
  const setCommittees = useCacheSetter(server.keys.committees, NO_COMMITTEES);
  const setExams = useCacheSetter(server.keys.exams, NO_EXAMS);
  const setBooks = useCacheSetter(server.keys.books, NO_BOOKS);
  const setCourses = useCacheSetter(server.keys.courses, NO_COURSES);
  const setScheduleTasks = useCacheSetter(server.keys.tasks, NO_TASKS);
  const setNotifications = useCacheSetter(server.keys.notifications, NO_NOTIFICATIONS);
  // The cache holds custom permissions only; the system ones are added above.
  const setCustomPermissions = useCacheSetter(server.keys.customPermissions, NO_PERMISSIONS);
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
  const [selectedStage, setSelectedStage] = useState<'all' | StageKey>('all');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string | 'all'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'committeeNumber' | 'book'>('newest');
  const [assistantOnlyFilter, setAssistantOnlyFilter] = useState(false);
  const [needsScoringFilter, setNeedsScoringFilter] = useState(false);
  const [genderFilter, setGenderFilter] = useState<'all' | 'men' | 'women'>('all');

  // Non-admin users only see tabs they are allowed to open.
  useEffect(() => {
    if (!currentUser || currentUser.role === 'super_admin') return;
    if (!AuthService.canAccessTab(activeTab, currentUser)) {
      const allTabs: NavTab[] = ['home', 'summer_course', 'committees', 'exams', 'ceremonies', 'calendar', 'courses', 'assistants', 'stats', 'daily_alerts'];
      setActiveTab(allTabs.find((t) => AuthService.canAccessTab(t, currentUser)) || 'home');
    }
  }, [currentUser, activeTab]);

  const ITEMS_PER_PAGE = 6;
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedCommitteeId, setSelectedCommitteeId] = useState<string | null>(null);
  const selectedCommitteeForDetails = useMemo(
    () => committees.find((c) => c.id === selectedCommitteeId) ?? null,
    [committees, selectedCommitteeId]
  );
  const setSelectedCommitteeForDetails = (c: Committee | null) => setSelectedCommitteeId(c?.id ?? null);
  const [isAddCommitteeOpen, setIsAddCommitteeOpen] = useState(false);
  const [isAddExamOpen, setIsAddExamOpen] = useState(false);
  const [isAddBookOpen, setIsAddBookOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // ---------------- Committees ----------------

  const patchCommittee = async (committeeId: string, patch: CommitteePatch, success?: string) => {
    const saved = await attempt(() => DataService.patchCommittee(committeeId, patch), success);
    if (saved) replaceCommittee(saved);
    return saved;
  };

  const handleQuickToggleStage = (committeeId: string, stageKey: StageKey) => {
    const c = committees.find((x) => x.id === committeeId);
    if (!c) return;
    const isDone = Boolean(c.stages[stageKey]?.completed);
    patchCommittee(committeeId, {
      stages: { [stageKey]: { completed: !isDone, completedAt: !isDone ? getCurrentFormattedDateTime() : undefined } },
    });
  };

  const handleSetStage = (committeeId: string, stageKey: StageKey, completed: boolean) =>
    patchCommittee(committeeId, {
      stages: { [stageKey]: { completed, completedAt: completed ? getCurrentFormattedDateTime() : undefined } },
    });

  /** Ceremony schedule task linked to the committee, built only from what the user entered. */
  const syncCeremonyTask = async (committee: Committee) => {
    const d = committee.ceremonyDetails;
    if (!d?.ceremonyDate || !can('tasks.write')) return;
    const existing = scheduleTasks.find((t) => t.type === 'ceremony' && t.committeeId === committee.id);
    const sheikhs = d.attendingSheikhs?.filter(Boolean) ?? [];
    const task: ScheduleTask = {
      id: existing?.id ?? `task-ceremony-${committee.id}`,
      title: `حفل تكريم لجنة #${committee.committeeNumber} (${committee.sheikhName || committee.committeeName})`,
      date: d.ceremonyDate,
      time: d.ceremonyTime || undefined,
      type: 'ceremony',
      priority: 'urgent',
      committeeId: committee.id,
      committeeNumber: committee.committeeNumber,
      deliverable: [
        d.honoredStudentsCount ? `تكريم ${d.honoredStudentsCount} طالباً` : '',
        sheikhs.length ? `حضور: ${sheikhs.join('، ')}` : '',
      ].filter(Boolean).join(' • ') || undefined,
      notes: [d.ceremonyPlace ? `مكان الحفل: ${d.ceremonyPlace}` : '', d.notes || ''].filter(Boolean).join('. ') || undefined,
      completed: committee.stages?.ceremony?.completed || false,
    };
    const saved = await attempt(() => DataService.saveTask(task));
    if (saved) replaceTask(saved);
  };

  /**
   * Saves edits from the detail modal. Users who may edit the whole committee get one
   * transactional save; others (assistants, teachers) send only the stage/detail changes
   * they are allowed to make.
   */
  const handleSaveCommittee = async (updated: Committee) => {
    const existing = committees.find((c) => c.id === updated.id);
    let saved: Committee | undefined;
    if (!existing || can('committees.update')) {
      saved = await attempt(() => DataService.saveCommittee(updated), 'تم حفظ بيانات اللجنة');
    } else {
      if (BASE_COMMITTEE_FIELDS.some((f) => !same((updated as any)[f], (existing as any)[f]))) {
        toast.error('ليس لديك صلاحية تعديل البيانات الأساسية للجنة');
        return;
      }
      const patch: CommitteePatch = { expectedUpdatedAt: (existing as any).updatedAt };
      const changedStages = Object.fromEntries(
        Object.entries(updated.stages).filter(([k, v]) => !same(v, existing.stages[k as StageKey]))
      );
      if (Object.keys(changedStages).length) patch.stages = changedStages;
      if (!same(updated.scoringDetails, existing.scoringDetails)) patch.scoringDetails = updated.scoringDetails;
      if (!same(updated.aggregationDetails, existing.aggregationDetails)) patch.aggregationDetails = updated.aggregationDetails;
      if (!same(updated.ceremonyDetails, existing.ceremonyDetails)) patch.ceremonyDetails = updated.ceremonyDetails;
      if (Object.keys(patch).length === 1) return;
      saved = await attempt(() => DataService.patchCommittee(updated.id, patch), 'تم حفظ التعديلات');
    }
    if (!saved) return;
    replaceCommittee(saved);
    if (!same(saved.ceremonyDetails, existing?.ceremonyDetails)) await syncCeremonyTask(saved);
  };

  const handleAddCommittee = async (newComm: Committee, newBookName?: string) => {
    const saved = await attempt(() => DataService.saveCommittee(newComm), `تم تسجيل اللجنة رقم ${newComm.committeeNumber}`);
    if (!saved) return undefined;
    replaceCommittee(saved);
    if (newBookName && !savedBooks.includes(newBookName) && can('books.write')) await handleAddBook(newBookName);
    return saved;
  };

  // Opens the committee linked to a course-sheet row, creating it from the row's own data if needed.
  const handleOpenRowDetails = async (row: SummerCourseRow) => {
    const matched =
      committees.find((c) => row.committeeId && c.id === row.committeeId) ||
      committees.find((c) => c.committeeNumber === row.number && (!row.courseId || c.courseId === row.courseId));
    if (matched) {
      setSelectedCommitteeForDetails(matched);
      return;
    }
    const courseId = row.courseId || courses.find((c) => c.isDefault)?.id;
    if (!courseId) {
      toast.error('حدد الدورة التي يتبعها هذا الصف قبل فتح تفاصيل اللجنة');
      return;
    }
    const now = getCurrentFormattedDateTime();
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
      stages: {
        registration: { completed: true, completedAt: now },
        exam: { completed: row.delivered },
        scoring: { completed: row.corrected },
        aggregation: { completed: false },
        review: { completed: row.reviewed },
        sheet: { completed: false },
        accreditation: { completed: false },
        announcement: { completed: row.announced },
        ceremony: { completed: row.ceremony },
      },
      createdDate: now.split(' - ')[0],
      createdAtTime: now.split(' - ')[1] || '',
    });
    if (created) setSelectedCommitteeForDetails(created);
  };

  const handleDeleteCommittee = async (committeeId: string) => {
    const ok = await attempt(() => DataService.deleteCommittee(committeeId), 'تم حذف اللجنة');
    if (ok) setCommittees((prev) => prev.filter((c) => c.id !== committeeId));
  };

  const handleReceiveCommittee = (committeeId: string) =>
    patchCommittee(committeeId, { receivedByAssistant: { status: 'received' } }, 'تم توثيق استلام اللجنة');

  const handleApproveExamReadiness = (committeeId: string) =>
    patchCommittee(committeeId, { examApprovedBy: {} }, 'تم اعتماد جاهزية الامتحان');

  const handleUpdateCommitteeCeremony = async (
    committeeId: string,
    info: { date: string; time: string; place: string; notes?: string; completed: boolean; honoredCount?: number; attendingSheikhs?: string[] }
  ) => {
    const c = committees.find((x) => x.id === committeeId);
    if (!c) return;
    const saved = await patchCommittee(
      committeeId,
      {
        ceremonyDetails: {
          honoredStudentsCount: info.honoredCount ?? c.ceremonyDetails?.honoredStudentsCount,
          attendingSheikhs: info.attendingSheikhs ?? c.ceremonyDetails?.attendingSheikhs ?? [],
          ceremonyDate: info.date,
          ceremonyTime: info.time,
          ceremonyPlace: info.place,
          notes: info.notes,
        },
        stages: {
          ceremony: {
            completed: info.completed,
            completedAt: info.completed ? `${info.date} ${info.time}`.trim() : undefined,
          },
        },
      },
      'تم حفظ موعد الحفل'
    );
    if (saved) await syncCeremonyTask(saved);
  };

  // ---------------- Exams & books ----------------

  const handleAddExam = async (newExam: ExamItem, file?: File) => {
    const saved = await attempt(() => DataService.saveExam(newExam));
    if (!saved) return;
    let final = saved;
    if (file) {
      const uploaded = await attempt(() => DataService.uploadExamFile(saved.id, file, file.name));
      if (!uploaded) {
        toast.error('تم حفظ بيانات الامتحان لكن تعذر رفع ملف PDF، أعد رفعه من بطاقة الامتحان');
      } else {
        final = { ...saved, hasFile: true, pdfFileName: file.name };
      }
    }
    setExams((prev) => [final, ...prev.filter((e) => e.id !== final.id)]);
    toast.success('تم حفظ الامتحان');
    if (newExam.book && !savedBooks.includes(newExam.book) && can('books.write')) await handleAddBook(newExam.book);
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

  const handleApproveAssistant = (userId: string, permissions: AssistantPermission[], assignedCommittees: number[], role: any = 'assistant') =>
    attempt(() => approveUser(userId, permissions, assignedCommittees, role), 'تم اعتماد الحساب');

  const handleScheduleInterview = (userId: string, interviewDate: string, interviewNotes?: string) =>
    attempt(() => scheduleInterview(userId, interviewDate, interviewNotes), 'تم تحديد موعد المقابلة');

  const handleRejectAssistant = (userId: string, reason?: string) =>
    attempt(() => rejectUser(userId, reason), 'تم تسجيل الاعتذار عن الطلب');

  const handleUpdateAssistantPermissions = (userId: string, permissions: AssistantPermission[], assignedCommittees: number[]) => {
    const target = users.find((u) => u.id === userId);
    if (target) attempt(() => updateUser({ ...target, permissions, assignedCommittees }), 'تم تحديث الصلاحيات');
  };

  const handleUpdateAssistantUser = (updatedUser: AppUser) => attempt(() => updateUser(updatedUser), 'تم حفظ بيانات المستخدم');

  const handleAddAssistantDirect = (newUserData: Omit<AppUser, 'id' | 'createdAt'> & { password: string }) =>
    attempt(() => createUser(newUserData), 'تم إنشاء الحساب');

  const handleDeleteAssistant = (userId: string) => attempt(() => deleteUser(userId), 'تم حذف المستخدم');

  const handleAddCustomPermission = async (label: string) => {
    const saved = await attempt(() => DataService.saveCustomPermission({ id: `perm_${crypto.randomUUID()}`, label }), 'تمت إضافة الصلاحية');
    if (saved) setCustomPermissions((prev) => [...prev, saved]);
  };

  const handleDeleteCustomPermission = async (id: string) => {
    const ok = await attempt(() => DataService.deleteCustomPermission(id), 'تم حذف الصلاحية');
    if (ok) setCustomPermissions((prev) => prev.filter((p) => p.id !== id));
  };

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

  const handleDeleteCourse = async (courseId: string) => {
    const ok = await attempt(() => DataService.deleteCourse(courseId), 'تم حذف الدورة');
    if (ok) setCourses((prev) => prev.filter((c) => c.id !== courseId));
  };

  const handleSetDefaultCourse = (courseId: string) => {
    const target = courses.find((c) => c.id === courseId);
    if (target) handleUpdateCourse({ ...target, isDefault: true, status: 'active' });
  };

  // ---------------- Tasks ----------------

  const handleAddScheduleTask = async (newTaskData: Omit<ScheduleTask, 'id'>) => {
    const saved = await attempt(() => DataService.saveTask({ ...newTaskData, id: `task-${crypto.randomUUID()}` }), 'تمت جدولة المهمة');
    if (saved) replaceTask(saved);
  };

  const handleToggleTaskComplete = async (taskId: string) => {
    const task = scheduleTasks.find((t) => t.id === taskId);
    if (!task) return;
    const saved = await attempt(() => DataService.toggleTask(taskId, !task.completed));
    if (saved) replaceTask(saved);
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

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: committees.length };
    STAGES_LIST.forEach((s) => {
      counts[s.key] = 0;
    });
    committees.forEach((c) => {
      const status = calculateCurrentStage(c.stages);
      counts[status.key] = (counts[status.key] || 0) + 1;
    });
    return counts;
  }, [committees]);

  const activeCommitteesCount = useMemo(() => committees.filter((c) => !c.stages.ceremony?.completed).length, [committees]);
  const completedCeremonyCount = useMemo(() => committees.filter((c) => c.stages.ceremony?.completed).length, [committees]);

  const filteredCommittees = useMemo(() => {
    let list = [...committees];
    if (selectedStage !== 'all') list = list.filter((c) => calculateCurrentStage(c.stages).key === selectedStage);
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
    if (selectedCourseFilter !== 'all') list = list.filter((c) => c.courseId === selectedCourseFilter);
    if (currentUser?.role === 'assistant' && assistantOnlyFilter) {
      list = list.filter((c) => currentUser.assignedCommittees.includes(c.committeeNumber));
    }
    if (needsScoringFilter) list = list.filter((c) => c.scoringDetails?.questions?.some((q) => !q.completed));
    if (sortBy === 'newest') list.sort((a, b) => b.committeeNumber - a.committeeNumber);
    else if (sortBy === 'oldest' || sortBy === 'committeeNumber') list.sort((a, b) => a.committeeNumber - b.committeeNumber);
    else if (sortBy === 'book') list.sort((a, b) => a.competitionBook.localeCompare(b.competitionBook, 'ar'));
    return list;
  }, [committees, selectedStage, searchQuery, sortBy, assistantOnlyFilter, needsScoringFilter, currentUser, selectedCourseFilter, genderFilter]);

  const totalPages = Math.ceil(filteredCommittees.length / ITEMS_PER_PAGE) || 1;
  const paginatedCommittees = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredCommittees.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredCommittees, currentPage]);
  const startIndexDisplay = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endIndexDisplay = Math.min(currentPage * ITEMS_PER_PAGE, filteredCommittees.length);

  const defaultCourseId = courses.find((c) => c.isDefault)?.id || courses.find((c) => c.status === 'active')?.id;
  const nextCommitteeNumber = useMemo(() => {
    const inCourse = committees.filter((c) => !defaultCourseId || c.courseId === defaultCourseId);
    return inCourse.length === 0 ? 1 : Math.max(...inCourse.map((c) => c.committeeNumber), 0) + 1;
  }, [committees, defaultCourseId]);

  const pendingAssistantsCount = useMemo(() => users.filter((u) => u.status === 'pending').length, [users]);
  const todaysTasksCount = useMemo(() => {
    const today = todayISO();
    return scheduleTasks.filter((t) => t.date === today && !t.completed).length;
  }, [scheduleTasks]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas text-ink-soft font-['IBM_Plex_Sans_Arabic']" role="status">
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

  return (
    <div className="bg-canvas text-ink min-h-screen flex font-['IBM_Plex_Sans_Arabic'] text-right selection:bg-brand-light selection:text-[#00201d]">
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
        currentUser={currentUser}
      />

      {/* 2. Main Content Canvas */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden transition-all duration-300">
        {/* Top Header */}
        <TopNavBar
          currentUser={currentUser}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onOpenNewCommittee={() => setIsAddCommitteeOpen(true)}
          onOpenExport={() => setIsExportOpen(true)}
          onOpenDatabaseModal={can('database.admin') ? () => setIsSupabaseModalOpen(true) : undefined}
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
        <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 pb-24 lg:pb-8">
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
              currentUser={currentUser}
              courses={courses}
              scheduleTasks={scheduleTasks}
              onNavigateTab={setActiveTab}
              onNavigateCommittees={(stageFilter) => {
                setActiveTab('committees');
                if (stageFilter && stageFilter !== 'all') {
                  setSelectedStage(stageFilter as StageKey);
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
              currentUser={currentUser}
              onSetCommitteeStage={handleSetStage}
              onAddCommitteeFromRow={(newComm) => handleAddCommittee(newComm)}
              onUpdateCommitteeCourse={(committeeId, courseId) => {
                const target = committees.find((c) => c.id === committeeId);
                if (target) handleSaveCommittee({ ...target, courseId });
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
            />
          )}

          {activeTab === 'assistants' && (
            <AssistantsView
              users={users}
              committees={committees}
              exams={exams}
              currentUser={currentUser}
              profiles={profiles}
              onSaveProfile={saveProfile}
              onDeleteProfile={deleteProfile}
              onAssignProfile={assignProfileToUser}
              onSetSuperAdmin={setSuperAdmin}
              onApproveAssistant={handleApproveAssistant}
              onScheduleInterview={handleScheduleInterview}
              onRejectAssistant={handleRejectAssistant}
              onUpdateAssistantPermissions={handleUpdateAssistantPermissions}
              onUpdateAssistantUser={handleUpdateAssistantUser}
              onAddAssistantDirect={handleAddAssistantDirect}
              onDeleteAssistant={handleDeleteAssistant}
              onOpenAuthModal={() => setIsAuthModalOpen(true)}
              onOpenCommitteeDetails={(c) => setSelectedCommitteeForDetails(c)}
              customPermissions={customPermissions}
              onAddCustomPermission={handleAddCustomPermission}
              onDeleteCustomPermission={handleDeleteCustomPermission}
            />
          )}

          {activeTab === 'courses' && (
            <CoursesView
              courses={courses}
              committees={committees}
              currentUser={currentUser}
              onAddCourse={handleAddCourse}
              onUpdateCourse={handleUpdateCourse}
              onDeleteCourse={handleDeleteCourse}
              onSetDefaultCourse={handleSetDefaultCourse}
              onNavigateCommitteesByCourse={(courseId) => {
                setSelectedCourseFilter(courseId);
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

          {activeTab === 'stats' && <StatisticsView committees={committees} />}

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
              {/* Assistant Quick Task & Assigned Committees Bar */}
              {currentUser.role === 'assistant' && (
                <div className="mb-6 p-4 rounded-2xl bg-gradient-to-l from-emerald-50 via-teal-50 to-white border border-teal-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-bold text-brand text-sm block flex items-center gap-1.5 mb-1">
                      <span className="material-symbols-outlined text-lg">person_pin</span>
                      <span>مرحباً بك: {currentUser.name} (معاون ميداني)</span>
                    </span>
                    <span className="text-ink-soft block leading-relaxed">
                      الصلاحيات المفعلة لك: <strong>{currentUser.permissions.join('، ') || 'متابعة اللجان الميدانية'}</strong> • اللجان المسندة: <strong>{currentUser.assignedCommittees.map(c => `#${c}`).join('، ') || 'كافة اللجان'}</strong>
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
                      <span>لجاني المسندة فقط ({currentUser.assignedCommittees.length})</span>
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
                courses={courses}
                selectedCourseId={selectedCourseFilter}
                setSelectedCourseId={(id) => {
                  setSelectedCourseFilter(id);
                  setCurrentPage(1);
                }}
                genderFilter={genderFilter}
                setGenderFilter={(g) => {
                  setGenderFilter(g);
                  setCurrentPage(1);
                }}
              />

              {/* Committees Grid */}
              {paginatedCommittees.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {paginatedCommittees.map((committee) => (
                    <CommitteeCard
                      key={committee.id}
                      committee={committee}
                      currentUser={currentUser}
                      onReceiveCommittee={handleReceiveCommittee}
                      onApproveExamReadiness={handleApproveExamReadiness}
                      onViewDetails={(c) => setSelectedCommitteeForDetails(c)}
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

        {/* Mobile App Bottom Navigation Bar (iOS / Android Native App feel) */}
        <MobileBottomNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenSidebar={() => setIsMobileSidebarOpen(true)}
          currentUser={currentUser}
          pendingAssistantsCount={pendingAssistantsCount}
        />

        {/* Footer */}
        <Footer />
      </div>

      {/* Modals */}
      <CommitteeDetailModal
        committee={selectedCommitteeForDetails}
        currentUser={currentUser}
        courses={courses}
        onReceiveCommittee={handleReceiveCommittee}
        onApproveExamReadiness={handleApproveExamReadiness}
        onClose={() => setSelectedCommitteeForDetails(null)}
        onSaveCommittee={handleSaveCommittee}
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
        defaultCourseId={defaultCourseId}
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
