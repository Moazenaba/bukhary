export type StageKey =
  | 'registration'   // 1. التسجيل (تم تلقائياً)
  | 'exam'           // 2. في انتظار الامتحان
  | 'scoring'        // 3. التصحيح
  | 'aggregation'    // 4. تجميع الدرجات
  | 'review'         // 5. المراجعة (قبل كتابة الكشف)
  | 'sheet'          // 6. كتابة الكشف
  | 'accreditation'  // 7. الاعتمادية (بعد كتابة الكشف)
  | 'announcement'   // 8. إعلان النتيجة
  | 'ceremony';      // 9. الحفل

export interface StageMeta {
  key: StageKey;
  label: string;
  /** The committee's state when this is the last stage it completed (registration: nothing done yet). */
  activeLabel: string;
  emoji: string;
  colorClass: string;
  badgeClass: string;
  dotColor: string;
}

export const STAGES_LIST: StageMeta[] = [
  {
    key: 'registration',
    label: 'التسجيل',
    activeLabel: 'في انتظار الامتحان',
    emoji: '📝',
    colorClass: 'text-slate-700 bg-slate-100 border-slate-300',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
    dotColor: 'bg-slate-400',
  },
  {
    key: 'exam',
    label: 'الامتحان',
    activeLabel: 'تم الامتحان',
    emoji: '🟦',
    colorClass: 'text-blue-700 bg-blue-50 border-blue-200',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    dotColor: 'bg-blue-500',
  },
  {
    key: 'scoring',
    label: 'التصحيح',
    activeLabel: 'تم التصحيح',
    emoji: '🟠',
    colorClass: 'text-amber-700 bg-amber-50 border-amber-200',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    dotColor: 'bg-amber-500',
  },
  {
    key: 'aggregation',
    label: 'تجميع الدرجات',
    activeLabel: 'تم التجميع',
    emoji: '🔵',
    colorClass: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dotColor: 'bg-indigo-500',
  },
  {
    key: 'review',
    label: 'المراجعة',
    activeLabel: 'تمت المراجعة',
    emoji: '🟡',
    colorClass: 'text-yellow-800 bg-yellow-50 border-yellow-300',
    badgeClass: 'bg-yellow-50 text-yellow-800 border-yellow-300',
    dotColor: 'bg-yellow-500',
  },
  {
    key: 'sheet',
    label: 'كتابة الكشف',
    activeLabel: 'تمت كتابة الكشف',
    emoji: '🟣',
    colorClass: 'text-purple-700 bg-purple-50 border-purple-200',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    dotColor: 'bg-purple-500',
  },
  {
    key: 'accreditation',
    label: 'الاعتمادية',
    activeLabel: 'تم الاعتماد',
    emoji: '📜',
    colorClass: 'text-emerald-800 bg-emerald-50 border-emerald-300',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    dotColor: 'bg-emerald-600',
  },
  {
    key: 'announcement',
    label: 'إعلان النتيجة',
    activeLabel: 'تم إعلان النتيجة',
    emoji: '📢',
    colorClass: 'text-cyan-700 bg-cyan-50 border-cyan-200',
    badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    dotColor: 'bg-cyan-500',
  },
  {
    key: 'ceremony',
    label: 'الحفل',
    activeLabel: 'تم الحفل',
    emoji: '🟢',
    colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotColor: 'bg-emerald-500',
  },
];

export interface QuestionScoringItem {
  id: string;
  questionNumber: number;
  label: string; // e.g. "السؤال الأول", "السؤال الثاني"
  completed: boolean;
  completedAt?: string;
  scorers?: string[]; // أسماء المصححين الذين صححوا هذا السؤال (يمكن أكثر من مصحح)
  score?: number;
  notes?: string;
}

export interface ScoringStageDetails {
  scorerName?: string;             // اسم المصحح
  scoringReviewerName?: string;    // اسم مراجع التصحيح
  questions: QuestionScoringItem[];// خطوات وتصحيح الأسئلة
  notes?: string;
}

export interface AggregationStageDetails {
  aggregatorName?: string;         // مجمع الدرجات في التجميع
  scoringReviewerName?: string;    // مراجع الدرجات في التصحيح
  aggregationReviewerName?: string;// مراجع الدرجات في التجميع
  date?: string;                   // تاريخ التجميع (YYYY-MM-DD)
  reviewConfirmed?: boolean;       // تم التأكيد والمطابقة
  notes?: string;
}

