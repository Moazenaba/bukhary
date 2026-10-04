export interface SummerCourseRow {
  id: string;
  number: number; // 1) م (رقم تسلسلي)
  sheikh_name: string; // 2) اسم الشيخ
  place: string; // 3) المكان
  book: string; // 4) الكتاب
  students_count?: number; // عدد الطلاب باللجنة
  delivered: boolean; // 5) تم الامتحان
  corrected: boolean; // 6) تم التصحيح
  reviewed: boolean; // 7) تم المراجعة
  announced: boolean; // 8) تم الإعلان
  ceremony: boolean; // 9) تم الحفل
  struck_out?: boolean; // هل الصف مشطوب كامل
  uncertain?: boolean; // هل هناك قراءة غير مؤكدة وتحتاج تدقيق
  notes?: string; // ملاحظات اختيارية
  updatedAt?: string;
  committeeId?: string; // معرف اللجنة المرتبطة في نظام اللجان
}

export type CourseFilterStatus =
  | 'all'
  | 'not_delivered'
  | 'delivered'
  | 'corrected'
  | 'reviewed'
  | 'announced'
  | 'ceremony'
  | 'uncertain'
  | 'struck_out';

export interface SummerCourseStats {
  totalRows: number;
  activeRows: number;
  deliveredCount: number;
  correctedCount: number;
  reviewedCount: number;
  announcedCount: number;
  ceremonyCount: number;
  uncertainCount: number;
  struckCount: number;
  totalStudentsCount: number; // مجموع عدد الطلاب في الدورة
}
