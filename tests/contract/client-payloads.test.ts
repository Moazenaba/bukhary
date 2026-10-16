import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { committeeBody, createUser, seedCourse, setupApp, userWithToken, type TestApp } from '../helpers.ts';

// Contract tests (XP-01, R-42): the requests the clients really send are replayed against the
// real server, so a field the server would drop or refuse fails the build, not a user's work.
// - Android: tests/contract/android-payloads.json is written by the app's ContractPayloadTest
//   (build/contract-payloads/android.json); copy it here whenever the app's requests change.
// - Web: the real DataService/AuthService code runs with fetch routed into the test server.

let t: TestApp;
let admin: Awaited<ReturnType<typeof userWithToken>>;

beforeAll(async () => {
  t = await setupApp();
  await seedCourse(t.pool, 'contract-course', 'دورة العقد');
  admin = await userWithToken(t, { role: 'super_admin' });
  const res = await t.api().post('/api/committees').set(admin.auth).send(
    committeeBody({
      id: 'contract-committee', committeeNumber: 7, courseId: 'contract-course',
      stages: { registration: { completed: true } },
      scoringDetails: { questions: [{ id: 'q-1', questionNumber: 1, label: 'السؤال 1', completed: false }] },
    })
  );
  expect(res.status).toBe(200);
  await t.pool.query(
    `INSERT INTO app_users (id, name, phone, role, status, permissions, assigned_committees, assigned_committee_ids, passport_number, created_at, data)
     VALUES ('contract-applicant', 'متقدم', '0512345678', 'assistant', 'pending', '[]', '[]', '[]', 'P-CONTRACT', NOW(), '{}'),
            ('contract-user', 'معاون', '0500000000', 'assistant', 'approved', '["calendar_schedule"]', '[]', '["contract-committee"]', NULL, NOW(), '{}');`
  );
});
afterAll(async () => {
  await t.pool.end();
});

async function currentVersion(p: string): Promise<string | undefined> {
  const committee = /^api\/committees\/([^/]+)/.exec(p)?.[1];
  if (committee) {
    const { rows } = await t.pool.query('SELECT updated_at FROM committees WHERE id = $1;', [decodeURIComponent(committee)]);
    return rows[0]?.updated_at?.toISOString();
  }
  return undefined;
}

describe('Android payloads (tests/contract/android-payloads.json)', () => {
  const payloads: Array<{ method: string; path: string; body: any }> = JSON.parse(
    fs.readFileSync(path.resolve('tests/contract/android-payloads.json'), 'utf8')
  );

  it('every recorded request is accepted by the server', async () => {
    for (const p of payloads) {
      const body = p.body ? { ...p.body } : undefined;
      // The app adds the version it has at send time; the replay uses the server's current one.
      if (body && 'expectedUpdatedAt' in body) {
        if (p.path === 'api/users') {
          const { rows } = await t.pool.query('SELECT updated_at FROM app_users WHERE id = $1;', [body.id]);
          body.expectedUpdatedAt = rows[0].updated_at.toISOString();
        } else {
          body.expectedUpdatedAt = await currentVersion(p.path);
        }
      }
      const req = (t.api() as any)[p.method.toLowerCase()](`/${p.path}`).set(admin.auth);
      const res = body ? await req.send(body) : await req;
      expect({ request: `${p.method} ${p.path}`, status: res.status, error: res.body?.message }).toEqual({
        request: `${p.method} ${p.path}`, status: 200, error: undefined,
      });
    }
  });

  it('what the app sent is what the server stored', async () => {
    const { rows: task } = await t.pool.query("SELECT committee_id, committee_number, assigned_assistant_id, assigned_assistant_name FROM schedule_tasks WHERE id = 'contract-task';");
    expect(task[0]).toEqual({ committee_id: 'contract-committee', committee_number: 7, assigned_assistant_id: 'contract-user', assigned_assistant_name: 'معاون' });
    const { rows: c } = await t.pool.query("SELECT stages, received_by_assistant, exam_approved_by, ceremony_details FROM committees WHERE id = 'contract-committee';");
    expect(c[0].stages.exam.completed).toBe(true);
    expect(c[0].received_by_assistant).not.toBeNull();
    expect(c[0].ceremony_details.ceremonyDate).toBe('2026-11-01');
    const { rows: ceremonyTask } = await t.pool.query("SELECT date FROM schedule_tasks WHERE id = 'task-ceremony-contract-committee';");
    expect(ceremonyTask[0].date).toBe('2026-11-01');
    // The approval and the rejection did not wipe the passport number (MOB-09).
    const { rows: u } = await t.pool.query("SELECT passport_number, assigned_committee_ids, data FROM app_users WHERE id = 'contract-applicant';");
    expect(u[0].passport_number).toBe('P-CONTRACT');
    expect(u[0].assigned_committee_ids).toEqual(['contract-committee']);
    expect(u[0].data.rejectionReason).toBe('اكتمل العدد');
  });
});

describe('web client requests (real DataService code)', () => {
  it('the web client\'s exam, task, approval and workflow requests are accepted', async () => {
    // Route the client's fetch('/api/...') calls into the test server with the admin's token.
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const method = (init.method ?? 'GET').toLowerCase();
      let req = (t.api() as any)[method](url).set(admin.auth);
      for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) {
        if (k.toLowerCase() !== 'authorization') req = req.set(k, v);
      }
      const res = init.body !== undefined ? await req.send(typeof init.body === 'string' ? JSON.parse(init.body) : init.body) : await req;
      return new Response(JSON.stringify(res.body), { status: res.status, headers: { 'Content-Type': 'application/json' } });
    });
    try {
      const { DataService } = await import('../../src/services/DataService.ts');
      const exam = await DataService.saveExam({
        id: 'contract-exam', title: 'امتحان', book: 'كتاب', branch: '', totalMarks: 100, durationMinutes: 60,
        // Exactly what the old form sent (WEB-01): ignored now, the server sets the time.
        uploadedAt: '2026/10/16 - 8:30 م',
      });
      expect(Number.isNaN(Date.parse(exam.uploadedAt))).toBe(false);

      const task = await DataService.saveTask({
        id: 'contract-web-task', title: 'مهمة', date: '2026-10-21', type: 'delivery', priority: 'normal', completed: false,
        committeeId: 'contract-committee', assignedAssistantId: 'contract-user',
      });
      expect(task.assignedAssistantName).toBe('معاون');
      expect(task.committeeNumber).toBe(7);

      const after = await DataService.committeeAction('contract-committee', { type: 'updateQuestion', questionId: 'q-1', completed: true });
      expect(after.scoringDetails?.questions[0].completed).toBe(true);

      await createUser(t.pool, { role: 'assistant', status: 'pending', name: 'متقدم ويب', phone: '0577777777' });
      const { rows } = await t.pool.query("SELECT id, updated_at FROM app_users WHERE phone = '0577777777';");
      const saved = await DataService.saveUser({
        id: rows[0].id, name: 'متقدم ويب', phone: '0577777777', email: '', status: 'approved',
        assignedCommitteeIds: ['contract-committee'], updatedAt: rows[0].updated_at.toISOString(),
      });
      expect(saved.status).toBe('approved');
      expect(saved.assignedCommitteeIds).toEqual(['contract-committee']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
