/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Committee,
  StageKey,
  NotificationItem,
  GoogleSheetsConfig,
  ExamItem,
  STAGES_LIST,
  AppUser,
  AssistantPermission,
  PermissionDefinition,
  Course,
  ScheduleTask,
} from './types';
import {
  INITIAL_COMMITTEES,
  INITIAL_NOTIFICATIONS,
  INITIAL_EXAMS,
  DEFAULT_COMPETITION_BOOKS,
} from './data/initialCommittees';
import { INITIAL_COURSES, INITIAL_SCHEDULE_TASKS } from './data/initialCourses';
import { calculateCurrentStage, getCurrentFormattedDateTime } from './utils/stageUtils';
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
import { ExamsView } from './components/ExamsView';
import { CoursesView } from './components/CoursesView';
import { CalendarScheduleView } from './components/CalendarScheduleView';
import { AssistantsView } from './components/AssistantsView';
import { AuthModal } from './components/AuthModal';
import { ExportModal } from './components/ExportModal';
import { HomeOverviewView } from './components/HomeOverviewView';
import { StatisticsView } from './components/StatisticsView';
import { SummerCourseTrackerView } from './components/SummerCourseTrackerView';
import { MobileBottomNav } from './components/MobileBottomNav';
import { DailyAlertsView } from './components/DailyAlertsView';
import { CeremoniesView } from './components/CeremoniesView';
import { Footer } from './components/Footer';
import { CentralLoginPortal } from './components/CentralLoginPortal';
import { useAuth, AuthService } from './services/AuthService';
import { SYSTEM_PERMISSIONS } from './types';

const STORAGE_KEY_COMMITTEES = 'bukhari_competition_committees_v2';
const STORAGE_KEY_BOOKS = 'bukhari_saved_books_v2';
const STORAGE_KEY_SHEETS = 'bukhari_sheets_config_v2';
const STORAGE_KEY_EXAMS = 'bukhari_exams_v2';
const STORAGE_KEY_CUSTOM_PERMS = 'bukhari_custom_permissions_v4';
const STORAGE_KEY_COURSES = 'bukhari_competition_courses_v2';
const STORAGE_KEY_SCHEDULE_TASKS = 'bukhari_schedule_tasks_v2';

const DEFAULT_SYSTEM_PERMISSIONS: PermissionDefinition[] = SYSTEM_PERMISSIONS;

