import { AppUser, Committee, Course, ExamItem, NotificationItem, PermissionDefinition, PermissionProfile, ScheduleTask } from '../types';
import { SummerCourseRow } from '../types/summerCourse';
import { api, apiResponse } from './api';

// Typed wrappers around the REST API. Every method throws ApiError on failure, so
// callers must handle errors and never show success before the server confirms.

export interface Book {
  id: string;
  name: string;
}

export interface DatabaseStatus {
  status: string;
  database: string;
  postgresVersion: string;
  serverTime: string;
  latencyMs: number;
  tls: string;
  migrations: { total: number; pending: string[] };
  tables: Array<{ name: string; count: number }>;
  tablesCount: number;
  uptimeSeconds: number;
}

export type CommitteePatch = Partial<Pick<Committee, 'scoringDetails' | 'aggregationDetails' | 'ceremonyDetails'>> & {
  stages?: Partial<Committee['stages']>;
  receivedByAssistant?: { status?: 'received' | 'in_delivery'; notes?: string } | null;
  examApprovedBy?: { notes?: string } | null;
  expectedUpdatedAt?: string;
};

const enc = encodeURIComponent;

export const DataService = {
  // ---- Committees ----
  getCommittees: async () => (await api<{ committees: Committee[] }>('/committees')).committees,
  saveCommittee: async (c: Committee) =>
    (await api<{ committee: Committee }>('/committees', { method: 'POST', body: { ...c, expectedUpdatedAt: c.updatedAt } })).committee,
  saveCommitteesBulk: async (committees: Committee[]) =>
    (await api<{ committees: Committee[] }>('/committees/bulk', { method: 'POST', body: { committees } })).committees,
  patchCommittee: async (id: string, patch: CommitteePatch) =>
    (await api<{ committee: Committee }>(`/committees/${enc(id)}`, { method: 'PATCH', body: patch })).committee,
  deleteCommittee: (id: string) => api(`/committees/${enc(id)}`, { method: 'DELETE' }),

  // ---- Courses ----
  getCourses: async () => (await api<{ courses: Course[] }>('/courses')).courses,
  saveCourse: async (c: Course) => (await api<{ course: Course }>('/courses', { method: 'POST', body: c })).course,
  deleteCourse: (id: string) => api(`/courses/${enc(id)}`, { method: 'DELETE' }),

  // ---- Exams ----
  getExams: async () => (await api<{ exams: ExamItem[] }>('/exams')).exams,
  saveExam: async (e: ExamItem) => (await api<{ exam: ExamItem }>('/exams', { method: 'POST', body: e })).exam,
  uploadExamFile: (id: string, file: Blob, fileName: string) =>
    api(`/exams/${enc(id)}/file`, { method: 'PUT', raw: file, contentType: 'application/pdf', headers: { 'X-File-Name': enc(fileName) } }),
  /** Downloads the PDF (allowed roles only) and returns an object URL for viewing. */
  examFileUrl: async (id: string) => URL.createObjectURL(await (await apiResponse(`/exams/${enc(id)}/file`)).blob()),
  deleteExam: (id: string) => api(`/exams/${enc(id)}`, { method: 'DELETE' }),

  // ---- Tasks ----
  getTasks: async () => (await api<{ tasks: ScheduleTask[] }>('/tasks')).tasks,
  saveTask: async (t: ScheduleTask) => (await api<{ task: ScheduleTask }>('/tasks', { method: 'POST', body: t })).task,
  toggleTask: async (id: string, completed: boolean) =>
    (await api<{ task: ScheduleTask }>(`/tasks/${enc(id)}/toggle`, { method: 'PATCH', body: { completed } })).task,
  deleteTask: (id: string) => api(`/tasks/${enc(id)}`, { method: 'DELETE' }),

  // ---- Course sheet rows ----
  getSummerCourseRows: async (courseId?: string) =>
    (await api<{ rows: SummerCourseRow[] }>(`/summer-course-rows${courseId ? `?courseId=${enc(courseId)}` : ''}`)).rows,
  saveSummerCourseRow: async (row: SummerCourseRow) =>
    (await api<{ row: SummerCourseRow }>('/summer-course-rows', { method: 'POST', body: row })).row,
  saveSummerCourseRowsBulk: async (rows: SummerCourseRow[], replaceCourseId?: string) =>
    (await api<{ rows: SummerCourseRow[] }>('/summer-course-rows/bulk', { method: 'POST', body: { rows, replaceCourseId } })).rows,
  deleteSummerCourseRow: (id: string) => api(`/summer-course-rows/${enc(id)}`, { method: 'DELETE' }),

  // ---- Users ----
  getUsers: async () => (await api<{ users: AppUser[] }>('/users')).users,
  saveUser: async (u: Partial<AppUser> & { password?: string }) =>
    (await api<{ user: AppUser }>('/users', { method: 'POST', body: { ...u, expectedUpdatedAt: u.updatedAt } })).user,
  deleteUser: (id: string) => api(`/users/${enc(id)}`, { method: 'DELETE' }),

  // ---- Shared settings ----
  getBooks: async () => (await api<{ books: Book[] }>('/books')).books,
  saveBook: async (b: Book) => (await api<{ book: Book }>('/books', { method: 'POST', body: b })).book,
  deleteBook: (id: string) => api(`/books/${enc(id)}`, { method: 'DELETE' }),
  getProfiles: async () => (await api<{ profiles: PermissionProfile[] }>('/permission-profiles')).profiles,
  saveProfile: async (p: PermissionProfile) => (await api<{ profile: PermissionProfile }>('/permission-profiles', { method: 'POST', body: p })).profile,
  deleteProfile: (id: string) => api(`/permission-profiles/${enc(id)}`, { method: 'DELETE' }),
  getCustomPermissions: async () => (await api<{ permissions: PermissionDefinition[] }>('/custom-permissions')).permissions,
  saveCustomPermission: async (p: { id: string; label: string; description?: string }) =>
    (await api<{ permission: PermissionDefinition }>('/custom-permissions', { method: 'POST', body: p })).permission,
  deleteCustomPermission: (id: string) => api(`/custom-permissions/${enc(id)}`, { method: 'DELETE' }),

  // ---- Notifications ----
  getNotifications: async () => (await api<{ notifications: NotificationItem[] }>('/notifications')).notifications,
  markNotificationRead: (id: string) => api(`/notifications/${enc(id)}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => api('/notifications/read-all', { method: 'POST' }),

  // ---- Admin ----
  getAuditLogs: async () => (await api<{ logs: any[] }>('/audit-logs')).logs,
  getDatabaseStatus: () => api<DatabaseStatus>('/database/status'),
  extractTable: async (imageBase64: string, mimeType: string) =>
    (await api<{ data: { rows: any[] } }>('/extract-table', { method: 'POST', body: { imageBase64, mimeType } })).data,
};
