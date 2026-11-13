import * as XLSX from 'xlsx';
import { Committee, ScheduleTask } from '../types';
import { calculateCurrentStage, todayISO } from './stageUtils';

export type CeremonyPeriod = 'day' | 'week' | 'month';

const ARABIC_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const PERIOD_LABELS: Record<CeremonyPeriod, string> = { day: 'يومي', week: 'أسبوعي', month: 'شهري' };

const joinNames = (names: (string | undefined)[] | undefined) =>
  (names ?? []).map((n) => n?.trim()).filter(Boolean).join('، ') || '-';

const parseISO = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

function writeSheet(rows: Record<string, string | number>[], widths: number[], sheetName: string, filename: string) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = widths.map((wch) => ({ wch }));
  const book = XLSX.utils.book_new();
  // SheetJS writes right-to-left from the workbook view; a sheet-level '!views' is ignored.
  book.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  XLSX.writeFile(book, `${filename}.xlsx`);
}

/** Committees whose current stage is «في انتظار الامتحان», ordered by committee number. */
export const examInProgressCommittees = (committees: Committee[]) =>
  committees
    .filter((c) => calculateCurrentStage(c.stages).key === 'exam')
    .sort((a, b) => a.committeeNumber - b.committeeNumber);

export function examInProgressRows(committees: Committee[]) {
  const list = examInProgressCommittees(committees);
  const rows: Record<string, string | number>[] = list.map((c, i) => ({
    'م': i + 1,
    'رقم اللجنة': c.committeeNumber,
    'اسم اللجنة': c.committeeName,
    'اسم الشيخ': c.sheikhName || '-',
    'المكان': c.sheikhCountry || '-',
    'عدد الطلاب': c.studentsCount || 0,
    'المراقبون': joinNames(c.members),
    'عدد المراقبين': c.members.filter((m) => m.trim()).length,
    'الكتاب / المسابقة': c.competitionBook || '-',
    'الجمعية': c.associationName || '-',
    'نوع اللجنة': c.isWomenCommittee ? 'نسائية' : 'رجال',
  }));
  if (rows.length > 0) {
    rows.push({
      'م': '',
      'رقم اللجنة': '',
      'اسم اللجنة': `الإجمالي (${list.length} لجنة)`,
      'اسم الشيخ': '',
      'المكان': '',
      'عدد الطلاب': list.reduce((sum, c) => sum + (c.studentsCount || 0), 0),
      'المراقبون': '',
      'عدد المراقبين': list.reduce((sum, c) => sum + c.members.filter((m) => m.trim()).length, 0),
      'الكتاب / المسابقة': '',
      'الجمعية': '',
      'نوع اللجنة': '',
    });
  }
  return rows;
}

/** Downloads the «في انتظار الامتحان» sheet; returns how many committees it holds. */
export function exportExamInProgressToExcel(committees: Committee[]): number {
  const rows = examInProgressRows(committees);
  if (rows.length === 0) return 0;
  writeSheet(rows, [5, 10, 24, 24, 16, 11, 40, 12, 24, 20, 10], 'في انتظار الامتحان', `كشف_في_انتظار_الامتحان_${todayISO()}`);
  return rows.length - 1;
}

