import * as XLSX from 'xlsx';
import { CourseTableRow } from '../types/table';

export function exportToExcel(rows: CourseTableRow[], filename = 'متابعة_الدورة_العلمية_مسجد_البخاري_1448هـ.xlsx') {
  const data = rows.map((r) => ({
    'م': r.number,
    'اسم الشيخ': r.sheikh_name,
    'المكان': r.place,
    'الكتاب': r.book,
    'التسليم للمقر': r.delivered ? 'تم ✓' : 'لم يتم ✕',
    'تم التصحيح': r.corrected ? 'تم ✓' : 'لم يتم ✕',
    'تم المراجعة': r.reviewed ? 'تم ✓' : 'لم يتم ✕',
    'تم الإعلان': r.announced ? 'تم ✓' : 'لم يتم ✕',
    'تم الحفل': r.ceremony ? 'تم ✓' : 'لم يتم ✕',
    'حالة الصف': r.struck_out ? 'مشطوب (ملغى)' : 'نشط',
    'شك في القراءة': r.uncertain ? 'نعم (يحتاج تدقيق)' : 'واضح',
    'الملاحظات': r.notes || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);

  // Set RTL orientation for the Excel sheet
  if (!worksheet['!views']) {
    worksheet['!views'] = [];
  }
  worksheet['!views'].push({ RTL: true });

  // Auto-fit column widths
  worksheet['!cols'] = [
    { wch: 6 }, // م
    { wch: 30 }, // اسم الشيخ
    { wch: 22 }, // المكان
    { wch: 26 }, // الكتاب
    { wch: 14 }, // التسليم للمقر
    { wch: 14 }, // تم التصحيح
    { wch: 14 }, // تم المراجعة
    { wch: 14 }, // تم الإعلان
    { wch: 14 }, // تم الحفل
    { wch: 15 }, // حالة الصف
    { wch: 16 }, // شك في القراءة
    { wch: 32 }, // الملاحظات
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'الدورة العلمية الصيفية');
  XLSX.writeFile(workbook, filename);
}

export function exportToCSV(rows: CourseTableRow[], filename = 'متابعة_الدورة_العلمية_مسجد_البخاري_1448هـ.csv') {
  const headers = [
    'م',
    'اسم الشيخ',
    'المكان',
    'الكتاب',
    'التسليم للمقر',
    'تم التصحيح',
    'تم المراجعة',
    'تم الإعلان',
    'تم الحفل',
    'حالة الصف',
    'شك في القراءة',
    'الملاحظات',
  ];

  const csvRows = [
    headers.join(','),
    ...rows.map((r) =>
      [
        `"${r.number || ''}"`,
        `"${(r.sheikh_name || '').replace(/"/g, '""')}"`,
        `"${(r.place || '').replace(/"/g, '""')}"`,
        `"${(r.book || '').replace(/"/g, '""')}"`,
        `"${r.delivered ? 'تم' : 'لم يتم'}"`,
        `"${r.corrected ? 'تم' : 'لم يتم'}"`,
        `"${r.reviewed ? 'تم' : 'لم يتم'}"`,
        `"${r.announced ? 'تم' : 'لم يتم'}"`,
        `"${r.ceremony ? 'تم' : 'لم يتم'}"`,
        `"${r.struck_out ? 'مشطوب' : 'نشط'}"`,
        `"${r.uncertain ? 'يحتاج مراجعة' : 'واضح'}"`,
        `"${(r.notes || '').replace(/"/g, '""')}"`,
      ].join(',')
    ),
  ];

  // Prepend UTF-8 BOM (\uFEFF) so Excel and all systems open Arabic text flawlessly
  const csvContent = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
