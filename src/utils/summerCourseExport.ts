import { csvCell } from './csv';
import { todayISO } from './stageUtils';
import * as XLSX from 'xlsx';
import { SummerCourseRow } from '../types/summerCourse';

export function exportCourseRowsToExcel(rows: SummerCourseRow[], filename = `متابعة_كشف_الدورة_${todayISO()}`) {
  const data = rows.map((r) => ({
    'م': r.number,
    'اسم الشيخ': r.sheikh_name || '',
    'المكان': r.place || '',
    'الكتاب': r.book || '',
    'عدد الطلاب': r.students_count || 0,
    'تم الامتحان': r.delivered ? 'نعم ✓' : 'لا ✗',
    'تم التصحيح': r.corrected ? 'نعم ✓' : 'لا ✗',
    'تم المراجعة': r.reviewed ? 'نعم ✓' : 'لا ✗',
    'تم الإعلان': r.announced ? 'نعم ✓' : 'لا ✗',
    'تم الحفل': r.ceremony ? 'نعم ✓' : 'لا ✗',
    'مشطوب': r.struck_out ? 'نعم (ملغي)' : '-',
    'يحتاج تدقيق': r.uncertain ? 'نعم (غير مؤكد)' : '-',
    'ملاحظات': r.notes || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);


  // Auto-size columns nicely
  worksheet['!cols'] = [
    { wch: 6 },  // م
    { wch: 25 }, // اسم الشيخ
    { wch: 22 }, // المكان
    { wch: 26 }, // الكتاب
    { wch: 12 }, // عدد الطلاب
    { wch: 14 }, // تم الامتحان
    { wch: 13 }, // التصحيح
    { wch: 13 }, // المراجعة
    { wch: 13 }, // الإعلان
    { wch: 13 }, // الحفل
    { wch: 12 }, // مشطوب
    { wch: 14 }, // يحتاج تدقيق
    { wch: 20 }, // ملاحظات
  ];

  const workbook = XLSX.utils.book_new();
  // Right-to-left comes from the workbook view; SheetJS ignores a sheet-level '!views'.
  workbook.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(workbook, worksheet, 'كشف الدورة العلمية');

  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportCourseRowsToCSV(rows: SummerCourseRow[], filename = `متابعة_كشف_الدورة_${todayISO()}`) {
  const headers = [
    'م',
    'اسم الشيخ',
    'المكان',
    'الكتاب',
    'عدد الطلاب',
    'تم الامتحان',
    'تم التصحيح',
    'تم المراجعة',
    'تم الإعلان',
    'تم الحفل',
    'مشطوب',
    'يحتاج تدقيق',
    'ملاحظات',
  ];

  const escapeCSV = csvCell;

  const csvRows = [
    headers.map(escapeCSV).join(','),
    ...rows.map((r) =>
      [
        r.number,
        r.sheikh_name || '',
        r.place || '',
        r.book || '',
        r.students_count || 0,
        r.delivered ? 'نعم ✓' : 'لا',
        r.corrected ? 'نعم ✓' : 'لا',
        r.reviewed ? 'نعم ✓' : 'لا',
        r.announced ? 'نعم ✓' : 'لا',
        r.ceremony ? 'نعم ✓' : 'لا',
        r.struck_out ? 'نعم' : 'لا',
        r.uncertain ? 'نعم' : 'لا',
        r.notes || '',
      ]
        .map(escapeCSV)
        .join(',')
    ),
  ];

  // Prepend UTF-8 BOM (\uFEFF) to guarantee Arabic text renders accurately in MS Excel
  const blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });

  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function parseCourseRowsFromFile(file: File): Promise<Omit<SummerCourseRow, 'id'>[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  return rawRows.map((row, index) => {
    // Find matching keys flexibly
    const getVal = (possibleKeys: string[]) => {
      for (const k of possibleKeys) {
        if (row[k] !== undefined && row[k] !== '') return String(row[k]).trim();
      }
      return '';
    };

    const isTrue = (val: string) => {
      const lower = val.toLowerCase();
      return (
        lower === 'true' ||
        lower === '1' ||
        lower.includes('نعم') ||
        lower.includes('✓') ||
        lower.includes('صح') ||
        lower === 'yes'
      );
    };

    const numStr = getVal(['م', 'الرقم', 'رقم', 'number', 'id']);
    const parsedNum = parseInt(numStr);

    const sheikh = getVal(['اسم الشيخ', 'الشيخ', 'المحاضر', 'sheikh_name', 'sheikh']);
    const place = getVal(['المكان', 'المسجد', 'القاعة', 'place', 'location']);
    const book = getVal(['الكتاب', 'المتن', 'الكتاب المقرر', 'المقرر', 'book']);
    const studentsStr = getVal(['عدد الطلاب', 'الطلاب', 'عدد الطلبة', 'الطلبة', 'students_count', 'students', 'studentsCount']);
    const parsedStudents = parseInt(studentsStr, 10);

    const deliveredStr = getVal(['تم الامتحان', 'الامتحان', 'التسليم للمقر', 'التسليم', 'تم التسليم', 'delivered']);
    const correctedStr = getVal(['تم التصحيح', 'التصحيح', 'مصحح', 'corrected']);
    const reviewedStr = getVal(['تم المراجعة', 'المراجعة', 'مراجعة', 'reviewed']);
    const announcedStr = getVal(['تم الإعلان', 'الإعلان', 'إعلان', 'announced']);
    const ceremonyStr = getVal(['تم الحفل', 'الحفل', 'حفل', 'ceremony']);
    const struckStr = getVal(['مشطوب', 'ملغي', 'struck_out', 'struck']);
    const uncertainStr = getVal(['يحتاج تدقيق', 'غير مؤكد', 'uncertain']);
    const notesStr = getVal(['ملاحظات', 'ملاحظة', 'notes']);

    return {
      number: !isNaN(parsedNum) && parsedNum > 0 ? parsedNum : index + 1,
      sheikh_name: sheikh || `الشيخ ${index + 1}`,
      place: place || '',
      book: book || '',
      students_count: !isNaN(parsedStudents) && parsedStudents >= 0 ? parsedStudents : 0,
      delivered: isTrue(deliveredStr),
      corrected: isTrue(correctedStr),
      reviewed: isTrue(reviewedStr),
      announced: isTrue(announcedStr),
      ceremony: isTrue(ceremonyStr),
      struck_out: isTrue(struckStr),
      uncertain: isTrue(uncertainStr),
      notes: notesStr,
    };
  });
}

