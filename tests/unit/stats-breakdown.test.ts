import { describe, expect, it } from 'vitest';
import type { Committee, Course } from '../../src/types';
import { compareCourses, groupBy } from '../../src/utils/statsBreakdown';

const c = (over: Partial<Committee>): Committee => ({
  id: Math.random().toString(36), committeeNumber: 1, committeeName: 'x', members: [], branch: '', competitionBook: '', generalNotes: '',
  createdDate: '', createdAtTime: '', stages: {} as any, studentsCount: 0, ...over,
});
const held = { ceremony: { completed: true } } as any;

describe('statistics breakdown', () => {
  it('per book: committees, students, ceremonies and their share; largest first; blank = «غير محدد»', () => {
    const rows = groupBy(
      [c({ competitionBook: 'أ', studentsCount: 10, stages: held }), c({ competitionBook: 'أ', studentsCount: 5 }), c({ competitionBook: 'ب', studentsCount: 30 }), c({ competitionBook: ' ', studentsCount: 1 })],
      (x) => x.competitionBook
    );
    expect(rows).toEqual([
      { name: 'ب', committees: 1, students: 30, ceremonies: 0, ceremonyRate: 0 },
      { name: 'أ', committees: 2, students: 15, ceremonies: 1, ceremonyRate: 50 },
      { name: 'غير محدد', committees: 1, students: 1, ceremonies: 0, ceremonyRate: 0 },
    ]);
  });

  it('totals always add up to the whole course', () => {
    const list = Array.from({ length: 40 }, (_, i) => c({ sheikhName: `شيخ ${i % 7}`, studentsCount: i, stages: i % 3 ? held : ({} as any) }));
    const rows = groupBy(list, (x) => x.sheikhName);
    expect(rows.reduce((s, r) => s + r.committees, 0)).toBe(40);
    expect(rows.reduce((s, r) => s + r.students, 0)).toBe(list.reduce((s, x) => s + (x.studentsCount || 0), 0));
  });

  it('courses side by side, newest first, the current one marked, empty courses at zero', () => {
    const courses = [
      { id: 'old', name: 'دورة 2025', startDate: '2025-07-01' },
      { id: 'new', name: 'دورة 2026', startDate: '2026-07-01' },
      { id: 'none', name: 'دورة فاضية', startDate: '2024-01-01' },
    ] as Course[];
    const rows = compareCourses(
      [c({ courseId: 'old', studentsCount: 100, stages: held }), c({ courseId: 'new', studentsCount: 40 }), c({ courseId: 'new', studentsCount: 60, stages: held })],
      courses,
      'new'
    );
    expect(rows.map((r) => [r.name, r.committees, r.students, r.ceremonyRate, r.current])).toEqual([
      ['دورة 2026', 2, 100, 50, true],
      ['دورة 2025', 1, 100, 100, false],
      ['دورة فاضية', 0, 0, 0, false],
    ]);
  });
});
