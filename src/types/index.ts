export type StageKey =
  | 'registration'   // 1. التسجيل (تم تلقائياً)
  | 'exam'           // 2. جاري الامتحان الآن
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
    activeLabel: 'تم التسجيل',
    emoji: '📝',
    colorClass: 'text-slate-700 bg-slate-100 border-slate-300',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
    dotColor: 'bg-slate-400',
  },
  {
    key: 'exam',
    label: 'الامتحان',
    activeLabel: 'جاري الامتحان الآن',
    emoji: '🟦',
    colorClass: 'text-blue-700 bg-blue-50 border-blue-200',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    dotColor: 'bg-blue-500',
  },
  {
    key: 'scoring',
    label: 'التصحيح',
    activeLabel: 'في التصحيح',
    emoji: '🟠',
    colorClass: 'text-amber-700 bg-amber-50 border-amber-200',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    dotColor: 'bg-amber-500',
  },
  {
    key: 'aggregation',
    label: 'تجميع الدرجات',
    activeLabel: 'في التجميع',
    emoji: '🔵',
    colorClass: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dotColor: 'bg-indigo-500',
  },
  {
    key: 'review',
    label: 'المراجعة',
    activeLabel: 'في المراجعة والتدقيق',
    emoji: '🟡',
    colorClass: 'text-yellow-800 bg-yellow-50 border-yellow-300',
    badgeClass: 'bg-yellow-50 text-yellow-800 border-yellow-300',
    dotColor: 'bg-yellow-500',
  },
  {
    key: 'sheet',
    label: 'كتابة الكشف',
    activeLabel: 'كتابة الكشف',
    emoji: '🟣',
    colorClass: 'text-purple-700 bg-purple-50 border-purple-200',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    dotColor: 'bg-purple-500',
  },
  {
    key: 'accreditation',
    label: 'الاعتمادية',
    activeLabel: 'قيد الاعتمادية',
    emoji: '📜',
    colorClass: 'text-emerald-800 bg-emerald-50 border-emerald-300',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    dotColor: 'bg-emerald-600',
  },
  {
    key: 'announcement',
    label: 'إعلان النتيجة',
    activeLabel: 'إعلان النتيجة',
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
  reviewConfirmed?: boolean;       // تم التأكيد والمطابقة
  notes?: string;
}

export interface CommitteeStageRecord {
  completed: boolean;
  completedAt?: string; // Exact date & time formatted
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

export interface Committee {
  id: string;
  committeeNumber: number;       // رقم اللجنة
  committeeName: string;         // اسم اللجنة
  associationName?: string;      // اسم الجمعية إن وُجد
  members: string[];             // أعضاء اللجنة
  branch: string;                // الفرع
  competitionBook: string;       // اسم المسابقة / الكتاب المقرر
  generalNotes: string;          // ملاحظات نصية حرة عامة خاصة باللجنة
  courseId?: string;             // الدورة التابعة لها
  courseName?: string;           // اسم الدورة (مثال: دورة الصيف، دورة الشتاء)
  stages: Record<StageKey, CommitteeStageRecord>;
  scoringDetails?: ScoringStageDetails;          // تفاصيل وحالة تصحيح الأسئلة
  aggregationDetails?: AggregationStageDetails;  // تفاصيل تجميع الدرجات
  receivedByAssistant?: CommitteeReceiptInfo;    // توثيق استلام المعاون للجنة
  examApprovedBy?: CommitteeExamApprovalInfo;    // توثيق اعتماد المعاون لجاهزية الامتحان
  createdDate: string;
  createdAtTime: string;
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
export type TaskType = 'delivery' | 'receive' | 'exam' | 'scoring' | 'review' | 'general';

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

export type UserRole = 'super_admin' | 'assistant';
export type AssistantStatus = 'pending' | 'approved' | 'rejected';

export type AssistantPermission = string;

export interface PermissionDefinition {
  id: string;
  label: string;
  isCustom?: boolean;
}

export interface AppUser {
  id: string;
  name: string;
  phone: string;
  email: string;
  password?: string;
  role: UserRole;
  status: AssistantStatus;
  assignedCommittees: number[];  // أرقام اللجان المسندة للمعاون
  permissions: AssistantPermission[]; // الصلاحيات الممنوحة
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  notes?: string;
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
  pdfDataUrl?: string;           // رابط أو محتوى ملف الـ PDF
  uploadedAt: string;            // تاريخ وتوقيت الرفع
  notes?: string;                // تعليمات وملاحظات
  questionsCount?: number;       // عدد الأسئلة
}