/** First and last day (inclusive, YYYY-MM-DD) of the day, week (Saturday to Friday) or month around `anchor`. */
export function periodRange(period: CeremonyPeriod, anchor: string): { from: string; to: string } {
  const d = parseISO(anchor);
  if (period === 'day') return { from: anchor, to: anchor };
  if (period === 'week') {
    const start = new Date(d);
    start.setDate(d.getDate() - ((d.getDay() + 1) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: todayISO(start), to: todayISO(end) };
  }
  return {
    from: todayISO(new Date(d.getFullYear(), d.getMonth(), 1)),
    to: todayISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  };
}

const ceremonyTask = (c: Committee, tasks: ScheduleTask[]) =>
  tasks.find((t) => t.id === `task-ceremony-${c.id}`) ?? tasks.find((t) => t.type === 'ceremony' && t.committeeId === c.id);

/** Ceremonies dated inside the period, with every detail the committee holds about them. */
export function ceremonyRows(committees: Committee[], tasks: ScheduleTask[], period: CeremonyPeriod, anchor: string) {
  const { from, to } = periodRange(period, anchor);
  return committees
    .map((c) => {
      const task = ceremonyTask(c, tasks);
      const d = c.ceremonyDetails;
      return { c, d, task, date: (task?.date || d?.ceremonyDate || '').slice(0, 10), time: task?.time || d?.ceremonyTime || '' };
    })
    .filter((x) => x.date && x.date >= from && x.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.c.committeeNumber - b.c.committeeNumber)
    .map(({ c, d, task, date, time }, i) => ({
      'م': i + 1,
      'التاريخ': date,
      'اليوم': ARABIC_DAYS[parseISO(date).getDay()],
      'الوقت': time || '-',
      'مكان الحفل': d?.ceremonyPlace || '-',
      'رقم اللجنة': c.committeeNumber,
      'اسم اللجنة': c.committeeName,
      'اسم الشيخ': c.sheikhName || '-',
      'مكان الشيخ': c.sheikhCountry || '-',
      'عدد الطلاب المكرمين': d?.honoredStudentsCount || c.studentsCount || 0,
      'المشايخ الحاضرون': joinNames(d?.attendingSheikhs),
      'المدعوون للحفل': joinNames(d?.attendees?.map((a) => a.name)),
      'مراقبو اللجنة': joinNames(c.members),
      'الكتاب / المسابقة': c.competitionBook || '-',
      'الحالة': c.stages.ceremony?.completed ? 'تم الحفل' : 'مجدول',
      'ملاحظات': d?.notes || '-',
    }));
}

/** Downloads the ceremonies sheet for the period; returns how many ceremonies it holds. */
export function exportCeremoniesToExcel(committees: Committee[], tasks: ScheduleTask[], period: CeremonyPeriod, anchor: string): number {
  const rows = ceremonyRows(committees, tasks, period, anchor);
  if (rows.length === 0) return 0;
  const { from, to } = periodRange(period, anchor);
  const span = from === to ? from : `${from}_إلى_${to}`;
  writeSheet(
    rows,
    [5, 12, 10, 18, 22, 10, 22, 22, 14, 12, 28, 28, 32, 22, 10, 28],
    `الحفلات (${PERIOD_LABELS[period]})`,
    `كشف_الحفلات_${PERIOD_LABELS[period]}_${span}`
  );
  return rows.length;
}

const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Print-ready page of the «في انتظار الامتحان» sheet (the print dialog saves it as PDF). */
export function examInProgressHtml(committees: Committee[], date = todayISO()): string {
  const rows = examInProgressRows(committees);
  const columns = ['م', 'رقم اللجنة', 'اسم اللجنة', 'اسم الشيخ', 'المكان', 'عدد الطلاب', 'المراقبون', 'عدد المراقبين'];
  const body = rows
    .map((r, i) => `<tr${i === rows.length - 1 ? ' class="total"' : ''}>${columns.map((c) => `<td>${escapeHtml(r[c])}</td>`).join('')}</tr>`)
    .join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كشف في انتظار الامتحان ${date}</title><style>
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;margin:24px;color:#0f172a}
h1{font-size:18px;text-align:center;margin:0 0 4px}p{text-align:center;margin:0 0 16px;font-size:12px;color:#475569}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #94a3b8;padding:6px 8px;text-align:right;vertical-align:top}
th{background:#e2e8f0}tr.total td{font-weight:bold;background:#f1f5f9}@page{size:A4 landscape;margin:12mm}
</style></head><body><h1>كشف لجان «في انتظار الامتحان» — مسابقات مسجد الإمام البخاري</h1><p>${date} — ${rows.length - 1} لجنة</p>
<table><thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

/** Opens the print dialog for the «في انتظار الامتحان» sheet; returns how many committees it holds. */
export function printExamInProgress(committees: Committee[]): number {
  const count = examInProgressCommittees(committees).length;
  if (count === 0) return 0;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(examInProgressHtml(committees));
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  }, 100);
  return count;
}

/** The ceremonies sheet of the period as a PDF table (the columns that fit on an A4 landscape page). */
export function ceremoniesPdfTable(committees: Committee[], tasks: ScheduleTask[], period: CeremonyPeriod, anchor: string) {
  const rows = ceremonyRows(committees, tasks, period, anchor);
  const { from, to } = periodRange(period, anchor);
  const columns = [
    'م', 'التاريخ', 'اليوم', 'الوقت', 'مكان الحفل', 'رقم اللجنة', 'اسم الشيخ', 'مكان الشيخ',
    'عدد الطلاب المكرمين', 'المشايخ الحاضرون', 'المدعوون للحفل', 'الكتاب / المسابقة', 'الحالة',
  ] as const;
  const span = from === to ? from : `من ${from} إلى ${to}`;
  return {
    count: rows.length,
    // Latin file name: some phones and browsers drop an Arabic name when saving or sharing a file.
    filename: `Bukhari-ceremonies-${period}-${from === to ? from : `${from}_to_${to}`}.pdf`,
    table: {
      title: `كشف الحفلات (${PERIOD_LABELS[period]}) — مسابقات مسجد الإمام البخاري`,
      subtitle: `${span} — ${rows.length} حفل`,
      columns: [...columns],
      rows: rows.map((r) => columns.map((c) => r[c] as string | number)),
    },
  };
}

export type CeremonyStatus = 'not_held' | 'held';
export const CEREMONY_STATUS_LABEL: Record<CeremonyStatus, string> = { not_held: 'لم يتم الحفل', held: 'تم الحفل' };

/**
 * «لم يتم الحفل» / «تم الحفل» report: the committees in that state with the sheet's data (sheikh,
 * place, book, students) and their ceremony details, ordered by committee number, with a total row.
 */
export function ceremonyStatusPdfTable(committees: Committee[], tasks: ScheduleTask[], status: CeremonyStatus, courseName?: string) {
  const list = committees
    .filter((c) => Boolean(c.stages.ceremony?.completed) === (status === 'held'))
    .sort((a, b) => a.committeeNumber - b.committeeNumber);
  const place = (c: Committee) => c.sheikhCountry?.trim() || c.branch?.trim() || '-';
  const when = (c: Committee) => {
    const task = ceremonyTask(c, tasks);
    const date = (task?.date || c.ceremonyDetails?.ceremonyDate || '').slice(0, 10);
    const time = task?.time || c.ceremonyDetails?.ceremonyTime || '';
    return date ? `${date} (${ARABIC_DAYS[parseISO(date).getDay()]})${time ? ` ${time}` : ''}` : '';
  };
  const students = (c: Committee) => (status === 'held' ? c.ceremonyDetails?.honoredStudentsCount || c.studentsCount || 0 : c.studentsCount || 0);
  const columns =
    status === 'held'
      ? ['م', 'رقم اللجنة', 'اسم الشيخ', 'المكان', 'الكتاب المقرر', 'عدد الطلاب المكرمين', 'تاريخ الحفل', 'مكان الحفل', 'المشايخ الحاضرون']
      : ['م', 'رقم اللجنة', 'اسم الشيخ', 'المكان', 'الكتاب المقرر', 'عدد الطلاب', 'المرحلة الحالية', 'موعد الحفل', 'مكان الحفل'];
  const rows: (string | number)[][] = list.map((c, i) =>
    status === 'held'
      ? [i + 1, c.committeeNumber, c.sheikhName || '-', place(c), c.competitionBook || '-', students(c), when(c) || '-',
          c.ceremonyDetails?.ceremonyPlace || '-', joinNames(c.ceremonyDetails?.attendingSheikhs)]
      : [i + 1, c.committeeNumber, c.sheikhName || '-', place(c), c.competitionBook || '-', students(c),
          calculateCurrentStage(c.stages).label, when(c) || 'لم يُحدد بعد', c.ceremonyDetails?.ceremonyPlace || '-']
  );
  const total = list.reduce((sum, c) => sum + students(c), 0);
  if (rows.length) rows.push(['', '', `الإجمالي: ${list.length} لجنة`, '', '', total, '', '', '']);
  return {
    count: list.length,
    filename: `Bukhari-${status === 'held' ? 'ceremony-held' : 'ceremony-not-held'}-${todayISO()}.pdf`,
    table: {
      title: `كشف «${CEREMONY_STATUS_LABEL[status]}» — مسابقات مسجد الإمام البخاري`,
      subtitle: `${courseName ? `${courseName} — ` : ''}${todayISO()} — ${list.length} لجنة — ${total} طالب`,
      columns,
      rows,
      totalRows: rows.length ? [rows.length - 1] : [],
    },
  };
}

/** The course sheet rows shown on screen, as a PDF table (same columns as the sheet). */
export function sheetRowsPdfTable(
  rows: { number: number; sheikh_name: string; place: string; book: string; students_count?: number; delivered: boolean; corrected: boolean; reviewed: boolean; announced: boolean; ceremony: boolean }[],
  filterLabel: string,
  courseName?: string
) {
  const mark = (v: boolean) => (v ? '✓' : '—');
  const total = rows.reduce((s, r) => s + (Number(r.students_count) || 0), 0);
  const body: (string | number)[][] = rows.map((r) => [
    r.number, r.sheikh_name || '-', r.place || '-', r.book || '-', r.students_count || 0,
    mark(r.delivered), mark(r.corrected), mark(r.reviewed), mark(r.announced), mark(r.ceremony),
  ]);
  if (body.length) body.push(['', `الإجمالي: ${rows.length} لجنة`, '', '', total, '', '', '', '', '']);
  return {
    count: rows.length,
    filename: `Bukhari-sheet-${todayISO()}.pdf`,
    table: {
      title: `كشف الدورة${filterLabel ? ` — ${filterLabel}` : ''} — مسابقات مسجد الإمام البخاري`,
      subtitle: `${courseName ? `${courseName} — ` : ''}${todayISO()} — ${rows.length} لجنة — ${total} طالب`,
      columns: ['م', 'اسم الشيخ', 'المكان', 'الكتاب المقرر', 'عدد الطلاب', 'تم الامتحان', 'تم التصحيح', 'تمت المراجعة', 'تم الإعلان', 'تم الحفل'],
      rows: body,
      totalRows: body.length ? [body.length - 1] : [],
    },
  };
}
