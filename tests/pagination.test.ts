import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app, pool } from '../server';

describe('الترقيم (Pagination) في مسارات المستخدمين والإشعارات', () => {
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

  describe('1. ترقيم المستخدمين (GET /api/users)', () => {
    it('يرجع كائن الترقيم مع total و hasMore عند تمرير limit و offset', async () => {
      if (pool) {
        querySpy.mockImplementation(async (sql: string) => {
          if (sql.includes('COUNT(*) FROM app_users')) {
            return { rows: [{ count: '15' }] };
          }
          if (sql.includes('LIMIT $1 OFFSET $2')) {
            return {
              rows: [
                { id: 'user-1', name: 'مستخدم 1', role: 'assistant' },
                { id: 'user-2', name: 'مستخدم 2', role: 'teacher' },
              ],
            };
          }
          return { rows: [] };
        });
      }

      const res = await request(app)
        .get('/api/users?limit=2&offset=0')
        .set('x-user-role', 'super_admin');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      if (pool) {
        expect(res.body.total).toBe(15);
        expect(res.body.limit).toBe(2);
        expect(res.body.offset).toBe(0);
        expect(res.body.hasMore).toBe(true);
        expect(res.body.users).toHaveLength(2);
      }
    });

    it('يحافظ على التوافقية العكسية بدون limit لتطبيق الأندرويد', async () => {
      if (pool) {
        querySpy.mockImplementation(async (sql: string) => {
          if (sql.includes('COUNT(*) FROM app_users')) {
            return { rows: [{ count: '2' }] };
          }
          return {
            rows: [
              { id: 'user-1', name: 'مستخدم 1', role: 'assistant' },
              { id: 'user-2', name: 'مستخدم 2', role: 'teacher' },
            ],
          };
        });
      }

      const res = await request(app)
        .get('/api/users')
        .set('x-user-role', 'super_admin');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.limit).toBeUndefined();
    });
  });

  describe('2. ترقيم الإشعارات (GET /api/notifications)', () => {
    it('يرجع كائن الترقيم مع total و hasMore عند تمرير limit و offset', async () => {
      if (pool) {
        querySpy.mockImplementation(async (sql: string) => {
          if (sql.includes('COUNT(*) FROM notifications')) {
            return { rows: [{ count: '50' }] };
          }
          if (sql.includes('LIMIT $1 OFFSET $2')) {
            return {
              rows: [
                { id: 'notif-1', title: 'إشعار 1', type: 'info' },
                { id: 'notif-2', title: 'إشعار 2', type: 'success' },
                { id: 'notif-3', title: 'إشعار 3', type: 'urgent' },
              ],
            };
          }
          return { rows: [] };
        });
      }

      const res = await request(app)
        .get('/api/notifications?limit=3&offset=0')
        .set('x-user-role', 'super_admin');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      if (pool) {
        expect(res.body.total).toBe(50);
        expect(res.body.limit).toBe(3);
        expect(res.body.offset).toBe(0);
        expect(res.body.hasMore).toBe(true);
        expect(res.body.notifications).toHaveLength(3);
      }
    });
  });
});