export interface CeremonyStageDetails {
  honoredStudentsCount?: number;   // عدد الطلاب المكرمين يدوياً
  attendingSheikhs: string[];      // أسماء المشايخ الحاضرين للحفل (إمكانية إضافة أكثر من شيخ)
  ceremonyDate?: string;           // موعد الحفل بالتاريخ
  ceremonyTime?: string;           // موعد الحفل بالوقت يكتبه بيده (مثال: 4 العصر، 4 المغرب)
  ceremonyPlace?: string;          // مكان الحفل
  notes?: string;                  // ملاحظات وترتيبات خاصة
  attendees?: Array<{ id: string; name: string }>; // المدعوون للحفل (حسابات؛ يصلهم إشعار)
}

export interface CommitteeStageRecord {
  completed: boolean;
  /** ISO time set by the server when the stage was completed. */
  completedAt?: string;
  /** Who completed it (set by the server). */
  completedBy?: string;
  notes?: string;
  excelUrl?: string; // رابط ملف الإكسيل / كشف الدرجات
}

export interface CommitteeReceiptInfo {
  assistantId: string;
  assistantName: string;
  receivedAt: string;
  status: 'received' | 'in_delivery';
  notes?: string;
}

export interface CommitteeExamApprovalInfo {
  assistantId: string;
  assistantName: string;
  approvedAt: string;
  notes?: string;
}

/** A committee head or sheikh assigned to a committee (from the server). */
export interface CommitteeStaff {
  id: string;
  name: string;
  role: UserRole;
  /** Only a committee head's phone is sent, so a committee's sheikhs know whom to call there. */
  phone?: string;
}

export interface Committee {
  id: string;
  /** Committee heads and sheikhs assigned to this committee. */
  staff?: CommitteeStaff[];
  committeeNumber: number;       // رقم اللجنة
  committeeName: string;         // اسم اللجنة
  associationName?: string;      // اسم الجمعية إن وُجد
  members: string[];             // أعضاء اللجنة
  branch: string;                // الفرع
  competitionBook: string;       // اسم المسابقة / الكتاب المقرر
  generalNotes: string;          // ملاحظات نصية حرة عامة خاصة باللجنة
  courseId?: string;             // الدورة التابعة لها
  courseName?: string;           // اسم الدورة (مثال: دورة الصيف، دورة الشتاء)
  
  // البيانات الجديدة للشيخ واللجنة والطلاب
  sheikhName?: string;           // اسم الشيخ المرسل إليه
  sheikhPhone?: string;          // رقم هاتف الشيخ
  sheikhCountry?: string;        // مكان الشيخ (العمود في قاعدة البيانات اسمه sheikh_country)
  examDate?: string | null;      // ميعاد امتحان اللجنة YYYY-MM-DD (null = يُمسح)
  studentsCount?: number;        // عدد الطلاب في اللجنة
  isWomenCommittee?: boolean;    // اختيار لجنة نسائية أو لا (true: نسائية / false: رجال)

  stages: Record<StageKey, CommitteeStageRecord>;
  excelUrl?: string;                             // رابط ملف الإكسيل لكتابة الكشف
  scoringDetails?: ScoringStageDetails;          // تفاصيل وحالة تصحيح الأسئلة
  aggregationDetails?: AggregationStageDetails;  // تفاصيل تجميع الدرجات
  ceremonyDetails?: CeremonyStageDetails;        // تفاصيل مرحلة الحفل والتكريم
  receivedByAssistant?: CommitteeReceiptInfo;    // توثيق استلام المعاون للجنة
  examApprovedBy?: CommitteeExamApprovalInfo;    // توثيق اعتماد المعاون لجاهزية الامتحان
  createdDate: string;
  createdAtTime: string;
  /** Server version of the record; sent back on save so stale edits are refused (409). */
  updatedAt?: string;
}

export type CourseStatus = 'active' | 'completed' | 'upcoming';

export interface Course {
  id: string;
  name: string;               // اسم الدورة (مثال: دورة الصيف، دورة الشتاء)
  season?: string;            // صيفية / شتوية / رمضانية / مكثفة
  year: string;               // العام الهجري أو الميلادي
  startDate: string;          // تاريخ البداية
  endDate: string;            // تاريخ النهاية
  status: CourseStatus;       // نشطة، مكتملة، قادمة
  description?: string;       // وصف وملاحظات الدورة
  targetCommitteesCount?: number; // عدد اللجان المتوقع
  isDefault?: boolean;        // الدورة الحالية المفعلة تلقائياً
  createdAt: string;
}

export type TaskPriority = 'urgent' | 'high' | 'normal';
export type TaskType = 'delivery' | 'receive' | 'exam' | 'scoring' | 'review' | 'ceremony' | 'general';

export interface ScheduleTask {
  id: string;
  title: string;                 // اسم العمل أو التسليم المطلوب
  date: string;                  // YYYY-MM-DD
  time?: string;                 // e.g. "09:30 ص"
  committeeId?: string;          // اللجنة المرتبطة
  committeeNumber?: number;
  assignedAssistantId?: string;  // المعاون المكلف
  assignedAssistantName?: string;
  type: TaskType;                // نوع العمل (تسليم، استلام، امتحان، رصد، عام)
  priority: TaskPriority;        // الأولوية
  completed: boolean;            // حالة الإنجاز
  completedAt?: string;
  deliverable?: string;          // ما يلزم تسليمه (كشوف، دفاتر، درجات، نماذج)
  notes?: string;
}

