import type { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { AppConfig } from './config.ts';
import type { Pool, Queryable } from './db.ts';
import { HttpError, forbidden } from './http.ts';
import { logger } from './logger.ts';
import { type Action, type Principal, type Role, isAllowed, isCommitteeInScope } from './policy.ts';

declare module 'express-serve-static-core' {
  interface Request {
    user?: Principal;
    /** Session of the access token (absent for tokens issued before sessions existed). */
    sessionId?: string;
  }
}

interface AccessClaims {
  sub: string;
  ver: number;
  sid?: string;
  /** «الدخول بعين المستخدم»: the admin acting as `sub`. */
  imp?: string;
}

/** How long an admin may act as another user before signing in as them again. */
export const IMPERSONATION_TTL_SECONDS = 3600;

/** A token for an admin acting as `userId` (no refresh token: it simply ends). */
export function signImpersonationToken(config: AppConfig, userId: string, tokenVersion: number, sessionId: string, adminId: string): string {
  return jwt.sign({ ver: tokenVersion, sid: sessionId, imp: adminId } satisfies Omit<AccessClaims, 'sub'>, config.jwtSecret, {
    subject: userId,
    expiresIn: IMPERSONATION_TTL_SECONDS,
    algorithm: 'HS256',
  });
}

/** What an admin acting as someone may not do: their own phone would get the person's pushes, and so on. */
const IMPERSONATION_BLOCKED = [/^\/api\/devices/, /^\/api\/auth\/change-password$/, /^\/api\/auth\/logout-all$/, /^\/api\/impersonation\/start/];

/** A rotated refresh token presented again within this window is treated as a race between tabs, not theft. */
export const REFRESH_REUSE_GRACE_SECONDS = 30;

export function signAccessToken(config: AppConfig, userId: string, tokenVersion: number, sessionId: string): string {
  return jwt.sign({ ver: tokenVersion, sid: sessionId } satisfies Omit<AccessClaims, 'sub'>, config.jwtSecret, {
    subject: userId,
    expiresIn: config.accessTokenTtl as any,
    algorithm: 'HS256',
  });
}

export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export async function createSession(db: Queryable, userId: string, userAgent?: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.query('INSERT INTO sessions (id, user_id, user_agent) VALUES ($1, $2, $3);', [id, userId, userAgent?.slice(0, 300) ?? null]);
  return id;
}

/** Issues an opaque refresh token "<id>.<secret>" bound to a session; only the hash is stored. */
export async function issueRefreshToken(db: Queryable, config: AppConfig, userId: string, sessionId: string, userAgent?: string): Promise<string> {
  const id = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO refresh_tokens (id, user_id, session_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, $4, NOW() + make_interval(days => $5), $6);`,
    [id, userId, sessionId, sha256(secret), config.refreshTokenTtlDays, userAgent?.slice(0, 300) ?? null]
  );
  return `${id}.${secret}`;
}

const invalidRefresh = () => new HttpError(401, 'انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى', 'invalid_refresh');

/** Revokes a session and every refresh token in it. */
export async function revokeSession(db: Queryable, sessionId: string, reason: string) {
  await db.query('UPDATE sessions SET revoked_at = COALESCE(revoked_at, NOW()), revoke_reason = COALESCE(revoke_reason, $2) WHERE id = $1;', [sessionId, reason]);
  await db.query("UPDATE refresh_tokens SET revoked_at = NOW(), revoke_reason = $2 WHERE session_id = $1 AND revoked_at IS NULL;", [sessionId, reason]);
}

/** Revokes every session of a user (role/permission/password changes). */
export async function revokeAllSessions(db: Queryable, userId: string, reason: string) {
  await db.query('UPDATE sessions SET revoked_at = NOW(), revoke_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL;', [userId, reason]);
  await db.query('UPDATE refresh_tokens SET revoked_at = NOW(), revoke_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL;', [userId, reason]);
}

/**
 * Validates and rotates a refresh token. Returns its user and session.
 * - A valid token is revoked ('rotated') and the caller issues the next one in the same session.
 * - With `allowGrace` (the web's HttpOnly cookie, which page scripts cannot read), a token rotated
 *   less than REFRESH_REUSE_GRACE_SECONDS ago is accepted again: two tabs refreshed at once.
 * - Any later reuse of a rotated token means it was copied: the whole session is revoked.
 */
export async function rotateRefreshToken(
  db: Queryable,
  token: string,
  opts: { allowGrace: boolean }
): Promise<{ userId: string; sessionId: string }> {
  const [id, secret] = String(token).split('.');
  if (!id || !secret) throw new HttpError(401, 'جلسة غير صالحة، يرجى تسجيل الدخول', 'invalid_refresh');
  const { rows } = await db.query(
    `SELECT t.user_id, t.session_id, t.revoked_at, t.revoke_reason, t.expires_at > NOW() AS live,
            t.revoked_at > NOW() - make_interval(secs => $3) AS in_grace, s.revoked_at AS session_revoked
     FROM refresh_tokens t JOIN sessions s ON s.id = t.session_id
     WHERE t.id = $1 AND t.token_hash = $2;`,
    [id, sha256(secret), REFRESH_REUSE_GRACE_SECONDS]
  );
  const t = rows[0];
  if (!t || !t.live || t.session_revoked) throw invalidRefresh();
  if (t.revoked_at) {
    if (t.revoke_reason === 'rotated' && t.in_grace && opts.allowGrace) return { userId: t.user_id, sessionId: t.session_id };
    if (t.revoke_reason === 'rotated') {
      await revokeSession(db, t.session_id, 'refresh_reuse');
      logger.warn('auth.refresh_reuse', { userId: t.user_id, sessionId: t.session_id });
      throw invalidRefresh();
    }
    throw invalidRefresh();
  }
  const { rowCount } = await db.query(
    "UPDATE refresh_tokens SET revoked_at = NOW(), revoke_reason = 'rotated' WHERE id = $1 AND revoked_at IS NULL;",
    [id]
  );
  // Lost a race with a concurrent refresh of the same token.
  if (rowCount === 0) {
    if (opts.allowGrace) return { userId: t.user_id, sessionId: t.session_id };
    await revokeSession(db, t.session_id, 'refresh_reuse');
    throw invalidRefresh();
  }
  await db.query('UPDATE sessions SET last_used_at = NOW() WHERE id = $1;', [t.session_id]);
  return { userId: t.user_id, sessionId: t.session_id };
}

/** Columns needed to build a Principal; committee numbers are derived from the assigned ids. */
export const PRINCIPAL_COLUMNS = `
  u.id, u.name, u.role, u.status, u.permissions, u.assigned_committee_ids, u.all_committees,
  u.all_exams, u.allowed_exam_ids, u.must_change_password, u.token_version,
  COALESCE((SELECT jsonb_agg(DISTINCT c.committee_number) FROM committees c
            WHERE u.assigned_committee_ids ? c.id), '[]'::jsonb) AS assigned_numbers,
  -- Observers and ceremony sheikhs (committee_staff), once the committee is active: the «observing» shape older
  -- clients know (exam → the committee's paper, ceremony → its ceremony).
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'committeeId', s.committee_id,
                     'task', CASE s.role WHEN 'observer' THEN 'exam' ELSE 'ceremony' END, 'book', COALESCE(c.competition_book, '')))
            FROM committee_staff s JOIN committees c ON c.id = s.committee_id
            WHERE s.user_id = u.id AND s.status = 'active' AND s.role IN ('observer', 'ceremony_sheikh')
              AND c.lifecycle IN ('active', 'observed', 'accredited', 'ceremony_done')), '[]'::jsonb) AS observing,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'committeeId', s.committee_id, 'role', s.role,
                     'canAssign', s.can_assign, 'lifecycle', c.lifecycle))
            FROM committee_staff s JOIN committees c ON c.id = s.committee_id
            WHERE s.user_id = u.id AND s.status = 'active'), '[]'::jsonb) AS staff,
  -- Temporary head grants inside their dates. A grant with a «yes» ceremony lasts until the ceremony is done
  -- (the sweep in grants.ts ends it then); otherwise it ends on its last day.
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', g.id, 'committeeId', cid, 'decision', g.ceremony_decision))
            FROM committee_head_grants g, jsonb_array_elements_text(g.committee_ids) AS cid
            WHERE g.user_id = u.id AND g.status = 'active' AND g.starts_on <= CURRENT_DATE
              AND (g.ends_on >= CURRENT_DATE OR g.ceremony_decision = 'yes')), '[]'::jsonb) AS head_grants`;

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

export function toPrincipal(row: any): Principal {
  const numbers = Array.isArray(row.assigned_numbers) ? row.assigned_numbers : row.assigned_committees;
  return {
    id: row.id,
    name: row.name,
    role: row.role as Role,
    permissions: asStrings(row.permissions),
    assignedCommitteeIds: asStrings(row.assigned_committee_ids),
    allCommittees: Boolean(row.all_committees),
    assignedCommittees: Array.isArray(numbers)
      ? numbers.map(Number).filter((n: number) => Number.isFinite(n)).sort((a: number, b: number) => a - b)
      : [],
    allExams: Boolean(row.all_exams),
    allowedExamIds: asStrings(row.allowed_exam_ids),
    mustChangePassword: Boolean(row.must_change_password),
    observing: Array.isArray(row.observing) ? row.observing : [],
    headGrants: Array.isArray(row.head_grants) ? row.head_grants : [],
    staff: Array.isArray(row.staff) ? row.staff : [],
  };
}

export async function loadPrincipal(db: Queryable, userId: string): Promise<Principal | null> {
  const { rows } = await db.query(`SELECT ${PRINCIPAL_COLUMNS} FROM app_users u WHERE u.id = $1;`, [userId]);
  return rows[0] ? toPrincipal(rows[0]) : null;
}

// While a password change is required only these endpoints work.
const PASSWORD_CHANGE_ALLOWED = new Set(['/api/auth/me', '/api/auth/change-password', '/api/auth/logout']);

/**
 * Verifies the bearer token and loads the user (and session) from the database on every request,
 * so role changes, rejection, deletion and logout take effect immediately.
 */
export function authenticate(config: AppConfig, pool: Pool) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (!token) throw new HttpError(401, 'يتطلب تسجيل الدخول للوصول لهذه البيانات', 'unauthenticated');

      let claims: AccessClaims;
      try {
        claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as unknown as AccessClaims;
      } catch {
        throw new HttpError(401, 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى', 'token_expired');
      }

      const { rows } = await pool.query(
        `SELECT ${PRINCIPAL_COLUMNS}, s.revoked_at AS session_revoked, s.id AS session_found, s.impersonator_id AS session_impersonator
         FROM app_users u LEFT JOIN sessions s ON s.id = $2 AND s.user_id = u.id
         WHERE u.id = $1;`,
        [claims.sub, claims.sid ?? null]
      );
      const row = rows[0];
      const sessionValid = !claims.sid || (row?.session_found && !row.session_revoked);
      if (!row || row.status !== 'approved' || row.token_version !== claims.ver || !sessionValid) {
        throw new HttpError(401, 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى', 'session_revoked');
      }
      req.user = toPrincipal(row);
      req.sessionId = claims.sid;
      const path = `${req.baseUrl}${req.path}`.replace(/\/$/, '');
      if (claims.imp || row.session_impersonator) {
        // The session must be the one opened for this admin, who must still be an admin.
        if (!claims.imp || claims.imp !== row.session_impersonator) {
          throw new HttpError(401, 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى', 'session_revoked');
        }
        const { rows: admins } = await pool.query(
          `SELECT id, name, role FROM app_users WHERE id = $1 AND status = 'approved' AND role IN ('super_admin', 'admin');`,
          [claims.imp]
        );
        if (!admins[0]) throw new HttpError(401, 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى', 'session_revoked');
        req.user.impersonator = { id: admins[0].id, name: admins[0].name, role: admins[0].role };
        if (IMPERSONATION_BLOCKED.some((re) => re.test(path))) {
          throw new HttpError(403, 'غير متاح أثناء الدخول بعين مستخدم', 'impersonation_blocked');
        }
      }
      if (config.enforcePasswordChange && req.user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(path)) {
        throw new HttpError(403, 'يجب تغيير كلمة المرور قبل المتابعة', 'password_change_required');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Route guard: the authenticated user must be allowed to perform `action`. */
export function can(action: Action) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !isAllowed(req.user, action)) return next(forbidden());
    next();
  };
}

export function assertAllowed(user: Principal, action: Action) {
  if (!isAllowed(user, action)) throw forbidden();
}

export function assertCommitteeScope(user: Principal, committeeId: string | null | undefined) {
  if (!isCommitteeInScope(user, committeeId)) {
    throw forbidden('هذه اللجنة غير مسندة إليك');
  }
}
