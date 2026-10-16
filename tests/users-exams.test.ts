import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, login, setupApp, userWithToken, type TestApp } from './helpers.ts';

let t: TestApp;
let admin: Awaited<ReturnType<typeof userWithToken>>;
beforeAll(async () => {
  t = await setupApp();
  admin = await userWithToken(t, { role: 'super_admin' });
});
afterAll(async () => {
  await t.pool.end();
});

describe('users', () => {
  it('a user editing themself cannot change their role, status, permissions or committees', async () => {
    const asst = await userWithToken(t, { role: 'assistant', assigned: [1] });
    const res = await t.api().post('/api/users').set(asst.auth)
      .send({ id: asst.id, name: 'جديد', phone: asst.phone, role: 'super_admin', permissions: ['manage_assistants'] });
    expect(res.status).toBe(403);
    const ok = await t.api().post('/api/users').set(asst.auth).send({ id: asst.id, name: 'اسم جديد', phone: asst.phone });
    expect(ok.status).toBe(200);
    const { rows } = await t.pool.query('SELECT name, role FROM app_users WHERE id = $1;', [asst.id]);
    expect(rows[0]).toEqual({ name: 'اسم جديد', role: 'assistant' });
  });

  it('managers who are not super admins cannot grant roles or permissions', async () => {
    const head = await userWithToken(t, { role: 'committee_head', permissions: ['manage_assistants'] });
    const res = await t.api().post('/api/users').set(head.auth)
      .send({ id: 'usr_new1', name: 'معاون', phone: '0512340001', password: 'Initial123', role: 'committee_head' });
    expect(res.status).toBe(403);
    const plain = await t.api().post('/api/users').set(head.auth)
      .send({ id: 'usr_new2', name: 'معاون', phone: '0512340002', password: 'Initial123' });
    expect(plain.status).toBe(200);
  });

  it('new accounts need an initial password; rejection keeps the account', async () => {
    const noPass = await t.api().post('/api/users').set(admin.auth).send({ id: 'usr_np', name: 'بدون', phone: '0512340003' });
    expect(noPass.status).toBe(400);
    const create = await t.api().post('/api/users').set(admin.auth)
      .send({ id: 'usr_rej', name: 'مرفوض', phone: '0512340004', password: 'Initial123', status: 'pending' });
    expect(create.status).toBe(200);
    const reject = await t.api().post('/api/users').set(admin.auth)
      .send({ id: 'usr_rej', name: 'مرفوض', phone: '0512340004', status: 'rejected', rejectionReason: 'العدد مكتمل' });
    expect(reject.status).toBe(200);
    expect(reject.body.user.status).toBe('rejected');
    expect(reject.body.user.rejectedBy).toBeTruthy();
  });

  it('a super admin cannot demote themself, and the last super admin cannot be deleted', async () => {
    const demote = await t.api().post('/api/users').set(admin.auth)
      .send({ id: admin.id, name: 'admin', phone: admin.phone, role: 'assistant' });
    expect(demote.status).toBe(403);
    const { rows } = await t.pool.query('SELECT role FROM app_users WHERE id = $1;', [admin.id]);
    expect(rows[0].role).toBe('super_admin');
  });

  it('identity documents are hidden from managers who are not super admins', async () => {
    await t.pool.query("UPDATE app_users SET passport_number = 'P123' WHERE id = $1;", [admin.id]);
    const head = await userWithToken(t, { role: 'committee_head', permissions: ['manage_assistants'] });
    const list = await t.api().get('/api/users').set(head.auth);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain('P123');
    expect(JSON.stringify(list.body)).not.toContain('password');
  });

  it('a role change signs the user out everywhere', async () => {
    const u = await userWithToken(t, { role: 'assistant' });
    await t.api().post('/api/users').set(admin.auth).send({ id: u.id, name: 'x', phone: u.phone, role: 'teacher' });
    expect((await t.api().get('/api/tasks').set(u.auth)).status).toBe(401);
    await login(t, u.phone, PASSWORD);
  });
});

