import type { Committee } from '../types';
import { todayISO } from './stageUtils';

export interface ExamDateStatus {
  label: string;
  tone: 'late' | 'today' | 'soon' | 'later';
}

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/**
 * What the committee's exam date means today: «فات ميعاد الامتحان», «الامتحان النهارده»,
 * «الامتحان بكرة» or «الامتحان بعد N يوم». Nothing once the exam is done or without a date.
 */
export function examDateStatus(c: Pick<Committee, 'examDate' | 'stages'>, today = todayISO()): ExamDateStatus | null {
  if (!c.examDate || c.stages?.exam?.completed) return null;
  const days = dayNumber(c.examDate) - dayNumber(today);
  if (days < 0) return { label: `فات ميعاد الامتحان (${c.examDate.slice(0, 10)}) ولم يُسجَّل بعد`, tone: 'late' };
  if (days === 0) return { label: 'الامتحان النهارده', tone: 'today' };
  if (days === 1) return { label: 'الامتحان بكرة', tone: 'soon' };
  return { label: `الامتحان بعد ${days} يوم (${c.examDate.slice(0, 10)})`, tone: days <= 3 ? 'soon' : 'later' };
}

export const EXAM_DATE_TONE_CLASS: Record<ExamDateStatus['tone'], string> = {
  late: 'bg-rose-50 text-rose-800 border-rose-300',
  today: 'bg-amber-50 text-amber-900 border-amber-300',
  soon: 'bg-sky-50 text-sky-800 border-sky-300',
  later: 'bg-slate-50 text-slate-700 border-slate-200',
};
