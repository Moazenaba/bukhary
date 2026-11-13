import { describe, expect, it } from 'vitest';
import { ACTIONS, type Action, type Principal, SYSTEM_PERMISSIONS, canAccessExam, grantableRoles, isAllowed, isCommitteeInScope } from '../../server/policy.ts';

// The whole permission table, written out. Changing who may do what must be a deliberate edit
// here: a rule that silently widens (or narrows) access fails this test.
const ALL = [...SYSTEM_PERMISSIONS];
const WHO = {
  admin: { role: 'admin', permissions: [] },
  head: { role: 'committee_head', permissions: [] },
  headAll: { role: 'committee_head', permissions: ALL },
  sheikh: { role: 'sheikh', permissions: [] },
  sheikhAll: { role: 'sheikh', permissions: ALL },
} as const;
type Who = keyof typeof WHO;
//                                      admin head headAll sheikh sheikhAll
const EXPECTED: Record<Action, [0 | 1, 0 | 1, 0 | 1, 0 | 1, 0 | 1]> = {
  'committees.read':      [1, 1, 1, 1, 1],
  'committees.create':    [1, 0, 1, 0, 0],
  'committees.update':    [1, 1, 1, 0, 0],
  'committees.delete':    [1, 0, 1, 0, 0],
  'committees.members':   [1, 1, 1, 0, 0],
  'committees.reception': [1, 1, 1, 0, 0],
  'committees.scoring':   [1, 1, 1, 0, 0],
  'committees.finalize':  [1, 1, 1, 0, 0],
  'courses.read':         [1, 1, 1, 1, 1],
  'courses.write':        [1, 0, 1, 0, 0],
  'exams.read':           [1, 1, 1, 0, 1],
  'exams.write':          [1, 0, 1, 0, 0],
  'exams.delete':         [1, 0, 0, 0, 0],
  'exams.file':           [1, 1, 1, 0, 1],
  'tasks.read':           [1, 1, 1, 1, 1],
  'tasks.write':          [1, 0, 1, 0, 0],
  'tasks.delete':         [1, 0, 1, 0, 0],
  'users.read':           [1, 1, 1, 0, 0],
  'users.manage':         [1, 0, 1, 0, 0],
  'users.delete':         [1, 0, 0, 0, 0],
  'users.grant':          [1, 0, 0, 0, 0],
  'users.admins':         [0, 0, 0, 0, 0],
  'profiles.read':        [1, 0, 0, 0, 0],
  'profiles.write':       [1, 0, 0, 0, 0],
  'books.read':           [1, 1, 1, 1, 1],
  'books.write':          [1, 0, 1, 0, 0],
  'summerRows.read':      [1, 0, 1, 0, 0],
  'summerRows.write':     [1, 0, 1, 0, 0],
  'scoring.read':         [1, 1, 1, 0, 0],
  'scoring.write':        [1, 1, 1, 0, 0],
  'settings.write':       [1, 0, 0, 0, 0],
  'notifications.create': [1, 0, 0, 0, 0],
  'audit.read':           [0, 0, 0, 0, 0],
  'stats.read':           [1, 0, 1, 0, 0],
  'database.admin':       [0, 0, 0, 0, 0],
  'database.backup':      [1, 0, 0, 0, 0],
  'ocr.use':              [1, 0, 1, 0, 0],
};

const principal = (over: Partial<Principal>): Principal => ({
  id: 'u', name: 'u', role: 'sheikh', permissions: [], assignedCommitteeIds: [], allCommittees: false,
  assignedCommittees: [], allExams: false, allowedExamIds: [], mustChangePassword: false, ...over,
});

describe('permission matrix (every role × every action)', () => {
  it('lists every action the server knows (a new action must be added to the table)', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.keys(ACTIONS).sort());
  });

  for (const action of Object.keys(ACTIONS) as Action[]) {
    it(action, () => {
      const got = (Object.keys(WHO) as Who[]).map((w) => (isAllowed(WHO[w] as any, action) ? 1 : 0));
      expect(got).toEqual(EXPECTED[action]);
    });
  }

  it('a super admin may do everything', () => {
    for (const a of Object.keys(ACTIONS) as Action[]) expect(isAllowed({ role: 'super_admin', permissions: [] }, a)).toBe(true);
  });

  it('a sheikh never writes anything, whatever permissions are ticked on the account', () => {
    const writes = (Object.keys(ACTIONS) as Action[]).filter((a) => !/\.(read|file)$/.test(a));
    for (const a of writes) expect(isAllowed(WHO.sheikhAll as any, a), a).toBe(false);
  });

  it('unknown permission labels grant nothing', () => {
    for (const a of Object.keys(ACTIONS) as Action[]) {
      expect(isAllowed({ role: 'committee_head', permissions: ['super_power', 'admin'] }, a)).toBe(isAllowed(WHO.head as any, a));
    }
  });
});

describe('scope and grants', () => {
  it('committee heads and sheikhs act only on their committees; admins everywhere', () => {
    const head = principal({ role: 'committee_head', assignedCommitteeIds: ['c1'] });
    expect(isCommitteeInScope(head, 'c1')).toBe(true);
    expect(isCommitteeInScope(head, 'c2')).toBe(false);
    expect(isCommitteeInScope(head, null)).toBe(false);
    expect(isCommitteeInScope(principal({ role: 'committee_head', allCommittees: true }), 'c2')).toBe(true);
    expect(isCommitteeInScope(principal({ role: 'admin' }), 'anything')).toBe(true);
  });

  it('nobody but a super admin can create admins; admins create heads and sheikhs only', () => {
    expect(grantableRoles({ role: 'super_admin', permissions: [] })).toContain('admin');
    expect(grantableRoles({ role: 'admin', permissions: [] })).toEqual(['committee_head', 'sheikh']);
    expect(grantableRoles({ role: 'committee_head', permissions: ALL })).toEqual(['sheikh']);
  });

  it('exam files: allow-list for everyone but admins and «all exams»', () => {
    const head = principal({ role: 'committee_head', allowedExamIds: ['e1'] });
    expect(canAccessExam(head, 'e1')).toBe(true);
    expect(canAccessExam(head, 'e2')).toBe(false);
    expect(canAccessExam(principal({ role: 'committee_head', allExams: true }), 'e2')).toBe(true);
    expect(canAccessExam(principal({ role: 'sheikh', allowedExamIds: ['e1'] }), 'e1')).toBe(false); // no exams_pdf
    expect(canAccessExam(principal({ role: 'sheikh', permissions: ['exams_pdf'], allowedExamIds: ['e1'] }), 'e1')).toBe(true);
    expect(canAccessExam(principal({ role: 'admin' }), 'any')).toBe(true);
  });
});
