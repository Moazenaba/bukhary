import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import {
  ACTIONS,
  isActionAllowed,
  isCommitteeAllowed,
  SystemRole,
  UserContext,
} from '../server/policy';

describe('مصفوفة الصلاحيات المركزية (RBAC Policy Matrix)', () => {
  const allRoles: SystemRole[] = [
    'super_admin',
    'committee_head',
    'teacher',
    'assistant',
    'auditor',
  ];

  describe('1. اختبار فحص الصلاحيات لكل دور × كل عملية (ACTIONS)', () => {
    it('المشرف العام (super_admin) يملك صلاحية تنفيذ كافة العمليات بنسبة 100%', () => {
      for (const action of Object.values(ACTIONS)) {
        expect(
          isActionAllowed('super_admin', action),
          `فشل المشرف العام في الحصول على صلاحية ${action}`
        ).toBe(true);
      }
    });

    it('المدقق الرقابي (auditor) يملك صلاحيات القراءة فقط وممنوع من أي عملية تعديل أو حذف أو إدارة', () => {
      // مسموح له بالقراءة فقط
      expect(isActionAllowed('auditor', ACTIONS.COURSES_READ)).toBe(true);
      expect(isActionAllowed('auditor', ACTIONS.COMMITTEES_READ)).toBe(true);
      expect(isActionAllowed('auditor', ACTIONS.USERS_READ)).toBe(true);
      expect(isActionAllowed('auditor', ACTIONS.EXAMS_READ)).toBe(true);
      expect(isActionAllowed('auditor', ACTIONS.TASKS_READ)).toBe(true);
      expect(isActionAllowed('auditor', ACTIONS.SCORING_READ)).toBe(true);
      expect(isActionAllowed('auditor', ACTIONS.NOTIFICATIONS_READ)).toBe(true);
      expect(isActionAllowed('auditor', ACTIONS.AUDIT_LOGS_READ)).toBe(true);

      // ممنوع من التعديل والحذف
      expect(isActionAllowed('auditor', ACTIONS.COURSES_WRITE)).toBe(false);
      expect(isActionAllowed('auditor', ACTIONS.COURSES_DELETE)).toBe(false);
      expect(isActionAllowed('auditor', ACTIONS.COMMITTEES_WRITE)).toBe(false);
      expect(isActionAllowed('auditor', ACTIONS.COMMITTEES_DELETE)).toBe(false);
      expect(isActionAllowed('auditor', ACTIONS.USERS_WRITE)).toBe(false);
      expect(isActionAllowed('auditor', ACTIONS.USERS_DELETE)).toBe(false);
      expect(isActionAllowed('auditor', ACTIONS.EXAMS_WRITE)).toBe(false);
      expect(isActionAllowed('auditor', ACTIONS.EXAMS_DELETE)).toBe(false);
      expect(isActionAllowed('auditor', ACTIONS.TASKS_WRITE)).toBe(false);
      expect(isActionAllowed('auditor', ACTIONS.TASKS_DELETE)).toBe(false);
      expect(isActionAllowed('auditor', ACTIONS.SCORING_WRITE)).toBe(false);
      expect(isActionAllowed('auditor', ACTIONS.NOTIFICATIONS_WRITE)).toBe(false);
      expect(isActionAllowed('auditor', ACTIONS.DATABASE_ADMIN)).toBe(false);
    });

    it('المعلم (teacher) مصرح له برصد الدرجات والتحقق، وممنوع من تعديل الدورات والامتحانات والمهام والمستخدمين', () => {
      expect(isActionAllowed('teacher', ACTIONS.SCORING_WRITE)).toBe(true);
      expect(isActionAllowed('teacher', ACTIONS.COMMITTEES_WRITE)).toBe(true);
      expect(isActionAllowed('teacher', ACTIONS.COURSES_WRITE)).toBe(false);
      expect(isActionAllowed('teacher', ACTIONS.USERS_WRITE)).toBe(false);
      expect(isActionAllowed('teacher', ACTIONS.EXAMS_WRITE)).toBe(false);
      expect(isActionAllowed('teacher', ACTIONS.TASKS_WRITE)).toBe(false);
      expect(isActionAllowed('teacher', ACTIONS.DATABASE_ADMIN)).toBe(false);
    });

    it('المعاون الميداني (assistant) مصرح له باستلام اللجان وإنجاز المهام وإرسال الإشعارات، وممنوع من تعديل الدورات أو بنك الامتحانات', () => {
      expect(isActionAllowed('assistant', ACTIONS.COMMITTEES_WRITE)).toBe(true);
      expect(isActionAllowed('assistant', ACTIONS.TASKS_WRITE)).toBe(true);
      expect(isActionAllowed('assistant', ACTIONS.SCORING_WRITE)).toBe(true);
      expect(isActionAllowed('assistant', ACTIONS.NOTIFICATIONS_WRITE)).toBe(true);
      expect(isActionAllowed('assistant', ACTIONS.COURSES_WRITE)).toBe(false);
      expect(isActionAllowed('assistant', ACTIONS.USERS_WRITE)).toBe(false);
      expect(isActionAllowed('assistant', ACTIONS.EXAMS_WRITE)).toBe(false);
      expect(isActionAllowed('assistant', ACTIONS.COMMITTEES_DELETE)).toBe(false);
      expect(isActionAllowed('assistant', ACTIONS.DATABASE_ADMIN)).toBe(false);
    });

    it('رئيس اللجنة (committee_head) مصرح له بإدارة اللجان والامتحانات والمهام، وممنوع من إدارة الدورات أو قاعدة البيانات أو حذف اللجان', () => {
      expect(isActionAllowed('committee_head', ACTIONS.COMMITTEES_WRITE)).toBe(true);
      expect(isActionAllowed('committee_head', ACTIONS.EXAMS_WRITE)).toBe(true);
      expect(isActionAllowed('committee_head', ACTIONS.TASKS_WRITE)).toBe(true);
      expect(isActionAllowed('committee_head', ACTIONS.TASKS_DELETE)).toBe(true);
      expect(isActionAllowed('committee_head', ACTIONS.SCORING_WRITE)).toBe(true);
      expect(isActionAllowed('committee_head', ACTIONS.COURSES_WRITE)).toBe(false);
      expect(isActionAllowed('committee_head', ACTIONS.COMMITTEES_DELETE)).toBe(false);
      expect(isActionAllowed('committee_head', ACTIONS.DATABASE_ADMIN)).toBe(false);
    });
  });

  describe('2. اختبار التقييد باللجنة الميدانية المسندة (Committee Scope)', () => {
    it('المشرف العام يملك حق الوصول لأي لجنة حتى بدون إسناد', () => {
      const superAdmin: UserContext = {
        role: 'super_admin',
        assignedCommittees: [],
      };
      expect(isCommitteeAllowed(superAdmin, 1)).toBe(true);
      expect(isCommitteeAllowed(superAdmin, 99)).toBe(true);
    });

    it('رئيس اللجنة مسموح له فقط باللجان المسندة إليه، ويرفض أي لجنة أخرى', () => {
      const head: UserContext = {
        role: 'committee_head',
        assignedCommittees: [1, 2],
      };
      expect(isCommitteeAllowed(head, 1)).toBe(true);
      expect(isCommitteeAllowed(head, 2)).toBe(true);
      expect(isCommitteeAllowed(head, 3)).toBe(false);
      expect(isCommitteeAllowed(head, 10)).toBe(false);
    });

    it('المعلم مسموح له فقط بلجانه المسندة', () => {
      const teacher: UserContext = {
        role: 'teacher',
        assignedCommittees: [4],
      };
      expect(isCommitteeAllowed(teacher, 4)).toBe(true);
      expect(isCommitteeAllowed(teacher, 5)).toBe(false);
    });

    it('المعاون مسموح له فقط بلجانه المسندة', () => {
      const assistant: UserContext = {
        role: 'assistant',
        assignedCommittees: [7, 8],
      };
      expect(isCommitteeAllowed(assistant, 7)).toBe(true);
      expect(isCommitteeAllowed(assistant, 8)).toBe(true);
      expect(isCommitteeAllowed(assistant, 9)).toBe(false);
    });
  });

  describe('3. اختبار المسارات عبر HTTP (Express Endpoints & HTTP 403 Forbidden)', () => {
    it('يرفض طلب auditor لتعديل الدورات بـ 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/courses')
        .set('x-user-role', 'auditor')
        .send({ id: 'c-test', name: 'دورة غير مصرح بها' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('forbidden');
    });

    it('يرفض طلب auditor لحذف اللجان بـ 403 Forbidden', async () => {
      const res = await request(app)
        .delete('/api/committees/1')
        .set('x-user-role', 'auditor');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('forbidden');
    });

    it('يرفض طلب auditor لرفع امتحان بـ 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/exams')
        .set('x-user-role', 'auditor')
        .send({ id: 'ex-test', title: 'امتحان غير مصرح' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('forbidden');
    });

    it('يرفض طلب committee_head عند محاولة تعديل لجنة غير مسندة بـ 403 Forbidden مع رسالة توضيحية', async () => {
      const res = await request(app)
        .post('/api/committees')
        .set('x-user-role', 'committee_head')
        .set('x-user-committees', JSON.stringify([1, 2]))
        .send({
          id: 'comm-3',
          committeeNumber: 3, // غير مسندة (المسند هو 1 و 2 فقط)
          committeeName: 'لجنة رقم 3',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('forbidden');
      expect(res.body.message).toContain('لجنة رقم (3)');
      expect(res.body.message).toContain('ليست ضمن اللجان المسندة إليك');
    });

    it('يرفض طلب teacher لرصد درجات في لجنة غير مسندة بـ 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/scoring')
        .set('x-user-role', 'teacher')
        .set('x-user-committees', JSON.stringify([2]))
        .send({
          id: 'score-1',
          committeeNumber: 5, // غير مسندة
          studentName: 'طالب تجريبي',
          score: 10,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('forbidden');
    });

    it('يرفض طلب assistant لتبديل حالة مهمة للجنة غير مسندة بـ 403 Forbidden', async () => {
      const res = await request(app)
        .patch('/api/tasks/task-1/toggle')
        .set('x-user-role', 'assistant')
        .set('x-user-committees', JSON.stringify([1]))
        .send({
          completed: true,
          committeeNumber: 8, // غير مسندة
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('forbidden');
    });

    it('يرفض وصول غير المشرف العام إلى مسارات إدارة قاعدة البيانات بـ 403 Forbidden', async () => {
      const roles: SystemRole[] = ['committee_head', 'teacher', 'assistant', 'auditor'];
      for (const role of roles) {
        const res = await request(app)
          .post('/api/database/migrate')
          .set('x-user-role', role);

        expect(res.status, `الدور ${role} استطاع الوصول لمسار الترحيل!`).toBe(403);
      }
    });
  });
});
