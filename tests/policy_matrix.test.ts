import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import {
  ACTIONS,
  ActionType,
  SystemRole,
  isActionAllowed,
  isCommitteeAllowed,
  extractUserFromRequest,
} from '../server/policy.js';

describe('1. اختبار مصفوفة الصلاحيات (Pure Policy Matrix)', () => {
  const allRoles: SystemRole[] = ['super_admin', 'committee_head', 'teacher', 'assistant', 'auditor'];
  const allActions = Object.values(ACTIONS);

  it('super_admin يجب أن يمتلك جميع الصلاحيات دون استثناء', () => {
    for (const action of allActions) {
      expect(isActionAllowed('super_admin', action)).toBe(true);
    }
  });

  it('auditor (المراجع) يجب أن يملك صلاحيات القراءة فقط دون أي تعديل أو حذف', () => {
    const readActions: ActionType[] = [
      ACTIONS.COURSES_READ,
      ACTIONS.COMMITTEES_READ,
      ACTIONS.USERS_READ,
      ACTIONS.EXAMS_READ,
      ACTIONS.TASKS_READ,
      ACTIONS.SCORING_READ,
      ACTIONS.NOTIFICATIONS_READ,
      ACTIONS.AUDIT_LOGS_READ,
    ];

    for (const action of allActions) {
      if (readActions.includes(action)) {
        expect(isActionAllowed('auditor', action)).toBe(true);
      } else {
        expect(isActionAllowed('auditor', action)).toBe(false);
      }
    }
  });

  it('teacher (المعلم) يملك قراءة المقررات واللجان ورصد الدرجات، وممنوع من حذف اللجان أو تعديل المستخدمين أو إدارة القاعدة', () => {
    expect(isActionAllowed('teacher', ACTIONS.SCORING_WRITE)).toBe(true);
    expect(isActionAllowed('teacher', ACTIONS.COMMITTEES_DELETE)).toBe(false);
    expect(isActionAllowed('teacher', ACTIONS.USERS_WRITE)).toBe(false);
    expect(isActionAllowed('teacher', ACTIONS.DATABASE_ADMIN)).toBe(false);
  });

  it('assistant (المساعد) يملك كتابة المهام ورصد الدرجات، وممنوع من حذف اللجان أو المقررات', () => {
    expect(isActionAllowed('assistant', ACTIONS.TASKS_WRITE)).toBe(true);
    expect(isActionAllowed('assistant', ACTIONS.SCORING_WRITE)).toBe(true);
    expect(isActionAllowed('assistant', ACTIONS.COMMITTEES_DELETE)).toBe(false);
    expect(isActionAllowed('assistant', ACTIONS.COURSES_DELETE)).toBe(false);
  });

  it('committee_head (رئيس اللجنة) يملك إدارة المهام والامتحانات للجان، وممنوع من حذف المقررات أو تعديل المستخدمين العام', () => {
    expect(isActionAllowed('committee_head', ACTIONS.EXAMS_WRITE)).toBe(true);
    expect(isActionAllowed('committee_head', ACTIONS.TASKS_DELETE)).toBe(true);
    expect(isActionAllowed('committee_head', ACTIONS.COURSES_DELETE)).toBe(false);
    expect(isActionAllowed('committee_head', ACTIONS.DATABASE_ADMIN)).toBe(false);
  });
});

describe('2. اختبار تقييد اللجان (Committee Scoping)', () => {
  it('super_admin مصرح له بجميع اللجان حتى لو لم تُسند إليه', () => {
    const user = {
      role: 'super_admin' as SystemRole,
      assignedCommittees: [1, 2],
    };
    expect(isCommitteeAllowed(user, 99)).toBe(true);
    expect(isCommitteeAllowed(user, null)).toBe(true);
  });

  it('الأدوار الميدانية (assistant, committee_head, teacher) مسموح لها باللجان المسندة فقط', () => {
    const user = {
      role: 'assistant' as SystemRole,
      assignedCommittees: [10, 15],
    };
    expect(isCommitteeAllowed(user, 10)).toBe(true);
    expect(isCommitteeAllowed(user, 15)).toBe(true);
    expect(isCommitteeAllowed(user, 20)).toBe(false);
  });
});

