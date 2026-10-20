import { describe, expect, it } from 'vitest';
import { Committee, ScheduleTask } from '../../src/types';
import { ceremonyRows, examInProgressHtml, examInProgressRows, periodRange } from '../../src/utils/reportExport';

const stages = (done: string[]) =>
  Object.fromEntries(
    ['registration', 'exam', 'scoring', 'aggregation', 'review', 'sheet', 'accreditation', 'announcement', 'ceremony'].map((k) => [
      k,
      { completed: done.includes(k) },
    ])
  ) as Committee['stages'];

const committee = (over: Partial<Committee> = {}): Committee => ({
  id: 'c1',
  committeeNumber: 1,
  committeeName: 'لجنة',
  members: [],
  branch: '',
  competitionBook: '',
  generalNotes: '',
  stages: stages(['registration']),
  createdDate: '2026-10-01',
  createdAtTime: '',
  ...over,
});

describe('exam-in-progress sheet', () => {
  it('lists only committees in the exam stage, with sheikh, country, students and proctors, plus a totals row', () => {
    const rows = examInProgressRows([
      committee({ id: 'a', committeeNumber: 7, sheikhName: 'الشيخ أحمد', sheikhCountry: 'طنطا', studentsCount: 30, members: ['محمد', ' ', 'علي'] }),
      committee({ id: 'b', committeeNumber: 3, studentsCount: 12, members: ['خالد'] }),
      committee({ id: 'c', committeeNumber: 1, stages: stages(['registration', 'exam']) }),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ 'رقم اللجنة': 3, 'اسم الشيخ': '-', 'عدد الطلاب': 12, 'المراقبون': 'خالد' });
    expect(rows[1]).toMatchObject({ 'رقم اللجنة': 7, 'اسم الشيخ': 'الشيخ أحمد', 'البلد': 'طنطا', 'المراقبون': 'محمد، علي', 'عدد المراقبين': 2 });
    expect(rows[2]).toMatchObject({ 'عدد الطلاب': 42, 'عدد المراقبين': 3 });
  });

  it('is empty when no committee is in the exam stage', () => {
    expect(examInProgressRows([committee({ stages: stages(['registration', 'exam']) })])).toEqual([]);
  });
});

describe('ceremony periods', () => {
  it('runs a week from Saturday to Friday and a month over the calendar month', () => {
    expect(periodRange('day', '2026-10-21')).toEqual({ from: '2026-10-21', to: '2026-10-21' });
    expect(periodRange('week', '2026-10-21')).toEqual({ from: '2026-10-17', to: '2026-10-23' });
    expect(periodRange('week', '2026-10-17')).toEqual({ from: '2026-10-17', to: '2026-10-23' });
    expect(periodRange('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});

describe('ceremonies sheet', () => {
  const task = (committeeId: string, date: string, time = ''): ScheduleTask =>
    ({ id: `task-ceremony-${committeeId}`, type: 'ceremony', committeeId, date, time }) as ScheduleTask;

  it('takes every ceremony detail from the committee, inside the period only, ordered by date', () => {
    const committees = [
      committee({
        id: 'a',
        committeeNumber: 4,
        sheikhName: 'الشيخ محمود',
        sheikhCountry: 'المنصورة',
        studentsCount: 50,
        members: ['مراقب ١'],
        ceremonyDetails: {
          honoredStudentsCount: 45,
          attendingSheikhs: ['الشيخ سالم'],
          ceremonyPlace: 'مسجد النور',
          attendees: [{ id: 'u1', name: 'خالد' }],
        },
      }),
      committee({ id: 'b', committeeNumber: 2, studentsCount: 20, ceremonyDetails: { attendingSheikhs: [], ceremonyDate: '2026-10-18' } }),
      committee({ id: 'c', committeeNumber: 9, ceremonyDetails: { attendingSheikhs: [], ceremonyDate: '2026-11-02' } }),
    ];
    const rows = ceremonyRows(committees, [task('a', '2026-10-21', '8 مساءً')], 'week', '2026-10-21');
    expect(rows.map((r) => r['رقم اللجنة'])).toEqual([2, 4]);
    expect(rows[0]).toMatchObject({ 'التاريخ': '2026-10-18', 'اليوم': 'الأحد', 'عدد الطلاب المكرمين': 20, 'الحالة': 'مجدول' });
    expect(rows[1]).toMatchObject({
      'التاريخ': '2026-10-21',
      'اليوم': 'الأربعاء',
      'الوقت': '8 مساءً',
      'مكان الحفل': 'مسجد النور',
      'اسم الشيخ': 'الشيخ محمود',
      'البلد': 'المنصورة',
      'عدد الطلاب المكرمين': 45,
      'المشايخ الحاضرون': 'الشيخ سالم',
      'المدعوون للحفل': 'خالد',
      'مراقبو اللجنة': 'مراقب ١',
    });
    expect(ceremonyRows(committees, [], 'day', '2026-10-21')).toEqual([]);
  });
});

describe('exam-in-progress print page', () => {
  it('escapes committee text and ends with the totals row', () => {
    const html = examInProgressHtml([committee({ sheikhName: '<b>الشيخ</b>', studentsCount: 5, members: ['أ'] })], '2026-10-21');
    expect(html).toContain('&lt;b&gt;الشيخ&lt;/b&gt;');
    expect(html).toContain('2026-10-21 — 1 لجنة');
    expect(html).toContain('<tr class="total">');
  });
});