describe('exam files', () => {
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2048, 1)]);

  it('uploads a PDF and serves it only to super admins and committee heads', async () => {
    const head = await userWithToken(t, { role: 'committee_head', permissions: ['exams_pdf'] });
    const create = await t.api().post('/api/exams').set(head.auth).send({ id: 'exam-a', title: 'امتحان', book: 'كتاب' });
    expect(create.status).toBe(200);
    const up = await t.api().put('/api/exams/exam-a/file').set(head.auth)
      .set('Content-Type', 'application/pdf').set('X-File-Name', encodeURIComponent('أسئلة.pdf')).send(pdf);
    expect(up.status).toBe(200);

    const list = await t.api().get('/api/exams').set(head.auth);
    const exam = list.body.exams.find((e: any) => e.id === 'exam-a');
    expect(exam.hasFile).toBe(true);
    expect(exam.pdfDataUrl).toBeUndefined();

    const teacher = await userWithToken(t, { role: 'teacher', permissions: ['exams_pdf'] });
    expect((await t.api().get('/api/exams/exam-a/file').set(teacher.auth)).status).toBe(403);
    const file = await t.api().get('/api/exams/exam-a/file').set(head.auth).buffer(true);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
  });

  it('rejects files that are not PDFs', async () => {
    const res = await t.api().put('/api/exams/exam-a/file').set(admin.auth).set('Content-Type', 'application/pdf').send(Buffer.from('hello'));
    expect(res.status).toBe(400);
  });
});

describe('shared settings', () => {
  it('books and permission profiles are stored on the server', async () => {
    expect((await t.api().post('/api/books').set(admin.auth).send({ id: 'b1', name: 'كتاب التوحيد' })).status).toBe(200);
    const asst = await userWithToken(t, { role: 'assistant' });
    const books = await t.api().get('/api/books').set(asst.auth);
    expect(books.body.books.map((b: any) => b.name)).toContain('كتاب التوحيد');
    expect((await t.api().post('/api/books').set(asst.auth).send({ id: 'b2', name: 'x' })).status).toBe(403);

    const profile = await t.api().post('/api/permission-profiles').set(admin.auth)
      .send({ id: 'p1', name: 'معاون', permissions: ['calendar_schedule'], allowedTabs: ['calendar'] });
    expect(profile.status).toBe(200);
  });

  it('notification read state is per user', async () => {
    await t.api().post('/api/notifications').set(admin.auth).send({ title: 'تنبيه', description: 'نص' });
    const a = await userWithToken(t, { role: 'assistant' });
    const b = await userWithToken(t, { role: 'assistant' });
    const listA = await t.api().get('/api/notifications').set(a.auth);
    const n = listA.body.notifications[0];
    await t.api().patch(`/api/notifications/${n.id}/read`).set(a.auth);
    expect((await t.api().get('/api/notifications').set(a.auth)).body.notifications[0].read).toBe(true);
    expect((await t.api().get('/api/notifications').set(b.auth)).body.notifications[0].read).toBe(false);
  });
});

describe('user conflict protection', () => {
  it('rejects an edit based on an outdated user version (409)', async () => {
    const u = await userWithToken(t, { role: 'assistant', name: 'قديم' });
    const { rows } = await t.pool.query('SELECT updated_at FROM app_users WHERE id = $1;', [u.id]);
    const seen = new Date(rows[0].updated_at).toISOString();
    await t.api().post('/api/users').set(admin.auth).send({ id: u.id, name: 'جديد', phone: u.phone, expectedUpdatedAt: seen });
    const stale = await t.api().post('/api/users').set(admin.auth).send({ id: u.id, name: 'تعديل متأخر', phone: u.phone, expectedUpdatedAt: seen });
    expect(stale.status).toBe(409);
    const after = await t.pool.query('SELECT name FROM app_users WHERE id = $1;', [u.id]);
    expect(after.rows[0].name).toBe('جديد');
  });
});
