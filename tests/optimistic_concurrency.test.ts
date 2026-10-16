import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app, pool } from '../server';

describe('التعارض التفاؤلي (Optimistic Concurrency 409) للامتحانات والمهام واللجان', () => {
  let querySpy: any;

  beforeEach(() => {
    if (pool) {
      querySpy = vi.spyOn(pool, 'query');
    }
  });

  afterEach(() => {
    if (querySpy) {
      querySpy.mockRestore();
    }
  });

  describe('1. تعارض بنك الامتحانات (POST /api/exams)', () => {
    it('يرجع 409 Conflict عندما تكون expectedUpdatedAt أقدم من updated_at الحالية في قاعدة البيانات', async () => {
      const nowInDb = new Date('2026-10-16T12:00:00Z');
      const olderExpected = new Date('2026-10-16T11:00:00Z').toISOString();

      if (pool) {
        querySpy.mockImplementation(async (sql: string) => {
          if (sql.includes('SELECT updated_at, data FROM exams')) {
            return {
              rows: [
                {
                  updated_at: nowInDb.toISOString(),
                  data: { id: 'exam-1', title: 'نسخة قاعدة البيانات' },
                },
              ],
            };
          }
          return { rows: [] };
        });
      }

      const res = await request(app)
        .post('/api/exams')
        .set('x-user-role', 'super_admin')
        .send({
          id: 'exam-1',
          title: 'تعديل متزامن',
          book: 'الأصول الثلاثة',
          expectedUpdatedAt: olderExpected,
        });

      if (pool) {
        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBe('conflict');
        expect(res.body.message).toContain('تم تعديل هذا الامتحان بواسطة مستخدم آخر');
      }
    });

    it('يسمح بالتعديل إذا كانت expectedUpdatedAt أحدث أو مساوية لـ updated_at في قاعدة البيانات', async () => {
      const dbDate = new Date('2026-10-16T10:00:00Z');
      const newerExpected = new Date('2026-10-16T10:00:00Z').toISOString();

      if (pool) {
        querySpy.mockImplementation(async (sql: string) => {
          if (sql.includes('SELECT updated_at, data FROM exams')) {
            return {
              rows: [{ updated_at: dbDate.toISOString(), data: {} }],
            };
          }
          return { rows: [{ id: 'exam-1' }] };
        });
      }

      const res = await request(app)
        .post('/api/exams')
        .set('x-user-role', 'super_admin')
        .send({
          id: 'exam-1',
          title: 'تعديل سليم',
          book: 'الأصول الثلاثة',
          expectedUpdatedAt: newerExpected,
        });

      if (pool) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }
    });
  });

  describe('2. تعارض جدول المهام (POST /api/tasks)', () => {
    it('يرجع 409 Conflict عندما تكون expectedUpdatedAt أقدم من updated_at الحالية', async () => {
      const nowInDb = new Date('2026-10-16T14:30:00Z');
      const olderExpected = new Date('2026-10-16T14:00:00Z').toISOString();

      if (pool) {
        querySpy.mockImplementation(async (sql: string) => {
          if (sql.includes('SELECT updated_at, data FROM schedule_tasks')) {
            return {
              rows: [
                {
                  updated_at: nowInDb.toISOString(),
                  data: { id: 'task-1', title: 'مهمة تم تحديثها من قبل آخر' },
                },
              ],
            };
          }
          return { rows: [] };
        });
      }

      const res = await request(app)
        .post('/api/tasks')
        .set('x-user-role', 'super_admin')
        .send({
          id: 'task-1',
          title: 'محاولة حفظ متضاربة',
          date: '2026-10-16',
          expectedUpdatedAt: olderExpected,
        });

      if (pool) {
        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBe('conflict');
        expect(res.body.message).toContain('تم تعديل هذه المهمة بواسطة مستخدم آخر');
      }
    });
  });

  describe('3. تعارض اللجان الميدانية (POST /api/committees)', () => {
    it('يرجع 409 Conflict عند وجود تعارض في expectedUpdatedAt', async () => {
      const nowInDb = new Date('2026-10-16T15:00:00Z');
      const olderExpected = new Date('2026-10-16T14:45:00Z').toISOString();

      if (pool) {
        querySpy.mockImplementation(async (sql: string) => {
          if (sql.includes('SELECT updated_at, data FROM committees')) {
            return {
              rows: [
                {
                  updated_at: nowInDb.toISOString(),
                  data: { id: 'comm-1', committeeName: 'لجنة معدلة مسبقاً' },
                },
              ],
            };
          }
          return { rows: [] };
        });
      }

      const res = await request(app)
        .post('/api/committees')
        .set('x-user-role', 'super_admin')
        .send({
          id: 'comm-1',
          committeeNumber: 1,
          committeeName: 'حفظ جديد',
          expectedUpdatedAt: olderExpected,
        });

      if (pool) {
        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBe('conflict');
      }
    });
  });
});