export default function App() {
  // Main view tab (Sidebar tabs) - default is home overview screen
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('bukhari_sidebar_desktop_open');
      if (saved !== null) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
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
        } catch (e) {}
        return next;
      });
    }
  };

  // Committees state with persistent LocalStorage
  const [committees, setCommittees] = useState<Committee[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_COMMITTEES);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load committees from localStorage', e);
    }
    return INITIAL_COMMITTEES;
  });

  // Exams state with persistent LocalStorage
  const [exams, setExams] = useState<ExamItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_EXAMS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load exams from localStorage', e);
    }
    return INITIAL_EXAMS;
  });

  // Saved competition books with persistent LocalStorage
  const [savedBooks, setSavedBooks] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_BOOKS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load books from localStorage', e);
    }
    return DEFAULT_COMPETITION_BOOKS;
  });

  // Google Sheets configuration state
  const [sheetsConfig, setSheetsConfig] = useState<GoogleSheetsConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SHEETS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load sheets config from localStorage', e);
    }
    return {
      sheetId: '',
      sheetName: 'لجان مسابقات مسجد البخاري',
      webhookUrl: '',
      autoSync: true,
      lastSyncedAt: '2026/09/25 - 10:00 ص',
    };
  });

  // Centralized Authentication & RBAC Layer via AuthService
  const {
    currentUser,
    users,
    isAuthenticated,
    quickLogin,
    logout,
    registerUser,
    updateUser,
    approveUser,
    rejectUser,
    deleteUser,
    addDirectUser,
    isSuperAdmin,
  } = useAuth();

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Custom permissions state with persistent LocalStorage
  const [customPermissions, setCustomPermissions] = useState<PermissionDefinition[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CUSTOM_PERMS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load custom permissions', e);
    }
    return DEFAULT_SYSTEM_PERMISSIONS;
  });

  // Persist custom permissions
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM_PERMS, JSON.stringify(customPermissions));
    } catch (e) {
      console.error('Failed to save custom permissions', e);
    }
  }, [customPermissions]);

  // Persist committees
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_COMMITTEES, JSON.stringify(committees));
    } catch (e) {
      console.error('Failed to save committees', e);
    }
  }, [committees]);

  // Persist exams
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_EXAMS, JSON.stringify(exams));
    } catch (e) {
      console.error('Failed to save exams', e);
    }
  }, [exams]);

  // Persist books
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_BOOKS, JSON.stringify(savedBooks));
    } catch (e) {
      console.error('Failed to save books', e);
    }
  }, [savedBooks]);

  // Persist sheets config
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SHEETS, JSON.stringify(sheetsConfig));
    } catch (e) {
      console.error('Failed to save sheets config', e);
    }
  }, [sheetsConfig]);

  // Courses state with persistent LocalStorage
  const [courses, setCourses] = useState<Course[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_COURSES);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load courses from localStorage', e);
    }
    return INITIAL_COURSES;
  });

  // Schedule / Calendar Tasks state with persistent LocalStorage
  const [scheduleTasks, setScheduleTasks] = useState<ScheduleTask[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SCHEDULE_TASKS);
      if (saved) {
        const parsed: ScheduleTask[] = JSON.parse(saved);
        const hasAhmedTask = parsed.some((t) => t.id === 'task-ahmed-1');
        if (!hasAhmedTask) {
          const ahmedTask = INITIAL_SCHEDULE_TASKS.find((t) => t.id === 'task-ahmed-1');
          if (ahmedTask) return [ahmedTask, ...parsed];
        }
        return parsed;
      }
    } catch (e) {
      console.error('Failed to load schedule tasks from localStorage', e);
    }
    return INITIAL_SCHEDULE_TASKS;
  });

  // Persist courses
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(courses));
    } catch (e) {
      console.error('Failed to save courses', e);
    }
  }, [courses]);

  // Persist schedule tasks
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SCHEDULE_TASKS, JSON.stringify(scheduleTasks));
    } catch (e) {
      console.error('Failed to save schedule tasks', e);
    }
  }, [scheduleTasks]);

  // Auto-complete ceremonies in the database if the ceremony day has passed (< 2026-10-05)
  useEffect(() => {
    const todayISO = '2026-10-05';

    // 1. Check if any committee has an uncompleted ceremony whose scheduled date has passed
    const needsCommitteeUpdate = committees.some((c) => {
      const task = scheduleTasks.find(
        (t) => t.type === 'ceremony' && t.committeeNumber === c.committeeNumber
      );
      return task && task.date && task.date < todayISO && !c.stages.ceremony?.completed;
    });

    if (needsCommitteeUpdate) {
      setCommittees((prev) =>
        prev.map((c) => {
          const task = scheduleTasks.find(
            (t) => t.type === 'ceremony' && t.committeeNumber === c.committeeNumber
          );
          if (task && task.date && task.date < todayISO && !c.stages.ceremony?.completed) {
            return {
              ...c,
              stages: {
                ...c.stages,
                ceremony: {
                  completed: true,
                  completedAt: `${task.date} (تم الحفل تلقائياً لانقضاء موعد الحفل)`,
                },
              },
            };
          }
          return c;
        })
      );
    }

    // 2. Check if any ceremony schedule task has passed and is not yet marked completed
    const needsTaskUpdate = scheduleTasks.some((t) => {
      return t.type === 'ceremony' && t.date && t.date < todayISO && !t.completed;
    });

    if (needsTaskUpdate) {
      setScheduleTasks((prev) =>
        prev.map((t) => {
          if (t.type === 'ceremony' && t.date && t.date < todayISO && !t.completed) {
            return {
              ...t,
              completed: true,
              completedAt: `${t.date} (انقضى موعد الحفل)`,
            };
          }
          return t;
        })
      );
    }
  }, [committees, scheduleTasks]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState<'all' | StageKey>('all');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string | 'all'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'committeeNumber' | 'book'>('newest');
  const [assistantOnlyFilter, setAssistantOnlyFilter] = useState(false);
  const [needsScoringFilter, setNeedsScoringFilter] = useState(false);
  const [genderFilter, setGenderFilter] = useState<'all' | 'men' | 'women'>('all');

  // Enforce granular permissions restriction so non-admin users only access allowed tabs
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === 'super_admin') return;

    const perms = currentUser.permissions || [];
    const allowedTabs: NavTab[] = [];
    if (perms.includes('database_sheets')) allowedTabs.push('summer_course');
    if (perms.includes('manage_committees')) allowedTabs.push('committees');
    if (perms.includes('exams_pdf')) allowedTabs.push('exams');
    if (perms.includes('manage_courses')) allowedTabs.push('courses');
    if (perms.includes('calendar_schedule')) allowedTabs.push('calendar');
    if (perms.includes('progress_stats')) allowedTabs.push('stats');
    if (perms.includes('manage_assistants')) allowedTabs.push('assistants');

    if (allowedTabs.length > 0 && !allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0]);
    }
  }, [currentUser, activeTab]);

  // Pagination (6 items per page)
  const ITEMS_PER_PAGE = 6;
  const [currentPage, setCurrentPage] = useState(1);

  // Modals state
  const [selectedCommitteeForDetails, setSelectedCommitteeForDetails] = useState<Committee | null>(null);
  const [isAddCommitteeOpen, setIsAddCommitteeOpen] = useState(false);
  const [isAddExamOpen, setIsAddExamOpen] = useState(false);
  const [isAddBookOpen, setIsAddBookOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);

  // Notifications state
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  // Sync to Google Sheets Webhook in background
  const triggerGoogleSheetsSync = async (currentList: Committee[] = committees) => {
    const nowStamp = getCurrentFormattedDateTime();
    setSheetsConfig((prev) => ({ ...prev, lastSyncedAt: nowStamp }));

    if (sheetsConfig.webhookUrl && sheetsConfig.autoSync) {
      try {
        const payload = {
          action: 'sync_all',
          timestamp: nowStamp,
          committees: currentList.map((c) => ({
            number: c.committeeNumber,
            name: c.committeeName,
            type: c.isWomenCommittee ? 'لجنة نسائية' : '-',
            sheikhName: c.sheikhName || '',
            sheikhPhone: c.sheikhPhone || '',
            sheikhCountry: c.sheikhCountry || '',
            studentsCount: c.studentsCount || 0,
            book: c.competitionBook,
            branch: c.branch,
            association: c.associationName || '',
            members: c.members.join('، '),
            currentStage: calculateCurrentStage(c.stages).label,
            tRegistration: c.stages.registration?.completedAt || '',
            tExam: c.stages.exam?.completedAt || '',
            tScoring: c.stages.scoring?.completedAt || '',
            tAggregation: c.stages.aggregation?.completedAt || '',
            tSheet: c.stages.sheet?.completedAt || '',
            tReview: c.stages.review?.completedAt || '',
            tAnnouncement: c.stages.announcement?.completedAt || '',
            tCeremony: c.stages.ceremony?.completedAt || '',
            notes: c.generalNotes || '',
          })),
        };

        await fetch(sheetsConfig.webhookUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.warn('Google Sheets background sync notice:', err);
      }
    }
  };

  // Quick toggle a stage from card
  const handleQuickToggleStage = (committeeId: string, stageKey: StageKey) => {
    const nowStamp = getCurrentFormattedDateTime();
    setCommittees((prev) => {
      const updated = prev.map((c) => {
        if (c.id === committeeId) {
          const isDone = c.stages[stageKey]?.completed;
          return {
            ...c,
            stages: {
              ...c.stages,
              [stageKey]: {
                completed: !isDone,
                completedAt: !isDone ? nowStamp : undefined,
              },
            },
          };
        }
        return c;
      });
      triggerGoogleSheetsSync(updated);
      return updated;
    });
  };

  // Save changes from CommitteeDetailModal
  const handleSaveCommittee = (updated: Committee) => {
    setCommittees((prev) => {
      const exists = prev.some((c) => c.id === updated.id);
      const newList = exists
        ? prev.map((c) => (c.id === updated.id ? updated : c))
        : [updated, ...prev];
      triggerGoogleSheetsSync(newList);
      return newList;
    });
    setSelectedCommitteeForDetails(updated);

    // Sync ceremony details with schedule tasks if ceremonyDate is set
    const cDetails = updated.ceremonyDetails;
    if (cDetails && cDetails.ceremonyDate) {
      const cDate = cDetails.ceremonyDate;
      const cTime = cDetails.ceremonyTime || '4 العصر';
      const cPlace = cDetails.ceremonyPlace || updated.branch || 'مسجد البخاري';
      const cNotes = cDetails.notes || '';
      const cCount = cDetails.honoredStudentsCount ?? updated.studentsCount ?? 15;
      const cSheikhs = cDetails.attendingSheikhs || [];

      setScheduleTasks((prev) => {
        const existingTaskIndex = prev.findIndex(
          (t) => t.type === 'ceremony' && t.committeeNumber === updated.committeeNumber
        );
        const ceremonyTask: ScheduleTask = {
          id: existingTaskIndex >= 0 ? prev[existingTaskIndex].id : `task-ceremony-${Date.now()}`,
          title: `🎉 حفل تكريم وتوزيع جوائز: لجنة #${updated.committeeNumber} (${updated.sheikhName || updated.committeeName})`,
          date: cDate,
          time: cTime,
          type: 'ceremony',
          priority: 'urgent',
          committeeNumber: updated.committeeNumber,
          assignedAssistantName: 'لجنة الاحتفالات والجوائز',
          deliverable: `تجهيز شهادات التقدير لعدد (${cCount}) طالباً مكرماً + دروع التكريم + حضور المشايخ: (${cSheikhs.join('، ') || 'المشايخ الضيوف'})`,
          notes: `مكان الحفل: ${cPlace}. ${cNotes}`,
          completed: updated.stages?.ceremony?.completed || false,
        };

        if (existingTaskIndex >= 0) {
          const copy = [...prev];
          copy[existingTaskIndex] = ceremonyTask;
          return copy;
        }
        return [ceremonyTask, ...prev];
      });
    }
  };

  // Open full committee details from summer course tracker row (seamless DB sync)
  const handleOpenRowDetails = (row: SummerCourseRow) => {
    // 1. Check if committee already exists in committees by ID or committeeNumber
    let matched = committees.find(
      (c) => (row.committeeId && c.id === row.committeeId) || c.committeeNumber === row.number
    );

    if (!matched) {
      // Create and persist the linked committee into database / state so it's fully linked!
      const activeCourse = courses.find((crs) => crs.status === 'active') || courses[0];
      const newComm: Committee = {
        id: row.committeeId || `comm-row-${row.id}`,
        committeeNumber: row.number,
        committeeName: row.sheikh_name ? `لجنة ${row.sheikh_name}` : `لجنة #${row.number}`,
        sheikhName: row.sheikh_name || '',
        sheikhPhone: '',
        sheikhCountry: 'مصر',
        studentsCount: row.students_count || 0,
        branch: row.place || 'مسجد الإمام البخاري',
        competitionBook: row.book || '',
        courseId: activeCourse?.id || 'course-summer-1448',
        members: ['المشرف العام'],
        generalNotes: row.notes || '',
        stages: {
          registration: { completed: true, completedAt: getCurrentFormattedDateTime().split(' - ')[0] },
          exam: { completed: row.delivered },
          scoring: { completed: row.corrected },
          aggregation: { completed: false },
          review: { completed: row.reviewed },
          sheet: { completed: false },
          accreditation: { completed: false },
          announcement: { completed: row.announced },
          ceremony: { completed: row.ceremony },
        },
        createdDate: getCurrentFormattedDateTime().split(' - ')[0],
        createdAtTime: getCurrentFormattedDateTime().split(' - ')[1] || '',
      };

      handleAddCommittee(newComm, row.book);
      matched = newComm;
    } else {
      // Sync any updated fields like studentsCount or stages or sheikhName if modified in row
      let needsSync = false;
      const updatedComm: Committee = { ...matched };

      if (row.students_count !== undefined && matched.studentsCount !== row.students_count) {
        updatedComm.studentsCount = row.students_count;
        needsSync = true;
      }
      if (row.sheikh_name && matched.sheikhName !== row.sheikh_name) {
        updatedComm.sheikhName = row.sheikh_name;
        needsSync = true;
      }
      if (row.book && matched.competitionBook !== row.book) {
        updatedComm.competitionBook = row.book;
        needsSync = true;
      }
      if (row.place && matched.branch !== row.place) {
        updatedComm.branch = row.place;
        needsSync = true;
      }
      if (row.notes && matched.generalNotes !== row.notes) {
        updatedComm.generalNotes = row.notes;
        needsSync = true;
      }

      if (needsSync) {
        handleSaveCommittee(updatedComm);
        matched = updatedComm;
      }
    }

    setSelectedCommitteeForDetails(matched);
  };

  // Add new committee
  const handleAddCommittee = (newComm: Committee, newBookName?: string) => {
    setCommittees((prev) => {
      const newList = [newComm, ...prev];
      triggerGoogleSheetsSync(newList);
      return newList;
    });

    if (newBookName && !savedBooks.includes(newBookName)) {
      setSavedBooks((prev) => [newBookName, ...prev]);
    }

    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `تسجيل لجنة جديدة: ${newComm.committeeName}`,
      description: `تم إدراج لجنة #${newComm.committeeNumber} في ${newComm.competitionBook} ومزامنة السطر في Google Sheets.`,
      time: 'الآن',
      type: 'info',
      read: false,
      committeeId: newComm.id,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  // Delete committee
  const handleDeleteCommittee = (committeeId: string) => {
    setCommittees((prev) => {
      const filtered = prev.filter((c) => c.id !== committeeId);
      triggerGoogleSheetsSync(filtered);
      return filtered;
    });
  };

  // Add new exam
  const handleAddExam = (newExam: ExamItem) => {
    setExams((prev) => [newExam, ...prev]);
    if (newExam.book && !savedBooks.includes(newExam.book)) {
      setSavedBooks((prev) => [newExam.book, ...prev]);
    }

    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `رفع امتحان جديد: ${newExam.title}`,
      description: `تم رفع نموذج PDF (${newExam.pdfFileName}) لمسار ${newExam.book}.`,
      time: 'الآن',
      type: 'success',
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  // Add new book
  const handleAddBook = (bookName: string, author?: string, notes?: string) => {
    if (!savedBooks.includes(bookName)) {
      setSavedBooks((prev) => [bookName, ...prev]);
    }
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `إضافة كتاب جديد: ${bookName}`,
      description: author
        ? `تم اعتماد كتاب "${bookName}" للمصنف ${author} في مسابقات مسجد البخاري.`
        : `تم اعتماد كتاب "${bookName}" في قائمة متون المسابقة.`,
      time: 'الآن',
      type: 'success',
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  // Delete book
  const handleDeleteBook = (bookName: string) => {
    setSavedBooks((prev) => prev.filter((b) => b !== bookName));
  };

  // Delete exam
  const handleDeleteExam = (examId: string) => {
    setExams((prev) => prev.filter((e) => e.id !== examId));
  };

  // Approve assistant
  const handleApproveAssistant = (
    userId: string,
    permissions: AssistantPermission[],
    assignedCommittees: number[]
  ) => {
    approveUser(userId, permissions, assignedCommittees);
    const approvedUser = users.find((u) => u.id === userId);
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `اعتماد حساب: ${approvedUser?.name || ''}`,
      description: `تم اعتماد الحساب وتحديد الصلاحيات واللجان الميدانية بنجاح.`,
      time: 'الآن',
      type: 'success',
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  // Reject assistant
  const handleRejectAssistant = (userId: string) => {
    rejectUser(userId);
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: 'رفض طلب الانضمام',
      description: 'تم رفض طلب الانضمام وحذفه من قائمة الانتظار.',
      time: 'الآن',
      type: 'info',
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  // Update assistant permissions & assigned committees
  const handleUpdateAssistantPermissions = (
    userId: string,
    permissions: AssistantPermission[],
    assignedCommittees: number[]
  ) => {
    const target = users.find((u) => u.id === userId);
    if (target) {
      updateUser({
        ...target,
        permissions,
        assignedCommittees,
      });
    }
  };

  // Full assistant update (name, phone, email, notes, permissions, assignedCommittees)
  const handleUpdateAssistantUser = (updatedUser: AppUser) => {
    updateUser(updatedUser);
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `تعديل بيانات المستخدم: ${updatedUser.name}`,
      description: `تم حفظ البيانات الجديدة وصلاحيات ولجان المستخدم بنجاح.`,
      time: 'الآن',
      type: 'success',
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  // Add custom permission (كتبتها بمزاجك)
  const handleAddCustomPermission = (label: string) => {
    const id = `perm_${Date.now()}`;
    setCustomPermissions((prev) => [...prev, { id, label, isCustom: true }]);
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `إضافة صلاحية جديدة: ${label}`,
      description: 'أصبحت الصلاحية متاحة الآن لتعيينها لأي معاون.',
      time: 'الآن',
      type: 'success',
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  // Delete custom permission
  const handleDeleteCustomPermission = (id: string) => {
    setCustomPermissions((prev) => prev.filter((p) => p.id !== id));
  };

  // Add new course
  const handleAddCourse = (newCourseData: Omit<Course, 'id' | 'createdAt'>) => {
    const newCourse: Course = {
      ...newCourseData,
      id: `course-${Date.now()}`,
      createdAt: getCurrentFormattedDateTime().split(' - ')[0],
    };

    setCourses((prev) => {
      const updated = newCourse.isDefault
        ? prev.map((c) => ({ ...c, isDefault: false }))
        : [...prev];
      return [newCourse, ...updated];
    });

    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `إضافة دورة جديدة: ${newCourse.name}`,
      description: `تم إنشاء الدورة بنجاح وربط اللجان المسابقاتية بها.`,
      time: 'الآن',
      type: 'success',
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
    return newCourse;
  };

  // Update course
  const handleUpdateCourse = (updatedCourse: Course) => {
    setCourses((prev) =>
      prev.map((c) => (c.id === updatedCourse.id ? updatedCourse : c))
    );
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `تحديث دورة: ${updatedCourse.name}`,
      description: `تم حفظ التعديلات على الدورة بنجاح.`,
      time: 'الآن',
      type: 'info',
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  // Delete course
  const handleDeleteCourse = (courseId: string) => {
    setCourses((prev) => prev.filter((c) => c.id !== courseId));
  };

  // Set default active course
  const handleSetDefaultCourse = (courseId: string) => {
    setCourses((prev) =>
      prev.map((c) => ({
        ...c,
        isDefault: c.id === courseId,
        status: c.id === courseId ? 'active' : c.status,
      }))
    );
  };

  // Add schedule task
  const handleAddScheduleTask = (newTaskData: Omit<ScheduleTask, 'id'>) => {
    const newTask: ScheduleTask = {
      ...newTaskData,
      id: `task-${Date.now()}`,
    };
    setScheduleTasks((prev) => [newTask, ...prev]);

    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `🔔 تنبيه وجدولة عمل في التقويم: ${newTask.title}`,
      description: `تمت جدولة العمل ليوم (${newTask.date}) الساعة (${newTask.time || '10:00 ص'})، وسيظهر في شريط تذكير مهام اليوم بالأعلى.`,
      time: 'الآن',
      type: 'success',
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  // Toggle schedule task completed
  const handleToggleTaskComplete = (taskId: string) => {
    setScheduleTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          const next = !t.completed;
          return {
            ...t,
            completed: next,
            completedAt: next ? getCurrentFormattedDateTime() : undefined,
          };
        }
        return t;
      })
    );
  };

  // Delete schedule task
  const handleDeleteScheduleTask = (taskId: string) => {
    setScheduleTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  // Update committee ceremony details & sync with database
  const handleUpdateCommitteeCeremony = (
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
  ) => {
    setCommittees((prev) =>
      prev.map((c) => {
        if (c.id === committeeId) {
          return {
            ...c,
            associationName: ceremonyInfo.place || c.associationName,
            ceremonyDetails: {
              honoredStudentsCount: ceremonyInfo.honoredCount ?? c.ceremonyDetails?.honoredStudentsCount ?? c.studentsCount ?? 15,
              attendingSheikhs:
                ceremonyInfo.attendingSheikhs ||
                c.ceremonyDetails?.attendingSheikhs ||
                (c.sheikhName ? [c.sheikhName] : ['الشيخ المشرف']),
              ceremonyDate: ceremonyInfo.date,
              ceremonyTime: ceremonyInfo.time,
              ceremonyPlace: ceremonyInfo.place,
              notes: ceremonyInfo.notes,
            },
            stages: {
              ...c.stages,
              ceremony: {
                completed: ceremonyInfo.completed,
                completedAt: ceremonyInfo.completed
                  ? `${ceremonyInfo.date} ${ceremonyInfo.time}`
                  : c.stages.ceremony?.completedAt,
              },
            },
          };
        }
        return c;
      })
    );

    const comm = committees.find((c) => c.id === committeeId);
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `🎉 جدولة حفل لجنة #${comm?.committeeNumber || ''}`,
      description: `تم تحديد موعد حفل التكريم ليوم (${ceremonyInfo.date}) في (${ceremonyInfo.place}) وإدراجه في المهام والتقويم.`,
      time: 'الآن',
      type: 'success',
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  // Add assistant direct
  const handleAddAssistantDirect = (newUserData: Omit<AppUser, 'id' | 'createdAt'>) => {
    const newUser = addDirectUser(newUserData);
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `إضافة مباشر: ${newUser.name}`,
      description: 'تم تفعيل حساب المستخدم ومنحه الصلاحيات المحددة فوراً.',
      time: 'الآن',
      type: 'success',
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  // Delete assistant
  const handleDeleteAssistant = (userId: string) => {
    deleteUser(userId);
  };

  // User login handler from Central Gateway
  const handleLogin = (user: AppUser, rememberMe = true) => {
    quickLogin(user, rememberMe);
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `تم تسجيل الدخول: ${user.name}`,
      description: `تم التحقق من الصلاحيات والاتصال بقاعدة البيانات بنجاح (${AuthService.getRoleLabel(user.role)}).`,
      time: 'الآن',
      type: 'success',
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  // User logout handler - Exits system to external Central Portal
  const handleLogout = () => {
    logout();
  };

  // Register new staff/assistant (instantly connected to assistants and permissions)
  const handleRegisterAssistant = (
    name: string,
    phone: string,
    email: string,
    notes?: string,
    role: any = 'assistant',
    password = '',
    passportNumber = '',
    status: any = 'approved',
    permissions?: any[],
    assignedCommittees?: number[]
  ) => {
    const isApproved = status === 'approved';
    const created = registerUser({
      name,
      passportNumber,
      phone,
      email,
      notes,
      role,
      password,
      status: isApproved ? 'approved' : 'pending',
      permissions,
      assignedCommittees,
    });
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: isApproved ? `انضمام معاون معتمد: ${name}` : `طلب انضمام جديد: ${name}`,
      description: isApproved
        ? `المعاون (${name} - ${phone}) تم تسجيله واعتماده فوراً وربطه بقاعدة بيانات المعاونين ومنحه الصلاحيات الميدانية.`
        : `المتقدم (${name} - ${phone}) أتم إرسال طلبه وبانتظار دراسته واعتماده في لوحة «المعاونون والصلاحيات».`,
      time: 'الآن',
      type: isApproved ? 'success' : 'urgent',
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
    return created;
  };

  // Assistant: Receive Committee
  const handleReceiveCommittee = (committeeId: string) => {
    const nowStamp = getCurrentFormattedDateTime();
    const updated = committees.map((c) => {
      if (c.id === committeeId) {
        return {
          ...c,
          receivedByAssistant: {
            assistantId: currentUser?.id || 'system-user',
            assistantName: currentUser?.name || 'معاون النظام',
            receivedAt: nowStamp,
            status: 'received' as const,
          },
        };
      }
      return c;
    });
    setCommittees(updated);
    triggerGoogleSheetsSync(updated);

    const c = committees.find((item) => item.id === committeeId);
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `استلام لجنة #${c?.committeeNumber || ''}`,
      description: `تم تسجيل استلام اللجنة بواسطة المعاون (${currentUser?.name || 'معاون النظام'}) في القاعة.`,
      time: 'الآن',
      type: 'success',
      read: false,
      committeeId,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  // Assistant: Approve Exam Readiness
  const handleApproveExamReadiness = (committeeId: string) => {
    const nowStamp = getCurrentFormattedDateTime();
    const updated = committees.map((c) => {
      if (c.id === committeeId) {
        return {
          ...c,
          examApprovedBy: {
            assistantId: currentUser?.id || 'system-user',
            assistantName: currentUser?.name || 'معاون النظام',
            approvedAt: nowStamp,
          },
        };
      }
      return c;
    });
    setCommittees(updated);
    triggerGoogleSheetsSync(updated);

    const c = committees.find((item) => item.id === committeeId);
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `اعتماد جاهزية الامتحان للجنة #${c?.committeeNumber || ''}`,
      description: `تم التأكد من أوراق الامتحان وتوزيعها بواسطة (${currentUser?.name || 'معاون النظام'}).`,
      time: 'الآن',
      type: 'success',
      read: false,
      committeeId,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  // Mark notifications as read
  const handleMarkNotificationsAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  // Stage counts for filter tabs
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

  const activeCommitteesCount = useMemo(() => {
    return committees.filter((c) => !c.stages.ceremony?.completed).length;
  }, [committees]);

  const completedCeremonyCount = useMemo(() => {
    return committees.filter((c) => c.stages.ceremony?.completed).length;
  }, [committees]);

  // Filtered committees
  const filteredCommittees = useMemo(() => {
    let list = [...committees];

    if (selectedStage !== 'all') {
      list = list.filter((c) => {
        const status = calculateCurrentStage(c.stages);
        return status.key === selectedStage;
      });
    }

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

      if (genderFilter === 'women') {
        list = list.filter((c) => c.isWomenCommittee);
      } else if (genderFilter === 'men') {
        list = list.filter((c) => !c.isWomenCommittee);
      }

    if (selectedCourseFilter !== 'all') {
      list = list.filter(
        (c) => c.courseId === selectedCourseFilter || (!c.courseId && selectedCourseFilter === 'course-summer-1447')
      );
    }

    if (currentUser?.role === 'assistant' && assistantOnlyFilter) {
      list = list.filter((c) => currentUser.assignedCommittees.includes(c.committeeNumber));
    }

    if (needsScoringFilter) {
      list = list.filter((c) => c.scoringDetails?.questions?.some((q) => !q.completed));
    }

    if (sortBy === 'newest') {
      list.sort((a, b) => b.committeeNumber - a.committeeNumber);
    } else if (sortBy === 'oldest') {
      list.sort((a, b) => a.committeeNumber - b.committeeNumber);
    } else if (sortBy === 'committeeNumber') {
      list.sort((a, b) => a.committeeNumber - b.committeeNumber);
    } else if (sortBy === 'book') {
      list.sort((a, b) => a.competitionBook.localeCompare(b.competitionBook, 'ar'));
    }

    return list;
  }, [committees, selectedStage, searchQuery, sortBy, assistantOnlyFilter, needsScoringFilter, currentUser, selectedCourseFilter]);

  const totalPages = Math.ceil(filteredCommittees.length / ITEMS_PER_PAGE) || 1;

  const paginatedCommittees = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredCommittees.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredCommittees, currentPage]);

  const startIndexDisplay = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endIndexDisplay = Math.min(currentPage * ITEMS_PER_PAGE, filteredCommittees.length);

  const nextCommitteeNumber = useMemo(() => {
    if (committees.length === 0) return 1;
    return Math.max(...committees.map((c) => c.committeeNumber), 0) + 1;
  }, [committees]);

  const pendingAssistantsCount = useMemo(() => {
    return users.filter((u) => u.status === 'pending').length;
  }, [users]);

  // Calculate today's tasks count from real database schedule (Centering on Monday 2026-10-05)
  const todaysTasksCount = useMemo(() => {
    const mondayISO = '2026-10-05';
    const mondayTasks = scheduleTasks.filter((t) => t.date === mondayISO && !t.completed);
    if (mondayTasks.length > 0) return mondayTasks.length;
    const realISO = new Date().toISOString().split('T')[0];
    const direct = scheduleTasks.filter((t) => t.date === realISO && !t.completed);
    return direct.length;
  }, [scheduleTasks]);

  // Gatekeeper: Unauthenticated users are presented with the Central Enterprise Login Portal
  if (!currentUser) {
    return (
      <CentralLoginPortal
        users={users}
        onLogin={handleLogin}
        onRegisterUser={(newUser) => {
          handleRegisterAssistant(
            newUser.name || '',
            newUser.phone || '',
            newUser.email || '',
            newUser.notes,
            newUser.role || 'assistant',
            newUser.password || '',
            newUser.passportNumber || '',
            newUser.status || 'approved',
            newUser.permissions,
            newUser.assignedCommittees
          );
        }}
      />
    );
  }

  return (
    <div className="bg-[#f8f9ff] text-[#0d1c2e] min-h-screen flex font-['IBM_Plex_Sans_Arabic'] text-right selection:bg-[#9cf2e8] selection:text-[#00201d]">
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
              onToggleCommitteeStage={handleQuickToggleStage}
              onAddCommitteeFromRow={(newComm) => handleAddCommittee(newComm)}
              onUpdateCommitteeCourse={(committeeId, courseId, courseName) => {
                setCommittees((prev) =>
                  prev.map((c) =>
                    c.id === committeeId ? { ...c, courseId, courseName } : c
                  )
                );
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
              currentUser={currentUser}
              onApproveAssistant={handleApproveAssistant}
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
                    <span className="font-bold text-[#005c55] text-sm block flex items-center gap-1.5 mb-1">
                      <span className="material-symbols-outlined text-lg">person_pin</span>
                      <span>مرحباً بك: {currentUser.name} (معاون ميداني)</span>
                    </span>
                    <span className="text-[#3e4947] block leading-relaxed">
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
                          ? 'bg-[#005c55] text-white'
                          : 'bg-white border border-[#bdc9c6] text-[#0d1c2e] hover:bg-emerald-50'
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
                      onDeleteCommittee={currentUser.role === 'super_admin' ? handleDeleteCommittee : undefined}
                    />
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-2xl p-12 text-center border border-[#bdc9c6]/40 shadow-xs">
                  <span className="material-symbols-outlined text-4xl text-[#6e7977] mb-2 block">
                    search_off
                  </span>
                  <h3 className="font-bold text-base text-[#0d1c2e] mb-1">
                    لا توجد لجان مطابقة لمعايير البحث
                  </h3>
                  <p className="text-xs text-[#6e7977] mb-4">
                    جرب تغيير كلمات البحث، أو إزالة التصفية لعرض اللجان الأخرى.
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedStage('all');
                    }}
                    className="px-4 py-2 rounded-xl bg-[#005c55] text-white text-xs font-semibold hover:bg-[#1b6b51] cursor-pointer"
                  >
                    إعادة ضبط البحث والتصفية
                  </button>
                </div>
              )}

              {/* Bottom Pagination */}
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-[#bdc9c6]/40">
                <div className="text-[13px] text-[#3e4947]">
                  عرض{' '}
                  <span className="font-semibold text-[#0d1c2e]">
                    {filteredCommittees.length > 0
                      ? `${startIndexDisplay} إلى ${endIndexDisplay}`
                      : '0'}
                  </span>{' '}
                  من إجمالي{' '}
                  <span className="font-semibold text-[#0d1c2e]">
                    {filteredCommittees.length}
                  </span>{' '}
                  لجنة مسجلة
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-[#bdc9c6]/60 text-[#6e7977] hover:text-[#0d1c2e] hover:bg-[#dce9ff]/40 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
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
                          ? 'bg-[#005c55] text-white'
                          : 'border border-[#bdc9c6]/60 text-[#0d1c2e] hover:bg-[#dce9ff]/40'
                      }`}
                    >
                      {pg}
                    </button>
                  ))}

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-[#bdc9c6]/60 text-[#0d1c2e] hover:bg-[#dce9ff]/40 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    title="الصفحة التالية"
                  >
                    <span className="material-symbols-outlined text-lg">chevron_left</span>
                  </button>
                </div>
              </div>
            </>
          )}
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
        users={users}
        onSelectUser={(u) => handleLogin(u)}
        onRegisterAssistant={handleRegisterAssistant}
        onLogout={handleLogout}
      />

      <AddCommitteeModal
        isOpen={isAddCommitteeOpen}
        onClose={() => setIsAddCommitteeOpen(false)}
        onAddCommittee={handleAddCommittee}
        nextCommitteeNumber={nextCommitteeNumber}
        savedBooks={savedBooks}
        courses={courses}
        defaultCourseId={courses.find((c) => c.status === 'active')?.id || courses[0]?.id}
        onAddCourse={handleAddCourse}
      />

      <AddExamModal
        isOpen={isAddExamOpen}
        onClose={() => setIsAddExamOpen(false)}
        onAddExam={handleAddExam}
        savedBooks={savedBooks}
      />

      <AddBookModal
        isOpen={isAddBookOpen}
        onClose={() => setIsAddBookOpen(false)}
        onAddBook={handleAddBook}
        existingBooks={savedBooks}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        committees={filteredCommittees}
      />
    </div>
  );
}
