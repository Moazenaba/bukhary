import { STAGES_LIST, type Committee, type ScheduleTask, type StageKey } from '../types';
import { todayISO } from './stageUtils';

export interface OverdueItem {
  committee: Committee;
  /** The stage that is late (the next one to do). */
  stage: StageKey;
  /** Days late (past the exam/ceremony date, or past the allowed days after the previous stage). */
  days: number;
  reason: string;
}

const STAGE_NAME: Record<StageKey, string> = Object.fromEntries(STAGES_LIST.map((s) => [s.key, s.label])) as any;

/** Whole days from `from` (an ISO date or time) to `today` (YYYY-MM-DD), by calendar date. */
function daysSince(from: string, today: string): number | null {
  const d = new Date(from.length <= 10 ? `${from}T00:00:00` : from);
  if (Number.isNaN(d.getTime())) return null;
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const [y, m, dd] = today.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, dd) - a) / 86_400_000);
}

/**
 * Committees that are late, with why — at most one item per committee (its next stage):
 * - the exam date has passed and the exam is not recorded;
 * - the ceremony date has passed and the ceremony is not recorded;
 * - any other stage: the previous stage was completed more than `overdueDays` days ago.
 * Most late first.
 */
export function overdueCommittees(
  committees: Committee[],
  opts: { overdueDays: number; today?: string; tasks?: ScheduleTask[] }
): OverdueItem[] {
  const today = opts.today ?? todayISO();
  const keys = STAGES_LIST.map((s) => s.key);
  const out: OverdueItem[] = [];
  for (const c of committees) {
    const next = keys.find((k) => !c.stages?.[k]?.completed);
    if (!next || next === 'registration') continue;
    const prev = keys[keys.indexOf(next) - 1];

    if (next === 'exam') {
      if (!c.examDate) continue;
      const days = daysSince(c.examDate, today);
      if (days !== null && days > 0) out.push({ committee: c, stage: next, days, reason: `فات ميعاد الامتحان (${c.examDate.slice(0, 10)}) من ${days} يوم ولم يُسجَّل` });
      continue;
    }
    if (next === 'ceremony') {
      const task = opts.tasks?.find((t) => t.id === `task-ceremony-${c.id}`);
      const date = (task?.date || c.ceremonyDetails?.ceremonyDate || '').slice(0, 10);
      if (date) {
        const days = daysSince(date, today);
        if (days !== null && days > 0) out.push({ committee: c, stage: next, days, reason: `فات ميعاد الحفل (${date}) من ${days} يوم ولم يُسجَّل «تم الحفل»` });
        continue;
      }
    }
    const doneAt = c.stages?.[prev]?.completedAt;
    if (!doneAt) continue;
    const since = daysSince(doneAt, today);
    if (since === null || since <= opts.overdueDays) continue;
    out.push({
      committee: c,
      stage: next,
      days: since - opts.overdueDays,
      reason: `${STAGE_NAME[next]}: منتظر من ${since} يوم (بعد «${STAGE_NAME[prev]}»)`,
    });
  }
  return out.sort((a, b) => b.days - a.days || a.committee.committeeNumber - b.committee.committeeNumber);
}