describe('3. اختبار مصفوفة المسارات عبر HTTP Endpoints مع الأدوار الخمسة', () => {
  // Courses write: only super_admin
  it('POST /api/courses: مسموح لـ super_admin وممنوع (403) لباقي الأدوار', async () => {
    const deniedRoles: SystemRole[] = ['committee_head', 'teacher', 'assistant', 'auditor'];
    for (const role of deniedRoles) {
      const res = await request(app)
        .post('/api/courses')
        .set('x-user-role', role)
        .send({ id: 'c1', name: 'Course 1' });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('forbidden');
    }
  });

  // Database endpoints: only super_admin
  it('GET /api/database/status: مسموح لـ super_admin وممنوع (403) للمساعد والمراجع والمعلم', async () => {
    const deniedRoles: SystemRole[] = ['auditor', 'assistant', 'teacher', 'committee_head'];
    for (const role of deniedRoles) {
      const res = await request(app)
        .get('/api/database/status')
        .set('x-user-role', role);
      expect(res.status).toBe(403);
    }
  });

  // Audit logs read: only super_admin & auditor
  it('GET /api/audit-logs: ممنوع (403) للمعلم والمساعد ورئيس اللجنة', async () => {
    const deniedRoles: SystemRole[] = ['teacher', 'assistant', 'committee_head'];
    for (const role of deniedRoles) {
      const res = await request(app)
        .get('/api/audit-logs')
        .set('x-user-role', role);
      expect(res.status).toBe(403);
    }
  });

  // Users write (approved users): auditor & teacher & assistant forbidden
  it('POST /api/users (status=approved): ممنوع (403) للمراجع والمعلم والمساعد', async () => {
    const deniedRoles: SystemRole[] = ['auditor', 'teacher', 'assistant'];
    for (const role of deniedRoles) {
      const res = await request(app)
        .post('/api/users')
        .set('x-user-role', role)
        .send({ id: 'u1', name: 'Test', role: 'teacher', status: 'approved' });
      expect(res.status).toBe(403);
    }
  });

  // Committee scoping enforcement: 403 when committee is not in assignedCommittees
  it('POST /api/committees: يرجع 403 عند محاولة تعديل لجنة غير مسندة للمستخدم', async () => {
    const res = await request(app)
      .post('/api/committees')
      .set('x-user-role', 'committee_head')
      .set('x-user-committees', JSON.stringify([1, 2]))
      .send({
        id: 'comm-5',
        committeeNumber: 5, // Not in [1, 2]
        committeeName: 'لجنة الفقه',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
    expect(res.body.message).toContain('غير مصرح لك بإجراء هذا التعديل على لجنة رقم (5)');
  });

  // Scoring committee scoping enforcement: 403 when committee is not assigned
  it('POST /api/scoring: يرجع 403 عند محاولة رصد درجات للجنة غير مسندة للمعلم', async () => {
    const res = await request(app)
      .post('/api/scoring')
      .set('x-user-role', 'teacher')
      .set('x-user-committees', JSON.stringify([3]))
      .send({
        id: 'score-1',
        committeeNumber: 8, // Not in [3]
        studentName: 'أحمد',
        questionNumber: 1,
        score: 10,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
    expect(res.body.message).toContain('غير مصرح لك');
  });

  // Auditor trying to post scoring: 403 role-level
  it('POST /api/scoring: يرجع 403 للمراجع (auditor) لأن دوره للقراءة فقط', async () => {
    const res = await request(app)
      .post('/api/scoring')
      .set('x-user-role', 'auditor')
      .send({
        id: 'score-1',
        committeeNumber: 1,
        studentName: 'أحمد',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });
});
