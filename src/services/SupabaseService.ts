import { Committee, Course, AppUser, ExamItem, ScheduleTask, NotificationItem } from '../types';

export interface DatabaseStatusResponse {
  connected: boolean;
  engine?: string;
  latencyMs?: number;
  tablesCount?: number;
  tables?: Array<{ name: string; count?: number; status?: string }> | string[];
  database?: string;
  user?: string;
  postgresVersion?: string;
  error?: string;
}

export interface MigrationResult {
  success: boolean;
  message: string;
  durationMs?: number;
  tablesCount?: number;
  tables?: Array<{ name: string; count: number; status: string }>;
  error?: string;
}

export class SupabaseService {
  private static baseUrl = '/api';

  /**
   * فحص الاتصال الحي المباشر بقاعدة بيانات سوبابيز
   */
  static async checkStatus(): Promise<DatabaseStatusResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/database/test`);
      const data = await res.json();
      if (data.success && data.connection) {
        return {
          connected: true,
          engine: 'Supabase PostgreSQL',
          latencyMs: data.connection.latencyMs,
          database: data.connection.database,
          user: data.connection.user,
          postgresVersion: data.connection.postgresVersion,
          tablesCount: data.connection.tablesCount,
          tables: data.connection.tables,
        };
      }
      return { connected: false, error: data.message || 'تعذر الاتصال' };
    } catch (err: any) {
      return { connected: false, error: err.message };
    }
  }

  /**
   * تنفيذ المخطط الكامل ورفع كافة الجداول والفهارس لسوبابيز فورياً
   */
  static async runMigration(): Promise<MigrationResult> {
    try {
      const res = await fetch(`${this.baseUrl}/database/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return {
        success: false,
        message: 'فشل تشغيل الترقية المباشرة: ' + err.message,
        error: err.message,
      };
    }
  }

  /**
   * استخراج نص ملف المخطط الشامل SQL
   */
  static async getSchemaSql(): Promise<string> {
    try {
      const res = await fetch(`${this.baseUrl}/database/schema`);
      const data = await res.json();
      return data.sql || '';
    } catch (err) {
      console.error('فشل جلب نص المخطط:', err);
      return '';
    }
  }

  // -------------------------------------------------------------
  // Committees (إدارة اللجان في سوبابيز)
  // -------------------------------------------------------------
  static async getCommittees(): Promise<Committee[]> {
    try {
      const res = await fetch(`${this.baseUrl}/committees`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.committees)) {
        return data.committees;
      }
      return [];
    } catch (err) {
      console.warn('تعذر جلب اللجان من سوبابيز، سيتم استخدام التخزين الاحتياطي:', err);
      return [];
    }
  }

  static async saveCommittee(committee: Committee): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/committees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(committee),
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.error('فشل حفظ اللجنة في سوبابيز:', err);
      return false;
    }
  }

  static async saveCommitteesBulk(committees: Committee[]): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/committees/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ committees }),
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.error('فشل حفظ اللجان دفعة واحدة في سوبابيز:', err);
      return false;
    }
  }

  static async deleteCommittee(committeeId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/committees/${committeeId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.error('فشل حذف اللجنة من سوبابيز:', err);
      return false;
    }
  }

  // -------------------------------------------------------------
  // Courses (إدارة الدورات في سوبابيز)
  // -------------------------------------------------------------
  static async getCourses(): Promise<Course[]> {
    try {
      const res = await fetch(`${this.baseUrl}/courses`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.courses)) {
        return data.courses;
      }
      return [];
    } catch (err) {
      console.warn('تعذر جلب الدورات من سوبابيز، سيتم استخدام التخزين الاحتياطي:', err);
      return [];
    }
  }

  static async saveCourse(course: Course): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/courses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(course),
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.error('فشل حفظ الدورة في سوبابيز:', err);
      return false;
    }
  }

  static async deleteCourse(courseId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/courses/${courseId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.error('فشل حذف الدورة من سوبابيز:', err);
      return false;
    }
  }

  // -------------------------------------------------------------
  // Users (المستخدمون والمعاونون في سوبابيز)
  // -------------------------------------------------------------
  static async getUsers(params?: { limit?: number; offset?: number }): Promise<{ users: AppUser[]; total: number; hasMore?: boolean; limit?: number; offset?: number } | AppUser[]> {
    try {
      const query = params && params.limit !== undefined
        ? `?limit=${params.limit}&offset=${params.offset || 0}`
        : '';
      const res = await fetch(`${this.baseUrl}/users${query}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (params && params.limit !== undefined) {
        return {
          users: data.users || [],
          total: data.total ?? (data.users || []).length,
          hasMore: Boolean(data.hasMore),
          limit: data.limit,
          offset: data.offset,
        };
      }
      if (data.success && Array.isArray(data.users)) {
        return data.users;
      }
      return [];
    } catch (err) {
      console.warn('تعذر جلب المستخدمين من سوبابيز:', err);
      return params && params.limit !== undefined ? { users: [], total: 0, hasMore: false } : [];
    }
  }

  static async saveUser(user: AppUser): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.error('فشل حفظ المستخدم في سوبابيز:', err);
      return false;
    }
  }

  static async deleteUser(userId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/users/${userId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.error('فشل حذف المستخدم من سوبابيز:', err);
      return false;
    }
  }

  // -------------------------------------------------------------
  // Exams (بنك الامتحانات في سوبابيز)
  // -------------------------------------------------------------
  static async getExams(): Promise<ExamItem[]> {
    try {
      const res = await fetch(`${this.baseUrl}/exams`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.exams)) {
        return data.exams;
      }
      return [];
    } catch (err) {
      console.warn('تعذر جلب الامتحانات من سوبابيز:', err);
      return [];
    }
  }

  static async saveExam(exam: ExamItem): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/exams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exam),
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.error('فشل حفظ الامتحان في سوبابيز:', err);
      return false;
    }
  }

  static async deleteExam(examId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/exams/${examId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.error('فشل حذف الامتحان من سوبابيز:', err);
      return false;
    }
  }

  // -------------------------------------------------------------
  // Schedule Tasks (المهام والتقويم في سوبابيز)
  // -------------------------------------------------------------
  static async getTasks(): Promise<ScheduleTask[]> {
    try {
      const res = await fetch(`${this.baseUrl}/tasks`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.tasks)) {
        return data.tasks;
      }
      return [];
    } catch (err) {
      console.warn('تعذر جلب المهام من سوبابيز:', err);
      return [];
    }
  }

  static async saveTask(task: ScheduleTask): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.error('فشل حفظ المهمة في سوبابيز:', err);
      return false;
    }
  }

  static async toggleTask(taskId: string, completed: boolean, completedAt?: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/tasks/${taskId}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed, completedAt }),
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.error('فشل تحديث المهمة في سوبابيز:', err);
      return false;
    }
  }

  static async deleteTask(taskId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.error('فشل حذف المهمة من سوبابيز:', err);
      return false;
    }
  }

  // -------------------------------------------------------------
  // Notifications (الإشعارات في سوبابيز)
  // -------------------------------------------------------------
  static async getNotifications(params?: { limit?: number; offset?: number }): Promise<{ notifications: NotificationItem[]; total: number; hasMore?: boolean; limit?: number; offset?: number } | NotificationItem[]> {
    try {
      const query = params && params.limit !== undefined
        ? `?limit=${params.limit}&offset=${params.offset || 0}`
        : '';
      const res = await fetch(`${this.baseUrl}/notifications${query}`);
      const data = await res.json();
      if (params && params.limit !== undefined) {
        return {
          notifications: data.notifications || [],
          total: data.total ?? (data.notifications || []).length,
          hasMore: Boolean(data.hasMore),
          limit: data.limit,
          offset: data.offset,
        };
      }
      if (data.success && Array.isArray(data.notifications)) {
        return data.notifications;
      }
      return [];
    } catch (err) {
      return params && params.limit !== undefined ? { notifications: [], total: 0, hasMore: false } : [];
    }
  }

  static async markNotificationRead(notifId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/notifications/${notifId}/read`, {
        method: 'PATCH',
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      return false;
    }
  }

  // -------------------------------------------------------------
  // Audit Logs (سجلات التدقيق في سوبابيز)
  // -------------------------------------------------------------
  static async getAuditLogs(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/audit-logs`);
      const data = await res.json();
      return data.logs || [];
    } catch (err) {
      return [];
    }
  }

  static async addAuditLog(entry: { userName: string; userRole?: string; action: string; details?: string }): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/audit-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch (err) {
      console.warn('تعذر تسجيل سجل التدقيق:', err);
    }
  }

  // -------------------------------------------------------------
  // Initial Sync (المزامنة الشاملة الأولية)
  // -------------------------------------------------------------
  static async syncInitialData(
    localCommittees: Committee[],
    localCourses: Course[]
  ): Promise<{ committees: Committee[]; courses: Course[]; synced: boolean }> {
    try {
      const res = await fetch(`${this.baseUrl}/sync/initial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ committees: localCommittees, courses: localCourses }),
      });
      const data = await res.json();
      if (data.success) {
        return {
          committees: data.committees || localCommittees,
          courses: data.courses || localCourses,
          synced: true,
        };
      }
    } catch (err) {
      console.error('فشل المزامنة الأولية مع سوبابيز:', err);
    }
    return { committees: localCommittees, courses: localCourses, synced: false };
  }
}
