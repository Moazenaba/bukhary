import { describe, expect, it } from 'vitest';
import { type Principal, evaluatedPermissions, isAllowed, isCommitteeInScope, isHeadOn, visibleCommitteeIds } from '../../server/policy.ts';

// A temporary head grant lends the committee head's powers on the granted committees only.
const sheikh = (over: Partial<Principal> = {}): Principal => ({
  id: 's1',
  name: 'شيخ',
  role: 'sheikh',
  permissions: [],
  assignedCommitteeIds: ['c1'],
  allCommittees: false,
  assignedCommittees: [1],
  allExams: false,
  allowedExamIds: [],
  mustChangePassword: false,
  observing: [],
  headGrants: [],
  ...over,
});

const granted = sheikh({ headGrants: [{ id: 'g1', committeeId: 'c2', decision: 'undecided' }] });

describe('temporary head grants', () => {
  it('a sheikh with no grant has no head powers anywhere', () => {
    expect(isAllowed(sheikh(), 'committees.members')).toBe(false);
    expect(isCommitteeInScope(sheikh(), 'c2')).toBe(false);
  });

  it('a grant gives the head actions on the granted committee only', () => {
    expect(isAllowed(granted, 'committees.members')).toBe(true);
    expect(isCommitteeInScope(granted, 'c2')).toBe(true);
    expect(isCommitteeInScope(granted, 'c3')).toBe(false);
  });

  it('a grant never unlocks an action that is not about one committee', () => {
    // users.read is a head right but not committee-scoped: a temporary head must not see every sheikh.
    expect(isAllowed(granted, 'users.read')).toBe(false);
    expect(isAllowed(granted, 'users.grant')).toBe(false);
  });

  it('the assigned committee still works next to a grant', () => {
    expect(isCommitteeInScope(granted, 'c1')).toBe(true);
    expect(visibleCommitteeIds(granted).sort()).toEqual(['c1', 'c2']);
  });

  it('isHeadOn is true for the grant committee and for the permanent head only', () => {
    expect(isHeadOn(granted, 'c2')).toBe(true);
    expect(isHeadOn(granted, 'c1')).toBe(false);
    const head = sheikh({ role: 'committee_head', assignedCommitteeIds: ['c1'] });
    expect(isHeadOn(head, 'c1')).toBe(true);
    expect(isHeadOn(head, 'c2')).toBe(false);
  });

  it('the evaluated permissions say which committees the grant heads, for the apps to follow', () => {
    expect(evaluatedPermissions(granted).headCommitteeIds).toEqual(['c2']);
    expect(evaluatedPermissions(sheikh()).headCommitteeIds).toEqual([]);
  });
});
