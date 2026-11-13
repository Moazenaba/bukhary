import { describe, expect, it } from 'vitest';
import type { Committee } from '../../src/types';
import { overdueCommittees } from '../../src/utils/overdue';

const KEYS = ['registration', 'exam', 'scoring', 'aggregation', 'review', 'sheet', 'accreditation', 'announcement', 'ceremony'];
/** First `n` stages done, the last of them on `at`. */
const c = (id: string, n: number, at: string, over: Partial<Committee> = {}): Committee => ({
  id, committeeNumber: Number(id.replace(/\D/g, '')) || 1, committeeName: id, members: [], branch: '', competitionBook: '', generalNotes: '',
  createdDate: '', createdAtTime: '',
  stages: Object.fromEntries(KEYS.map((k, i) => [k, i < n ? { completed: true, completedAt: at } : { completed: false }])) as any,
  ...over,
});
const TODAY = '2026-11-13';
const late = (list: Committee[], days = 3, tasks: any[] = []) => overdueCommittees(list, { overdueDays: days, today: TODAY, tasks });

describe('late committees', () => {
  it('an exam date that has passed without the exam', () => {
    const [x] = late([c('c1', 1, '2026-11-01', { examDate: '2026-11-10' })]);
    expect(x).toMatchObject({ stage: 'exam', days: 3 });
    expect(x.reason).toMatch(/فات ميعاد الامتحان/);
  });

  it('an exam today or later, or no exam date, is not late', () => {
    expect(late([c('c1', 1, '2026-11-01', { examDate: TODAY }), c('c2', 1, '2026-11-01', { examDate: '2026-12-01' }), c('c3', 1, '2026-10-01')])).toEqual([]);
  });

  it('a stage waiting more than the allowed days after the previous one', () => {
    const [x] = late([c('c1', 2, '2026-11-05T10:00:00Z')]); // exam done 8 days ago, not corrected
    expect(x).toMatchObject({ stage: 'scoring', days: 5 });
    expect(x.reason).toMatch(/التصحيح: منتظر من 8 يوم/);
  });

  it('exactly the allowed days is not late yet; one more is', () => {
    expect(late([c('c1', 2, '2026-11-10')])).toEqual([]);
    expect(late([c('c1', 2, '2026-11-09')])).toHaveLength(1);
  });

  it('the allowed days come from the setting', () => {
    expect(late([c('c1', 2, '2026-11-05')], 10)).toEqual([]);
    expect(late([c('c1', 2, '2026-11-05')], 1)).toHaveLength(1);
  });

  it('the ceremony is late only after its own date', () => {
    const waiting = (date?: string) => c('c1', 8, '2026-10-01', date ? { ceremonyDetails: { ceremonyDate: date } as any } : {});
    expect(late([waiting('2026-11-20')])).toEqual([]);
    expect(late([waiting('2026-11-11')])[0]).toMatchObject({ stage: 'ceremony', days: 2 });
    // The calendar task's date wins over the stored detail.
    expect(late([waiting('2026-11-20')], 3, [{ id: 'task-ceremony-c1', date: '2026-11-12' }])[0]).toMatchObject({ days: 1 });
  });

  it('a finished committee is never late; one item per committee, most late first', () => {
    const list = late([c('c1', 9, '2026-01-01'), c('c2', 2, '2026-11-09'), c('c3', 2, '2026-10-01')]);
    expect(list.map((x) => x.committee.id)).toEqual(['c3', 'c2']);
  });
});
