import zlib from 'zlib';
import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { committeeBody, seedCourse, setupApp, userWithToken, type TestApp } from '../helpers.ts';

// Exam papers: locked until shortly before the exam, stamped with who downloaded them.
let t: TestApp;
let sa: Awaited<ReturnType<typeof userWithToken>>;
let admin: Awaited<ReturnType<typeof userWithToken>>;
let head: Awaited<ReturnType<typeof userWithToken>>;
let paper: Buffer;
const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const binary = (res: any, cb: any) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const download = (id: string, auth: Record<string, string>, query = '') =>
  t.api().get(`/api/exams/${id}/file${query}`).set(auth).buffer(true).parse(binary);

async function exam(id: string, opensAt: string | null, file: Buffer = paper) {
  await t.api().post('/api/exams').set(sa.auth).send({ id, title: id, book: 'كتاب', opensAt });
  await t.api().put(`/api/exams/${id}/file`).set(sa.auth).set('Content-Type', 'application/pdf').send(file);
}

beforeAll(async () => {
  t = await setupApp();
  await seedCourse(t.pool);
  sa = await userWithToken(t, { role: 'super_admin' });
  admin = await userWithToken(t, { role: 'admin' });
  head = await userWithToken(t, { role: 'committee_head', allExams: true });
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]).drawText('Question 1', { x: 50, y: 780 });
  doc.addPage([595, 842]);
  paper = Buffer.from(await doc.save());
});
afterAll(async () => {
  await t.pool.end();
});

describe('locked until shortly before the exam', () => {
  it('3 days before (opens 24 h before): a committee head is refused with the opening time; admins download', async () => {
    await exam('exam-later', hours(72));
    const res = await t.api().get('/api/exams/exam-later/file').set(head.auth);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('exam_not_open_yet');
    expect(res.body.message).toMatch(/تُتاح/);
    expect((await download('exam-later', admin.auth)).status).toBe(200);
    expect((await download('exam-later', sa.auth)).status).toBe(200);
  });

  it('the locked exam is still listed for the head, with when it opens', async () => {
    const list = (await t.api().get('/api/exams').set(head.auth)).body.exams;
    const e = list.find((x: any) => x.id === 'exam-later');
    expect(e.canOpen).toBe(false);
    expect(new Date(e.lockedUntil).getTime()).toBeGreaterThan(Date.now() + 47 * 3_600_000);
  });

  it('within the window it opens; an exam without a time stays open as before', async () => {
    await exam('exam-soon', hours(10));
    expect((await download('exam-soon', head.auth)).status).toBe(200);
    await exam('exam-old', null);
    expect((await download('exam-old', head.auth)).status).toBe(200);
  });

  it('the window is a setting the admin changes', async () => {
    await exam('exam-window', hours(30));
    expect((await download('exam-window', head.auth)).status).toBe(403);
    expect((await t.api().put('/api/settings/exam_open_hours_before').set(admin.auth).send({ value: 48 })).status).toBe(200);
    expect((await download('exam-window', head.auth)).status).toBe(200);
    await t.api().put('/api/settings/exam_open_hours_before').set(admin.auth).send({ value: 24 });
  });
});

describe('who downloaded it is stamped on every page', () => {
  it('the downloaded copy carries the phone and time on each page; the stored original is untouched', async () => {
    await exam('exam-mark', null);
    const res = await download('exam-mark', head.auth);
    expect(res.status).toBe(200);
    const marked: Buffer = res.body;
    expect(marked.equals(paper)).toBe(false);
    const doc = await PDFDocument.load(marked);
    expect(doc.getPageCount()).toBe(2);
    // pdf-lib writes the text as hex inside compressed page streams: open every stream and count.
    const hexPhone = Buffer.from(head.phone, 'latin1').toString('hex').toUpperCase();
    const latin = marked.toString('latin1');
    let found = 0;
    for (const m of latin.matchAll(/stream\r?\n/g)) {
      const start = m.index! + m[0].length;
      const end = latin.indexOf('endstream', start);
      let text: string;
      try { text = zlib.inflateSync(marked.subarray(start, end)).toString('latin1'); } catch { text = latin.slice(start, end); }
      found += text.toUpperCase().split(hexPhone).length - 1;
    }
    expect(found).toBeGreaterThanOrEqual(4); // 2 lines on each of the 2 pages
    const { rows } = await t.pool.query("SELECT content FROM exam_files WHERE exam_id = 'exam-mark';");
    expect(Buffer.from(rows[0].content).equals(paper)).toBe(true);
  });

  it('a super admin can take the clean original; nobody else can', async () => {
    expect(((await download('exam-mark', sa.auth, '?clean=1')).body as Buffer).equals(paper)).toBe(true);
    expect(((await download('exam-mark', admin.auth, '?clean=1')).body as Buffer).equals(paper)).toBe(false);
  });

  it('a file that cannot be stamped is still served, and the record says so', async () => {
    await exam('exam-odd', null, Buffer.from('%PDF-1.4\n%%EOF'));
    expect((await download('exam-odd', head.auth)).status).toBe(200);
    const { rows } = await t.pool.query("SELECT after_data FROM audit_logs WHERE action = 'exam.file_download' AND entity_id = 'exam-odd';");
    expect(rows[0].after_data.watermarked).toBe(false);
  });
});

describe('committee exam date', () => {
  it('is saved, shown, cleared with null, and kept when an older app does not send it', async () => {
    const body = committeeBody({ committeeNumber: 5, examDate: '2026-12-01' });
    let c = (await t.api().post('/api/committees').set(sa.auth).send(body)).body.committee;
    expect(c.examDate).toBe('2026-12-01');
    const { examDate: _drop, ...older } = { ...body, committeeName: 'اسم جديد', expectedUpdatedAt: c.updatedAt } as any;
    c = (await t.api().post('/api/committees').set(sa.auth).send(older)).body.committee;
    expect(c.examDate).toBe('2026-12-01');
    c = (await t.api().post('/api/committees').set(sa.auth).send({ ...body, examDate: null, expectedUpdatedAt: c.updatedAt })).body.committee;
    expect(c.examDate).toBeUndefined();
  });
});

describe('settings', () => {
  it('everyone reads them; admins change them; only known keys and valid values', async () => {
    const sheikh = await userWithToken(t, { role: 'sheikh' });
    expect((await t.api().get('/api/settings').set(sheikh.auth)).body.settings).toMatchObject({ exam_open_hours_before: 24, overdue_days: 3, font_family: 'cairo', observers: [] });
    expect((await t.api().put('/api/settings/overdue_days').set(head.auth).send({ value: 5 })).status).toBe(403);
    expect((await t.api().put('/api/settings/overdue_days').set(admin.auth).send({ value: 0 })).status).toBe(400);
    expect((await t.api().put('/api/settings/whatever').set(admin.auth).send({ value: 1 })).status).toBe(400);
    expect((await t.api().put('/api/settings/font_family').set(admin.auth).send({ value: 'comic' })).status).toBe(400);
    expect((await t.api().put('/api/settings/font_family').set(admin.auth).send({ value: 'tajawal' })).status).toBe(200);
  });
});