export type UserRole =
  | 'super_admin'      // المشرف العام: كل شيء، والوحيد الذي يرى حسابات الأدمن
  | 'admin'            // أدمن: كل الصلاحيات عدا صلاحيات المشرف العام، ولا يرى الأدمنز الآخرين
  | 'committee_head'   // رئيس لجنة: يدير اللجان المسندة إليه ويضيف إليها الشيوخ
  | 'sheikh';          // شيخ: يرى اللجان والحفلات المسندة إليه فقط

export interface RoleDefinition {
  role: UserRole;
  title: string;
  shortLabel: string;
  badgeClass: string;
  icon: string;
  description: string;
}

export const SYSTEM_ROLES: RoleDefinition[] = [
  {
    role: 'super_admin',
    title: 'المشرف العام (سوبر أدمن)',
    shortLabel: 'سوبر أدمن',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: 'verified_user',
    description: 'يرى كل شيء، بما فيه حسابات الأدمن، ويدير الأدمنز وسجلات التدقيق وقاعدة البيانات.',
  },
  {
    role: 'admin',
    title: 'أدمن',
    shortLabel: 'أدمن',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-300',
    icon: 'admin_panel_settings',
    description: 'كل الصلاحيات عدا صلاحيات السوبر أدمن: يدير الشيوخ ورؤساء اللجان واللجان والحفلات، ولا يرى الأدمنز الآخرين.',
  },
  {
    role: 'committee_head',
    title: 'رئيس لجنة',
    shortLabel: 'رئيس لجنة',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
    icon: 'school',
    description: 'يدير اللجان التي يسندها إليه الأدمن: يضيف إليها الشيوخ أو يزيلهم، ويدعوهم لحفلاتها.',
  },
  {
    role: 'sheikh',
    title: 'شيخ',
    shortLabel: 'شيخ',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: 'person',
    description: 'يرى اللجان والحفلات المسندة إليه فقط، ويصله تنبيه عند إضافته للجنة أو حفل.',
  },
];

export const roleDefinition = (role?: string) => SYSTEM_ROLES.find((r) => r.role === role);

export type AssistantStatus = 'pending' | 'interview' | 'approved' | 'rejected';

export type AssistantPermission = string;

export type SystemPermissionId =
  | 'database_sheets'
  | 'manage_committees'
  | 'add_new_committee'
  | 'exams_pdf'
  | 'manage_courses'
  | 'calendar_schedule'
  | 'progress_stats'
  | 'manage_assistants';

export interface PermissionDefinition {
  id: SystemPermissionId | string;
  label: string;
  description?: string;
  icon?: string;
  isCustom?: boolean;
}

export const SYSTEM_PERMISSIONS: PermissionDefinition[] = [
  {
    id: 'database_sheets',
    label: 'قاعدة البيانات والكشوفات',
    description: 'فتح واستعراض كشوفات قاعدة البيانات الميدانية والطلاب',
    icon: 'table_chart',
  },
  {
    id: 'manage_committees',
    label: 'إدارة اللجان',
    description: 'متابعة وإدارة لجان الاختبارات الميدانية وسير المراحل',
    icon: 'groups',
  },
  {
    id: 'add_new_committee',
    label: 'إضافة لجنة جديدة',
    description: 'صلاحية إنشاء وإضافة لجان جديدة في المنظومة',
    icon: 'add_circle',
  },
  {
    id: 'exams_pdf',
    label: 'الامتحانات ونماذج الـ PDF',
    description: 'بنك الامتحانات، نماذج الأسئلة، وطباعة وتصدير PDF',
    icon: 'description',
  },
  {
    id: 'manage_courses',
    label: 'إضافة الدورات',
    description: 'إضافة وإدارة الدورات العلمية الصيفية وتحديد الدورة النشطة',
    icon: 'event_repeat',
  },
  {
    id: 'calendar_schedule',
    label: 'الجدول وتقويم المواعيد',
    description: 'تقويم المواعيد وجدول مهام التسليم والاستلام الميداني',
    icon: 'calendar_month',
  },
  {
    id: 'progress_stats',
    label: 'حساب ونسبة الإنجاز',
    description: 'لوحة الإحصائيات الشاملة ونسب إنجاز اللجان',
    icon: 'donut_large',
  },
  {
    id: 'manage_assistants',
    label: 'المعاونون والصلاحيات',
    description: 'مراجعة طلبات الانضمام والتحكم في صلاحيات المستخدمين',
    icon: 'badge',
  },
];

