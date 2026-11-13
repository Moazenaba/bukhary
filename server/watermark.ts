import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

/**
 * Stamps who downloaded an exam paper on every page: their phone number, a short account id and
 * the time (Cairo). Latin letters and digits only, so the standard PDF font prints them exactly,
 * whatever the language of the paper. The stored original is never changed.
 * Returns null when the file cannot be stamped (an unusual or damaged PDF); the caller then sends
 * it as it is and records that it was not stamped.
 */
export async function watermarkPdf(original: Buffer, who: { phone: string; userId: string; at: Date }): Promise<Buffer | null> {
  try {
    const doc = await PDFDocument.load(original, { ignoreEncryption: true, updateMetadata: false });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const when = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(who.at);
    const ascii = (s: string) => s.replace(/[^\x20-\x7E]/g, '');
    const id = ascii(who.userId).replace(/^usr_/, '').slice(0, 8);
    const line = ascii(`${who.phone} | ${id} | ${when} Cairo`);
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      // Large, faint, diagonal across the page: hard to crop out, does not hide the questions.
      const size = Math.max(14, Math.min(width, height) / 22);
      const textWidth = font.widthOfTextAtSize(line, size);
      page.drawText(line, {
        x: width / 2 - (textWidth / 2) * Math.cos(Math.PI / 6),
        y: height / 2 - (textWidth / 2) * Math.sin(Math.PI / 6),
        size,
        font,
        color: rgb(0.55, 0.55, 0.55),
        opacity: 0.18,
        rotate: degrees(30),
      });
      // Small and readable at the bottom of every page.
      page.drawText(line, { x: 18, y: 10, size: 7, font, color: rgb(0.35, 0.35, 0.35), opacity: 0.8 });
    }
    return Buffer.from(await doc.save());
  } catch {
    return null;
  }
}
