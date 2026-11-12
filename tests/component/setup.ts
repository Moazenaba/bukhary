import { AuthService } from '../../src/services/AuthService';

/** Gives the screens the permissions the server would return for this user. */
export function grant(actions: string[], user: Record<string, unknown> = { id: 'u1', name: 'مدير', role: 'super_admin', permissions: [] }) {
  const a = AuthService as any;
  a.permissions = {
    role: user.role,
    actions: Object.fromEntries(actions.map((x) => [x, true])),
    committeeScope: 'all',
    committeeNumbers: 'all',
    exams: 'all',
    grantableRoles: ['sheikh'],
    mustChangePassword: false,
  };
  a.currentUser = user;
}
