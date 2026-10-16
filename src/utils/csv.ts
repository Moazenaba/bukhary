/**
 * One CSV cell: quotes escaped, and text a spreadsheet would run as a formula (= + - @, tab, CR)
 * prefixed with an apostrophe (WEB-15). Sheet data can come from OCR of photographed papers, so
 * it is not trusted.
 */
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (text.length > 0 && /^[=+\-@\t\r]/.test(text) && !/^[+-]?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export const csvLine = (values: unknown[]) => values.map(csvCell).join(',');
