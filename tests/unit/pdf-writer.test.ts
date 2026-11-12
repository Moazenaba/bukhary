import { describe, expect, it } from 'vitest';
import { jpegPagesToPdf } from '../../src/utils/pdf';

// A tiny but valid JPEG header is enough: the writer copies the bytes into the image object.
const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);

async function text(blob: Blob) {
  return Buffer.from(await blob.arrayBuffer()).toString('latin1');
}

describe('PDF file structure', () => {
  it('has a header, one page object per page, and ends with %%EOF', async () => {
    const pdf = await text(jpegPagesToPdf([{ jpeg: fakeJpeg, w: 100, h: 50 }, { jpeg: fakeJpeg, w: 100, h: 200 }]));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('/Type /Pages /Count 2');
    expect(pdf.match(/\/Type \/Page /g)).toHaveLength(2);
    expect(pdf.match(/\/Filter \/DCTDecode/g)).toHaveLength(2);
  });

  it('every xref offset points exactly at its object (readers rely on it)', async () => {
    const pdf = await text(jpegPagesToPdf([{ jpeg: fakeJpeg, w: 10, h: 10 }, { jpeg: fakeJpeg, w: 10, h: 10 }, { jpeg: fakeJpeg, w: 10, h: 10 }]));
    const startxref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe('xref');
    const entries = pdf.slice(startxref).split('\n').slice(3).filter((l) => / n $/.test(l));
    entries.forEach((line, i) => {
      const offset = Number(line.slice(0, 10));
      expect(pdf.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });

  it('each stream /Length matches the bytes actually written', async () => {
    const pdf = await text(jpegPagesToPdf([{ jpeg: fakeJpeg, w: 100, h: 50 }]));
    for (const m of pdf.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
      const start = m.index! + m[0].length;
      expect(pdf.slice(start + Number(m[1]), start + Number(m[1]) + '\nendstream'.length)).toBe('\nendstream');
    }
  });

  it('images fit inside the A4 landscape page, whatever their shape', async () => {
    for (const [w, h] of [[10, 1000], [1000, 10], [842, 595]]) {
      const pdf = await text(jpegPagesToPdf([{ jpeg: fakeJpeg, w, h }]));
      const [, dw, dh, x, y] = /q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/.exec(pdf)!.map(Number);
      expect(dw).toBeLessThanOrEqual(842.01);
      expect(dh).toBeLessThanOrEqual(595.01);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
    }
  });
});
