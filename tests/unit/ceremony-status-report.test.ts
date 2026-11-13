import { describe, expect, it } from 'vitest';
import type { Committee, ScheduleTask } from '../../src/types';
import { ceremonyStatusPdfTable, sheetRowsPdfTable } from '../../src/utils/reportExport';

const KEYS = ['registration', 'exam', 'scoring', 'aggregation', 'review', 'sheet', 'accreditation', 'announcement', 'ceremony'];
const stages = (n: number) => Object.fromEntries(KEYS.map((k, i) => [k, { completed: i < n }])) as any;
const c = (n: number, done: number, over: Partial<Committee> = {}): Committee => ({
  id: `c${n}`, committeeNumber: n, committeeName: `لجنة ${n}`, members: [], branch: 'فرع', competitionBook: 'كتاب', generalNotes: '',
  stages: stages(done), createdDate: '', createdAtTime: '', studentsCount: 10, ...over,
});

describe('«لم يتم الحفل» / «تم الحفل» report', () => {
  const committees = [
    c(3, 9, { sheikhName: 'شيخ 3', sheikhCountry: 'مسجد 3', ceremonyDetails: { ceremonyDate: '2026-11-05', ceremonyPlace: 'القاعة', honoredStudentsCount: 25, attendingSheikhs: ['أ', 'ب'] } as any }),
    c(1, 1, { sheikhName: 'شيخ 1' }),
    c(2, 8, { sheikhName: 'شيخ 2', ceremonyDetails: { ceremonyDate: '2026-11-20' } as any }),
  ];
  const tasks: ScheduleTask[] = [{ id: 'task-ceremony-c2', committeeId: 'c2', type: 'ceremony', date: '2026-11-21', time: '8 م', title: '', priority: 'high', completed: false } as any];

  it('«لم يتم الحفل» lists only committees without the ceremony, by number, with a total row', () => {
    const r = ceremonyStatusPdfTable(committees, tasks, 'not_held', 'الدورة');
    expect(r.count).toBe(2);
    expect(r.table.rows.slice(0, -1).map((x) => x[1])).toEqual([1, 2]);
    expect(r.table.rows.at(-1)).toContain('الإجمالي: 2 لجنة');
    expect(r.table.rows.at(-1)![5]).toBe(20);
    expect(r.table.totalRows).toEqual([2]);
    expect(r.table.subtitle).toContain('الدورة');
  });

  it('the scheduled date comes from the calendar task first, else «لم يُحدد بعد»', () => {
    const r = ceremonyStatusPdfTable(committees, tasks, 'not_held');
    const col = r.table.columns.indexOf('موعد الحفل');
    expect(r.table.rows[0][col]).toBe('لم يُحدد بعد');
    expect(r.table.rows[1][col]).toBe('2026-11-21 (السبت) 8 م');
    expect(r.table.rows[1][r.table.columns.indexOf('المرحلة الحالية')]).toBeTruthy();
  });

  it('«تم الحفل» lists held ceremonies with honoured students, place and sheikhs; the place falls back to the branch', () => {
    const r = ceremonyStatusPdfTable(committees, tasks, 'held');
    expect(r.count).toBe(1);
    const row = r.table.rows[0];
    const at = (name: string) => row[r.table.columns.indexOf(name)];
    expect(at('المكان')).toBe('مسجد 3');
    expect(at('عدد الطلاب المكرمين')).toBe(25);
    expect(at('مكان الحفل')).toBe('القاعة');
    expect(at('المشايخ الحاضرون')).toBe('أ، ب');
    expect(ceremonyStatusPdfTable([c(9, 1)], [], 'not_held').table.rows[0][3]).toBe('فرع');
  });

  it('every row has exactly one cell per column', () => {
    for (const status of ['held', 'not_held'] as const) {
      const r = ceremonyStatusPdfTable(committees, tasks, status);
      for (const row of r.table.rows) expect(row).toHaveLength(r.table.columns.length);
    }
  });

  it('no committees: empty report and no total row', () => {
    const r = ceremonyStatusPdfTable([], [], 'held');
    expect(r.count).toBe(0);
    expect(r.table.rows).toEqual([]);
  });
});

describe('course sheet PDF (rows on screen)', () => {
  it('has the sheet columns, ✓/— marks and a total', () => {
    const r = sheetRowsPdfTable(
      [{ number: 4, sheikh_name: 'شيخ', place: 'مسجد', book: 'كتاب', students_count: 7, delivered: true, corrected: false, reviewed: false, announced: false, ceremony: false }],
      'لم يتم الحفل',
      'sheetta'
    );
    expect(r.table.title).toContain('لم يتم الحفل');
    expect(r.table.rows[0]).toEqual([4, 'شيخ', 'مسجد', 'كتاب', 7, '✓', '—', '—', '—', '—']);
    expect(r.table.rows[1][4]).toBe(7);
    for (const row of r.table.rows) expect(row).toHaveLength(r.table.columns.length);
  });
});
