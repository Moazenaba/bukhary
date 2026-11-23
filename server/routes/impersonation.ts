import { Router } from 'express';
import { IMPERSONATION_TTL_SECONDS, assertAllowed, createSession, revokeSession, signImpersonationToken } from '../auth.ts';
import { audit } from '../audit.ts';
import type { AppConfig } from '../config.ts';
import { type Pool, withTransaction } from '../db.ts';
import { badRequest, forbidden, notFound, route } from '../http.ts';
import { isAdminRole } from '../policy.ts';

/**
 * «الدخول بعين المستخدم» (docs/PLAN_ROLES_AND_FLOW.md 1.7): an admin opens the app as another person and may do
 * anything they can. Opening it sends no notification; every action taken is logged with both names. An admin may
 * act as anyone but admins and super admins; a super admin as anyone but themself.
 */
export function impersonationRouter(config: AppConfig, pool: Pool) {
  const r = Router();

  r.post('/start/:userId', route(async (req, res) => {
    const actor = req.user!;
    assertAllowed(actor, 'users.impersonate');
    const out = await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT id, name, role, status, token_version FROM app_users WHERE id = $1;', [req.params.userId]);
      const target = rows[0];
      // An admin does not see admin accounts at all: they do not exist for them.
      if (!target || (actor.role !== 'super_admin' && isAdminRole(target.role))) throw notFound('المستخدم غير موجود');
      if (target.id === actor.id) throw badRequest('أنت داخل بحسابك بالفعل');
      if (target.status !== 'approved') throw badRequest('الحساب غير معتمد');
      if (target.role === 'super_admin') throw forbidden('لا يمكن الدخول بعين مشرف عام');
      const sessionId = await createSession(db, target.id, `impersonation by ${actor.id}`);
      await db.query('UPDATE sessions SET impersonator_id = $2 WHERE id = $1;', [sessionId, actor.id]);
      await audit(db, req, 'impersonation.start', 'user', target.id, null, { userId: target.id, userName: target.name, sessionId },
        `${actor.name} دخل بعين ${target.name}`);
      return { target, sessionId };
    });
    res.json({
      success: true,
      token: signImpersonationToken(config, out.target.id, out.target.token_version, out.sessionId, actor.id),
      expiresIn: IMPERSONATION_TTL_SECONDS,
      user: { id: out.target.id, name: out.target.name, role: out.target.role },
    });
  }));

  // Ends the current impersonation session (the admin's own session is untouched).
  r.post('/end', route(async (req, res) => {
    const user = req.user!;
    if (!user.impersonator || !req.sessionId) throw badRequest('لست داخلًا بعين مستخدم');
    await withTransaction(pool, async (db) => {
      await revokeSession(db, req.sessionId!, 'impersonation_end');
      await audit(db, req, 'impersonation.end', 'user', user.id, null, null, `انتهى دخول ${user.impersonator!.name} بعين ${user.name}`);
    });
    res.json({ success: true });
  }));

  return r;
}
