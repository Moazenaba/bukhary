// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Committee } from '../../src/types';
import { planCommitteeSave, stageSteps } from '../../src/utils/committeeChanges';
import { createKeyedQueue } from '../../src/utils/keyedQueue';
import { tabFromHash } from '../../src/utils/hashRoute';
import { csvCell } from '../../src/utils/csv';

const stages = (done: string[]) =>
  Object.fromEntries(
    ['registration', 'exam', 'scoring', 'aggregation', 'review', 'sheet', 'accreditation', 'announcement', 'ceremony'].map((k) => [
      k,
      { completed: done.includes(k) },
    ])
  ) as Committee['stages'];

const base = (over: Partial<Committee> = {}): Committee => ({
  id: 'c1',
  committeeNumber: 1,
  committeeName: 'لجنة',
  members: [],
  branch: '',
  competitionBook: '',
  generalNotes: '',
  courseId: 'course-1',
  stages: stages([]),
  createdDate: '2026-10-01',
  createdAtTime: '',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

describe('committee save planner (API-10, API-11, WEB-09)', () => {
  it('stage changes become workflow intents in an order the server accepts', () => {
    expect(stageSteps(stages(['registration', 'exam', 'scoring']), stages(['registration']))).toEqual([
      { kind: 'action', action: { type: 'reopenStage', stage: 'scoring' } },
      { kind: 'action', action: { type: 'reopenStage', stage: 'exam' } },
    ]);
    expect(stageSteps(stages([]), stages(['registration', 'exam']))).toEqual([
      { kind: 'action', action: { type: 'completeStage', stage: 'registration' } },
      { kind: 'action', action: { type: 'completeStage', stage: 'exam' } },
    ]);
  });

  it('ticking one question sends that question only, not the whole document', () => {
    const q = (id: string, completed: boolean) => ({ id, questionNumber: 1, label: id, completed });
    const before = base({ scoringDetails: { questions: [q('q1', false), q('q2', false)] } });
    const after = base({ scoringDetails: { questions: [q('q1', true), q('q2', false)] } });
    expect(planCommitteeSave(before, after)).toEqual([{ kind: 'action', action: { type: 'updateQuestion', questionId: 'q1', completed: true } }]);
  });

  it('adding a question replaces the scoring document (with the version, sent by the caller)', () => {
    const q = (id: string) => ({ id, questionNumber: 1, label: id, completed: false });
    const steps = planCommitteeSave(base({ scoringDetails: { questions: [q('q1')] } }), base({ scoringDetails: { questions: [q('q1'), q('q2')] } }));
    expect(steps.map((s) => s.kind)).toEqual(['patchScoring']);
  });

  it('base data saves never carry stages or documents', () => {
    const steps = planCommitteeSave(base(), base({ committeeName: 'اسم جديد', stages: stages(['registration']) }));
    expect(steps[0].kind).toBe('saveBase');
    const saved = (steps[0] as any).committee as Committee;
    expect(saved.stages).toEqual(stages([]));
    expect(saved.scoringDetails).toBeUndefined();
    expect(steps[1]).toEqual({ kind: 'action', action: { type: 'completeStage', stage: 'registration' } });
  });

  it('an unchanged committee needs no request', () => {
    expect(planCommitteeSave(base(), base())).toEqual([]);
  });
});

describe('per-committee queue (WEB-10)', () => {
  it('runs jobs for the same committee one at a time, in order, even when one fails', async () => {
    const q = createKeyedQueue();
    const log: string[] = [];
    const job = (name: string, ms: number, fail = false) => () =>
      new Promise<string>((resolve, reject) =>
        setTimeout(() => {
          log.push(name);
          fail ? reject(new Error(name)) : resolve(name);
        }, ms)
      );
    const a = q.run('c1', job('a', 20, true));
    const b = q.run('c1', job('b', 1));
    const other = q.run('c2', job('other', 5));
    await expect(a).rejects.toThrow('a');
    await expect(b).resolves.toBe('b');
    await other;
    expect(log).toEqual(['other', 'a', 'b']);
  });
});

describe('URL routing (WEB-17)', () => {
  it('reads known screens from the hash and ignores the rest', () => {
    expect(tabFromHash('#/committees')).toBe('committees');
    expect(tabFromHash('#/audit?x=1')).toBe('audit');
    expect(tabFromHash('#/nope')).toBeNull();
    expect(tabFromHash('')).toBeNull();
  });
});

describe('CSV export (WEB-15)', () => {
  it('neutralises spreadsheet formulas and escapes quotes; numbers stay numbers', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe(`"+1"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
    expect(csvCell('-5')).toBe(`"-5"`);
    expect(csvCell('-cmd')).toBe(`"'-cmd"`);
    expect(csvCell(null)).toBe('""');
  });
});

describe('user changes are single requests (WEB-03, WEB-05)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('approving with a profile sends one request with only the changed access fields', async () => {
    const { AuthService } = await import('../../src/services/AuthService');
    const calls: Array<{ url: string; body: any }> = [];
    const users = [{ id: 'u2', name: 'متقدم', phone: '0500000002', email: '', role: 'assistant', status: 'pending', permissions: [], assignedCommittees: [], createdAt: '', updatedAt: '2026-10-01T00:00:00.000Z' }];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
        if (url === '/api/auth/login') return json({ token: 't' });
        if (url === '/api/auth/me') {
          return json({ user: { id: 'admin', name: 'مشرف', role: 'super_admin', permissions: [], assignedCommittees: [] }, permissions: { role: 'super_admin', actions: { 'users.read': true, 'profiles.read': true, 'users.grant': true }, committeeScope: 'all' } });
        }
        if (url === '/api/users' && (!init || init.method === undefined || init.method === 'GET')) return json({ users });
        if (url === '/api/permission-profiles') return json({ profiles: [{ id: 'p1', name: 'بروفايل' }] });
        if (url === '/api/users') return json({ user: { ...users[0], status: 'approved' } });
        throw new Error(`unexpected ${url}`);
      })
    );
    await AuthService.login('admin', 'x');
    calls.length = 0;
    await AuthService.approveUser('u2', { profileId: 'p1' });
    const writes = calls.filter((c) => c.url === '/api/users' && c.body);
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toEqual({
      id: 'u2', name: 'متقدم', phone: '0500000002', email: '', status: 'approved', profileId: 'p1', expectedUpdatedAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    });
  });
});
