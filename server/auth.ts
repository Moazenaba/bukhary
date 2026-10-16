import type { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { AppConfig } from './config.ts';
import type { Pool, Queryable } from './db.ts';
import { HttpError, forbidden } from './http.ts';
import { type Action, type Principal, type Role, isAllowed, isCommitteeInScope } from './policy.ts';

declare module 'express-serve-static-core' {
  interface Request {
    user?: Principal;
  }
}

interface AccessClaims {
  sub: string;
  ver: number;
}

export function signAccessToken(config: AppConfig, userId: string, tokenVersion: number): string {
  return jwt.sign({ ver: tokenVersion } satisfies Omit<AccessClaims, 'sub'>, config.jwtSecret, {
    subject: userId,
    expiresIn: config.accessTokenTtl as any,
    algorithm: 'HS256',
  });
}

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/** Issues an opaque refresh token "<id>.<secret>"; only the hash is stored. */
export async function issueRefreshToken(db: Queryable, config: AppConfig, userId: string, userAgent?: string): Promise<string> {
  const id = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, NOW() + make_interval(days => $4), $5);`,
    [id, userId, sha256(secret), config.refreshTokenTtlDays, userAgent?.slice(0, 300) ?? null]
  );
  return `${id}.${secret}`;
}

/** Validates and revokes a refresh token (rotation). Returns its user id. */
export async function consumeRefreshToken(db: Queryable, token: string): Promise<string> {
  const [id, secret] = String(token).split('.');
  if (!id || !secret) throw new HttpError(401, 'جلسة غير صالحة، يرجى تسجيل الدخول', 'invalid_refresh');
  const { rows } = await db.query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE id = $1 AND token_hash = $2 AND revoked_at IS NULL AND expires_at > NOW()
     RETURNING user_id;`,
    [id, sha256(secret)]
  );
  if (rows.length === 0) throw new HttpError(401, 'انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى', 'invalid_refresh');
  return rows[0].user_id;
}

export function toPrincipal(row: any): Principal {
  return {
    id: row.id,
    name: row.name,
    role: row.role as Role,
    permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [],
    assignedCommittees: Array.isArray(row.assigned_committees)
      ? row.assigned_committees.map(Number).filter((n: number) => Number.isFinite(n))
      : [],
  };
}

/**
 * Verifies the bearer token and loads the user from the database on every request,
 * so role changes, rejection and deletion take effect immediately.
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
        `SELECT id, name, role, status, permissions, assigned_committees, token_version
         FROM app_users WHERE id = $1;`,
        [claims.sub]
      );
      const row = rows[0];
      if (!row || row.status !== 'approved' || row.token_version !== claims.ver) {
        throw new HttpError(401, 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى', 'session_revoked');
      }
      req.user = toPrincipal(row);
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

export function assertCommitteeScope(user: Principal, committeeNumber: number | null | undefined) {
  if (!isCommitteeInScope(user, committeeNumber)) {
    throw forbidden('هذه اللجنة غير مسندة إليك');
  }
}
