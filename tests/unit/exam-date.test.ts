import { describe, expect, it } from 'vitest';
import { examDateStatus } from '../../src/utils/examDate';

const c = (examDate?: string, examDone = false) => ({ examDate, stages: { exam: { completed: examDone } } as any });

describe('exam date shown on a committee', () => {
  it.each([
    ['2026-11-12', 'late', /فات ميعاد/],
    ['2026-11-13', 'today', /النهارده/],
    ['2026-11-14', 'soon', /بكرة/],
    ['2026-11-16', 'soon', /بعد 3 يوم/],
    ['2026-11-30', 'later', /بعد 17 يوم/],
  ])('%s → %s', (date, tone, label) => {
    const s = examDateStatus(c(date), '2026-11-13')!;
    expect(s.tone).toBe(tone);
    expect(s.label).toMatch(label);
  });

  it('nothing without a date, or once the exam is done', () => {
    expect(examDateStatus(c(undefined), '2026-11-13')).toBeNull();
    expect(examDateStatus(c('2026-11-01', true), '2026-11-13')).toBeNull();
  });

  it('works across months and the year end', () => {
    expect(examDateStatus(c('2027-01-01'), '2026-12-31')!.label).toMatch(/بكرة/);
  });
});