export interface PermissionProfile {
  id: string;
  name: string;
  description: string;
  badgeColor?: 'emerald' | 'blue' | 'amber' | 'purple' | 'rose' | 'teal';
  /** Unused: screens follow the server's permissions; kept so older stored profiles still load. */
  allowedTabs?: string[];
  /** Committee numbers (older profiles); `allowedCommitteeIds` is what gets applied. */
  allowedCommittees: number[];
  allowedCommitteeIds?: string[];
  allCommitteesAllowed: boolean;
  allowedExamIds: string[];
  allExamsAllowed: boolean;
  permissions: AssistantPermission[];
  createdAt: string;
  createdBy?: string;
  isDefault?: boolean;
}

export interface AppUser {
  /** Server version; sent back on save so stale edits are refused (409). */
  updatedAt?: string;
  id: string;
  name: string;
  phone: string;
  whatsapp?: string;
  email: string;
  password?: string;
  role: UserRole;
  status: AssistantStatus;
  /** Committee numbers of the assigned committees (read-only; derived by the server from the ids). */
  assignedCommittees: number[];
  /** Assigned committees by id: what the server checks. Numbers repeat across courses, ids do not. */
  assignedCommitteeIds?: string[];
  permissions: AssistantPermission[]; // الصلاحيات الممنوحة
  /** Set after an admin password reset: the user must choose a new password first. */
  mustChangePassword?: boolean;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  notes?: string;
  
  // Access settings: enforced by the server and changed only by a super admin.
  profileId?: string | null;        // آخر بروفايل صلاحيات طُبّق على المستخدم
  allowedExamIds?: string[];        // الامتحانات المسموح بفتح ملفاتها ومحتواها
  allExamsAllowed?: boolean;        // كل الامتحانات
  allCommitteesAllowed?: boolean;   // كل اللجان في كل الدورات
  
  // Join Request & Dossier Fields (تفاصيل طلب الانضمام)
  requestCode?: string;             // كود تتبع الطلب (مثل REQ-2026-104)
  quranLevel?: string;              // مقدار حفظ القرآن والإجازات
  qualification?: string;           // المؤهل العلمي والتخصص
  experience?: string;              // الخبرات السابقة في لجان المساجد والمسابقات
  availability?: string;            // الفترات والأوقات المتاحة للتفرغ
  preferredCommittees?: number[];   // أرقام اللجان المفضلة
  interviewDate?: string;           // تاريخ ووقت المقابلة الشخصية
  interviewNotes?: string;          // ملاحظات المقابلة الشخصية
  rejectionReason?: string;         // سبب الاعتذار/الرفض
  rejectedAt?: string;              // تاريخ الاعتذار
  rejectedBy?: string;              // منفذ الاعتذار
}

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  type: 'urgent' | 'info' | 'success';
  read: boolean;
  committeeId?: string;
}

export interface GoogleSheetsConfig {
  sheetId: string;
  sheetName: string;
  webhookUrl: string;
  autoSync: boolean;
  lastSyncedAt?: string;
}

export interface ExamItem {
  id: string;
  title: string;                 // اسم الامتحان / عنوانه
  book: string;                  // الكتاب المقرر
  branch: string;                // الفرع
  totalMarks: number;            // الدرجة الكلية
  durationMinutes: number;       // مدة الامتحان بالدقائق
  pdfFileName?: string;          // اسم ملف الـ PDF
  pdfFileSize?: string;          // حجم الملف
  hasFile?: boolean;             // يوجد ملف مرفوع (يُنزَّل من /api/exams/:id/file للأدوار المسموح لها)
  sampleQuestions?: string[];
  uploadedAt: string;            // تاريخ الرفع (يحدده الخادم)
  notes?: string;                // تعليمات وملاحظات
  questionsCount?: number;       // عدد الأسئلة
  /** Whether the current user may open the file and see the content (server-evaluated). */
  canOpen?: boolean;
  /** When the paper may be downloaded (ISO); empty = as soon as it is uploaded. */
  opensAt?: string;
  /** For this user: the paper stays locked until this time (ISO). */
  lockedUntil?: string;
  updatedAt?: string;
}

/** Shared settings (GET /api/settings); admins change them in «إعدادات النظام». */
export interface SystemSettings {
  exam_open_hours_before: number;
  observers: string[];
  ceremony_sheikhs: string[];
  overdue_days: number;
  font_family: 'cairo' | 'tajawal' | 'ibm-plex-sans-arabic' | 'noto-naskh-arabic';
}

export const DEFAULT_SETTINGS: SystemSettings = {
  exam_open_hours_before: 24,
  observers: [],
  ceremony_sheikhs: [],
  overdue_days: 3,
  font_family: 'ibm-plex-sans-arabic',
};
