export interface CourseTableRow {
  id: string;
  number: string;
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
  createdAt?: string;
  updatedAt?: string;
}

export type FilterStatus =
  | 'all'
  | 'not_delivered'
  | 'delivered_only'
  | 'corrected'
  | 'reviewed'
  | 'announced'
  | 'ceremony'
  | 'uncertain'
  | 'struck_out';

export type SortField = 'number' | 'sheikh_name' | 'place' | 'book' | 'progress';
export type SortOrder = 'asc' | 'desc';

export interface ExtractionStats {
  total: number;
  delivered: number;
  corrected: number;
  reviewed: number;
  announced: number;
  ceremony: number;
  uncertain: number;
  struckOut: number;
  completionRate: number;
}
