/**
 * Generates a realistic sample image of a handwritten table for the summer course
 * so the user can test Gemini Vision OCR immediately even without taking a photo.
 */
export function generateSampleHandwrittenTableImage(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 780;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background: off-white paper with subtle ruled lines
  ctx.fillStyle = '#fbfbf7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Ruled horizontal lines like notebook paper
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  for (let y = 80; y < canvas.height - 40; y += 45) {
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(canvas.width - 30, y);
    ctx.stroke();
  }

  // Margin vertical line (red margin)
  ctx.strokeStyle = '#fca5a5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(canvas.width - 60, 20);
  ctx.lineTo(canvas.width - 60, canvas.height - 20);
  ctx.stroke();

  // Header Title
  ctx.direction = 'rtl';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 26px "Cairo", sans-serif';
  ctx.fillText('مسجد الإمام البخاري - كشف متابعة الدورة العلمية الصيفية 1448هـ / 2026م', canvas.width - 80, 55);

  // Table grid coordinates
  const startX = canvas.width - 80;
  const tableWidth = canvas.width - 160;
  const startY = 100;
  const rowHeight = 55;

  // Columns definition (RTL): [م, اسم الشيخ, المكان, الكتاب, التسليم, التصحيح, المراجعة, الإعلان, الحفل]
  const colWidths = [45, 230, 180, 200, 80, 80, 80, 80, 80];

  // Draw Table Header
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(80, startY, tableWidth, rowHeight);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.strokeRect(80, startY, tableWidth, rowHeight);

  // Vertical header borders and titles
  const headers = [
    'م',
    'اسم الشيخ',
    'المكان',
    'الكتاب',
    'التسليم',
    'التصحيح',
    'المراجعة',
    'الإعلان',
    'الحفل',
  ];

  let currentX = startX;
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 15px "Cairo", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < headers.length; i++) {
    const w = colWidths[i];
    const cellCenterX = currentX - w / 2;
    ctx.fillText(headers[i], cellCenterX, startY + rowHeight / 2);

    ctx.beginPath();
    ctx.moveTo(currentX - w, startY);
    ctx.lineTo(currentX - w, startY + rowHeight);
    ctx.stroke();

    currentX -= w;
  }

  // Rows data to draw in handwritten style
  const sampleRows = [
    {
      num: '1',
      sheikh: 'الشيخ عبد الله بن سعد الغامدي',
      place: 'مصلى الفجر الرئيسي',
      book: 'ثلاثة الأصول وأدلتها',
      checks: [true, true, true, true, true],
      struck: false,
      uncertain: false,
    },
    {
      num: '2',
      sheikh: 'الشيخ د. إبراهيم بن منصور العلي',
      place: 'القاعة الكبرى (أ)',
      book: 'كتاب التوحيد',
      checks: [true, true, true, false, false],
      struck: false,
      uncertain: false,
    },
    {
      num: '3',
      sheikh: 'الشيخ فيصل بن حمد الدوسري',
      place: 'الرواق الشرقي بالمسجد',
      book: 'العقيدة الواسطية',
      checks: [true, true, false, false, false],
      struck: false,
      uncertain: false,
    },
    {
      num: '4',
      sheikh: 'الشيخ عثمان بن صالح المصري',
      place: 'دار الحديث',
      book: 'الأربعين النووية',
      checks: [true, false, false, false, false],
      struck: false,
      uncertain: true,
    },
    {
      num: '5',
      sheikh: 'الشيخ حسن بن علي القحطاني',
      place: 'قاعة عثمان بن عفان',
      book: 'عمدة الأحكام',
      checks: [false, false, false, false, false],
      struck: false,
      uncertain: false,
    },
    {
      num: '6',
      sheikh: 'الشيخ سليمان بن يحيى النجدي',
      place: 'المصلى العلوي (ملغى)',
      book: 'المنظومة البيقونية',
      checks: [true, true, true, true, true],
      struck: true,
      uncertain: false,
    },
    {
      num: '7',
      sheikh: 'الشيخ طارق بن زياد التميمي',
      place: 'مكتبة المسجد',
      book: 'الآجرومية في النحو',
      checks: [true, true, true, true, false],
      struck: false,
      uncertain: false,
    },
  ];

  // Draw rows with blue ink look
  sampleRows.forEach((row, rowIndex) => {
    const y = startY + rowHeight * (rowIndex + 1);

    // Row border
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(80, y, tableWidth, rowHeight);

    let rowX = startX;

    for (let c = 0; c < colWidths.length; c++) {
      const w = colWidths[c];

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(rowX - w, y);
      ctx.lineTo(rowX - w, y + rowHeight);
      ctx.stroke();

      const centerX = rowX - w / 2;
      const centerY = y + rowHeight / 2;

      ctx.fillStyle = '#1e3a8a'; // Blue ink style
      ctx.font = '16px "Cairo", cursive, sans-serif';

      if (c === 0) {
        ctx.textAlign = 'center';
        ctx.fillText(row.num, centerX, centerY);
      } else if (c === 1) {
        ctx.textAlign = 'right';
        ctx.fillText(row.sheikh, rowX - 12, centerY);
      } else if (c === 2) {
        ctx.textAlign = 'right';
        ctx.fillText(row.place, rowX - 12, centerY);
      } else if (c === 3) {
        ctx.textAlign = 'right';
        ctx.fillText(row.book, rowX - 12, centerY);
      } else {
        // Checkboxes columns (c: 4 -> 8)
        const checkIdx = c - 4;
        const isChecked = row.checks[checkIdx];

        if (isChecked) {
          // Draw a natural handwritten checkmark
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(centerX - 10, centerY);
          ctx.lineTo(centerX - 3, centerY + 8);
          ctx.lineTo(centerX + 12, centerY - 10);
          ctx.stroke();
        }
      }

      rowX -= w;
    }

    // If row is struck out, draw a prominent horizontal line across the entire row
    if (row.struck) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(85, y + rowHeight / 2);
      ctx.lineTo(startX - 5, y + rowHeight / 2);
      ctx.stroke();
    }
  });

  // Footer notes in margin
  ctx.fillStyle = '#64748b';
  ctx.font = 'italic 14px "Cairo", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('* ملحوظة: الصف 6 تم شطبه وتحويل الطلاب للمجموعة رقم 1.', canvas.width - 80, canvas.height - 35);

  return canvas.toDataURL('image/jpeg', 0.92);
}
