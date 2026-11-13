/**
 * Small PDF maker with no dependencies: each page is laid out as HTML by the browser (so Arabic
 * shapes and runs right-to-left correctly), drawn into a canvas, and placed in the PDF as a JPEG.
 */

/** A4 landscape in CSS pixels (96 dpi) and in PDF points. */
const PAGE_PX = { w: 1123, h: 794 };
const PAGE_PT = { w: 842, h: 595 };
const SCALE = 2;
/** System fonts only: a page drawn through an SVG image cannot use the web app's own fonts. */
const FONT_STACK = "Tahoma, 'Segoe UI', 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Geeza Pro', Arial, sans-serif";

export interface PdfTable {
  title: string;
  subtitle: string;
  columns: string[];
  rows: (string | number)[][];
  /** Rows styled as a total (bold, shaded), by index. */
  totalRows?: number[];
}

const PAGE_CSS = `
.pdf-page{box-sizing:border-box;width:${PAGE_PX.w}px;padding:28px 30px;background:#fff;color:#0f172a;direction:rtl;font-family:${FONT_STACK};}
.pdf-page h1{font-size:20px;text-align:center;margin:0 0 4px;color:#064e3b}
.pdf-page p.sub{text-align:center;margin:0 0 14px;font-size:12px;color:#475569}
.pdf-page table{width:100%;border-collapse:collapse;font-size:11.5px;table-layout:auto}
.pdf-page th,.pdf-page td{border:1px solid #94a3b8;padding:5px 6px;text-align:right;vertical-align:top;word-break:break-word}
.pdf-page th{background:#d1fae5;color:#064e3b;font-weight:bold}
.pdf-page tr.total td{font-weight:bold;background:#f1f5f9}
.pdf-page p.foot{margin:10px 0 0;font-size:10px;color:#64748b;text-align:center}
`;

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

function pageHtml(t: PdfTable, rowIdx: number[], pageNo: number, pages: number) {
  const head = `<tr>${t.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;
  const body = rowIdx
    .map((i) => `<tr${t.totalRows?.includes(i) ? ' class="total"' : ''}>${t.rows[i].map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`)
    .join('');
  return `<h1>${esc(t.title)}</h1><p class="sub">${esc(t.subtitle)}</p><table><thead>${head}</thead><tbody>${body}</tbody></table>` +
    `<p class="foot">صفحة ${pageNo} من ${pages}</p>`;
}

function makePage(html: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'pdf-page';
  el.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  el.innerHTML = html;
  return el;
}

/** Splits the rows into pages so every page fits on A4, measured in a hidden copy of the layout. */
function paginate(t: PdfTable, host: HTMLElement): number[][] {
  const probe = makePage(pageHtml(t, t.rows.map((_, i) => i), 1, 1));
  host.appendChild(probe);
  const table = probe.querySelector('table')!;
  const fixed = probe.scrollHeight - table.offsetHeight + (table.tHead?.offsetHeight ?? 0) + 4;
  const limit = PAGE_PX.h - fixed;
  const bodyRows = Array.from(table.tBodies[0]?.rows ?? []);
  const pages: number[][] = [];
  let current: number[] = [];
  let used = 0;
  bodyRows.forEach((tr, i) => {
    const h = tr.offsetHeight;
    if (current.length > 0 && used + h > limit) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(i);
    used += h;
  });
  if (current.length > 0 || pages.length === 0) pages.push(current);
  probe.remove();
  return pages;
}

async function renderPage(el: HTMLDivElement, host: HTMLElement): Promise<{ jpeg: Uint8Array; w: number; h: number }> {
  host.appendChild(el);
  const height = Math.max(PAGE_PX.h, el.scrollHeight);
  const xhtml = new XMLSerializer().serializeToString(el);
  el.remove();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_PX.w}" height="${height}">` +
    `<foreignObject width="100%" height="100%"><style xmlns="http://www.w3.org/1999/xhtml">${PAGE_CSS}</style>${xhtml}</foreignObject></svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_PX.w * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(SCALE, SCALE);
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('تعذر إنشاء صفحة PDF'))), 'image/jpeg', 0.92)
  );
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height };
}

/** Writes JPEG pages into a PDF file (each image fitted onto an A4 landscape page). */
export function jpegPagesToPdf(pages: { jpeg: Uint8Array; w: number; h: number }[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (p: string | Uint8Array) => {
    const bytes = typeof p === 'string' ? enc.encode(p) : p;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, body: () => void) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    body();
    push('\nendobj\n');
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const pageObj = (i: number) => 3 + i * 3;
  object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () => push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>`));
  pages.forEach((p, i) => {
    const n = pageObj(i);
    const scale = Math.min(PAGE_PT.w / p.w, PAGE_PT.h / p.h);
    const dw = +(p.w * scale).toFixed(2);
    const dh = +(p.h * scale).toFixed(2);
    const x = +((PAGE_PT.w - dw) / 2).toFixed(2);
    const y = +(PAGE_PT.h - dh).toFixed(2); // top-aligned
    const content = `q ${dw} 0 0 ${dh} ${x} ${y} cm /Im0 Do Q`;
    object(n, () =>
      push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_PT.w} ${PAGE_PT.h}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`)
    );
    object(n + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    object(n + 2, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      push('\nendstream');
    });
  });
  const count = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

/** Lays the table out on as many A4 landscape pages as it needs and returns the PDF file. */
export async function tableToPdf(t: PdfTable): Promise<Blob> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;top:0;left:-20000px;width:auto;pointer-events:none;opacity:0';
  const style = document.createElement('style');
  style.textContent = PAGE_CSS;
  host.appendChild(style);
  document.body.appendChild(host);
  try {
    const groups = paginate(t, host);
    const rendered = [];
    for (let i = 0; i < groups.length; i++) {
      rendered.push(await renderPage(makePage(pageHtml(t, groups[i], i + 1, groups.length)), host));
    }
    return jpegPagesToPdf(rendered);
  } finally {
    host.remove();
  }
}

/** Saves the file to the device (the browser's downloads). */
export function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Opens the phone's share sheet (WhatsApp, Telegram, email...) with the file attached.
 * Returns 'shared', 'cancelled', or 'unsupported' when this browser cannot share files.
 */
export async function shareFile(blob: Blob, filename: string, title: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share || !nav.canShare?.({ files: [file] })) return 'unsupported';
  try {
    await nav.share({ files: [file], title, text: title });
    return 'shared';
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
    throw err;
  }
}

/**
 * Builds the PDF and either saves it on the device («تصدير») or opens the share sheet («مشاركة»;
 * saved instead when this browser cannot share files).
 */
export async function deliverPdf(table: PdfTable, filename: string, mode: 'export' | 'share'): Promise<'downloaded' | 'shared' | 'cancelled' | 'fallback'> {
  const blob = await tableToPdf(table);
  if (mode === 'export') {
    downloadFile(blob, filename);
    return 'downloaded';
  }
  const result = await shareFile(blob, filename, table.title);
  if (result === 'unsupported') {
    downloadFile(blob, filename);
    return 'fallback';
  }
  return result;
}
