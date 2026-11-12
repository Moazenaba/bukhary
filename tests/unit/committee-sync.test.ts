import { describe, expect, it } from 'vitest';
import type { Committee } from '../../src/types';
import type { SummerCourseRow } from '../../src/types/summerCourse';
import { committeePlace, mergeRowsWithCommittees } from '../../src/utils/committeeSync';

const committee = (over: Partial<Committee> = {}): Committee => ({
  id: 'c1', committeeNumber: 1, committeeName: 'لجنة 1', members: [], branch: '', competitionBook: 'كتاب اللجنة',
  generalNotes: '', courseId: 'crs', courseName: 'الدورة', stages: {} as any, createdDate: '', createdAtTime: '', ...over,
});
const row = (over: Partial<SummerCourseRow> = {}): SummerCourseRow => ({
  id: 'r1', number: 9, sheikh_name: 'اسم قديم', place: 'مكان قديم', book: 'كتاب قديم', students_count: 3,
  delivered: false, corrected: false, reviewed: false, announced: false, ceremony: false, ...over,
});

describe('course sheet = saved rows + committees', () => {
  it('the place is the sheikh\'s place stored on the committee, then its branch', () => {
    expect(committeePlace(committee({ sheikhCountry: ' مسجد النور ', branch: 'فرع' }))).toBe('مسجد النور');
    expect(committeePlace(committee({ branch: 'فرع' }))).toBe('فرع');
    expect(committeePlace(committee())).toBe('');
  });

  it('a committee without a saved row still appears (virtual), with its place', () => {
    const [r] = mergeRowsWithCommittees([], [committee({ sheikhName: 'الشيخ', sheikhCountry: 'مسجد' })]);
    expect(r).toMatchObject({ virtual: true, sheikh_name: 'الشيخ', place: 'مسجد', committeeId: 'c1' });
  });

  it('for a linked row the committee wins (edits made anywhere show in the sheet)', () => {
    const [r] = mergeRowsWithCommittees(
      [row({ committeeId: 'c1' })],
      [committee({ sheikhName: 'اسم جديد', sheikhCountry: 'مكان جديد', competitionBook: 'كتاب جديد', studentsCount: 40 })]
    );
    expect(r).toMatchObject({ number: 1, sheikh_name: 'اسم جديد', place: 'مكان جديد', book: 'كتاب جديد', students_count: 40 });
  });

  it('the row\'s own copy is the fallback when the committee field is empty (nothing is lost)', () => {
    const [r] = mergeRowsWithCommittees([row({ committeeId: 'c1' })], [committee({ competitionBook: '' })]);
    expect(r).toMatchObject({ sheikh_name: 'اسم قديم', place: 'مكان قديم', book: 'كتاب قديم', students_count: 3 });
  });

  it('each committee appears exactly once, and rows are ordered by number', () => {
    const out = mergeRowsWithCommittees(
      [row({ id: 'r1', committeeId: 'c2' }), row({ id: 'r2', number: 1 })],
      [committee({ id: 'c2', committeeNumber: 5 }), committee({ id: 'c3', committeeNumber: 3 })]
    );
    expect(out.filter((x) => x.committeeId === 'c2')).toHaveLength(1);
    expect(out.map((x) => x.number)).toEqual([1, 3, 5]);
  });

  it('a row whose committee was deleted keeps its own data', () => {
    const [r] = mergeRowsWithCommittees([row({ committeeId: 'gone' })], []);
    expect(r).toMatchObject({ sheikh_name: 'اسم قديم', place: 'مكان قديم' });
  });
});
