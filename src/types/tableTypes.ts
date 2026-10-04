export interface CourseTableRow {
  id: string; // Unique row ID
  number: number; // 1) م (رقم تسلسلي)
  sheikh_name: string; // 2) اسم الشيخ
  place: string; // 3) المكان
  book: string; // 4) الكتاب
  delivered: boolean; // 5) التسليم للمقر (✓ / فارغ)
  corrected: boolean; // 6) تم التصحيح (✓ / فارغ)
  reviewed: boolean; // 7) تم المراجعة (✓ / فارغ)
  announced: boolean; // 8) تم الإعلان (✓ / فارغ)
  ceremony: boolean; // 9) تم الحفل (✓ / فارغ)
  struck_out?: boolean; // صف مشطوب
  uncertain?: boolean; // كلمة غير واضحة
  notes?: string; // ملاحظات أو قراءة غير مؤكدة
  createdAt?: string;
  updatedAt?: string;
}

export type TableFilterKey =
  | 'all'
  | 'not_delivered'
  | 'in_correction'
  | 'in_review'
  | 'in_announcement'
  | 'in_ceremony'
  | 'completed'
  | 'uncertain'
  | 'struck_out';

export interface TableSummaryStats {
  totalRows: number;
  activeRows: number;
  deliveredCount: number;
  correctedCount: number;
  reviewedCount: number;
  announcedCount: number;
  ceremonyCount: number;
  uncertainCount: number;
  struckCount: number;
  completionPercentage: number;
}

export interface ExtractedTableData {
  title?: string;
  sheet_date?: string;
  rows: Array<{
    number: number;
    sheikh_name: string;
    place: string;
    book: string;
    delivered: boolean;
    corrected: boolean;
    reviewed: boolean;
    announced: boolean;
    ceremony: boolean;
    struck_out?: boolean;
    uncertain?: boolean;
    notes?: string;
  }>;
}
