import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  authenticate,
  createSession,
  issueRefreshToken,
  loadPrincipal,
  revokeAllSessions,
  revokeSession,
  rotateRefreshToken,
  signAccessToken,
} from '../auth.ts';
import { audit } from '../audit.ts';
import type { AppConfig } from '../config.ts';
import { type Pool, type Queryable, withTransaction } from '../db.ts';
import { HttpError, conflict, route } from '../http.ts';
import { evaluatedPermissions } from '../policy.ts';
import { optionalText, toAsciiDigits } from '../schemas.ts';
import { emailSchema, passwordSchema, phoneSchema, userFromRow } from './users.ts';

// Hash of a random string, compared when the account does not exist so that
// "unknown user" and "wrong password" take the same time.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);
// One message for unknown account, wrong password and temporarily locked account, so the
// response never tells whether an account exists (API-22).
const INVALID_LOGIN = 'بيانات الدخول غير صحيحة، أو أن الحساب موقوف مؤقتاً بسبب محاولات متكررة';

// The web keeps its refresh token in this HttpOnly cookie; page scripts cannot read it (WEB-11).
export const REFRESH_COOKIE = 'bukhari_rt';
const COOKIE_PATH = '/api/auth';

const loginInput = z.object({
  identifier: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(128),
});

const registerInput = z.object({
  name: z.string().trim().min(2, 'الاسم مطلوب').max(200),
  phone: phoneSchema,
  email: emailSchema,
  roleKey: z.enum(['committee_head', 'teacher', 'assistant', 'auditor']).catch('assistant'),
  password: passwordSchema,
  notes: optionalText(2000),
  whatsapp: optionalText(50),
  nationalId: optionalText(50),
  quranLevel: optionalText(500),
  qualification: optionalText(500),
  experience: optionalText(2000),
  availability: optionalText(500),
  preferredCommittees: z.array(z.coerce.number().int()).max(100).optional(),
});

function newRequestCode(): string {
  return `REQ-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * The web client identifies itself with `X-Client: web`. A custom header cannot be sent
 * cross-site without a CORS preflight (which this API never grants), so it also protects the
 * cookie-based refresh against CSRF, together with SameSite=Strict.
 */
const isWebClient = (req: Request) => req.get('X-Client') === 'web';

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function setRefreshCookie(res: Response, config: AppConfig, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
    path: COOKIE_PATH,
    maxAge: config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response, config: AppConfig) {
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: config.isProduction, sameSite: 'strict', path: COOKIE_PATH });
}

/** Security events go to the audit log with the request's IP; the password is never recorded. */
async function securityEvent(db: Queryable, req: Request, action: string, userId: string | null, details: string) {
  await audit(db, req, action, 'auth', userId, null, null, details).catch(() => undefined);
}

export function authRouter(config: AppConfig, pool: Pool) {
  const r = Router();
  const isTest = config.nodeEnv === 'test';
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: isTest ? 1000 : 30, standardHeaders: true, legacyHeaders: false,
    message: { success: false, message: 'محاولات كثيرة، يرجى المحاولة لاحقاً' } });
  const registerLimiter = rateLimit({ windowMs: 60 * 60_000, limit: isTest ? 1000 : 10, standardHeaders: true, legacyHeaders: false,
    message: { success: false, message: 'طلبات كثيرة، يرجى المحاولة لاحقاً' } });
  // Tracking has its own budget, so checking a request never uses up the registration limit.
  const trackLimiter = rateLimit({ windowMs: 15 * 60_000, limit: isTest ? 1000 : 30, standardHeaders: true, legacyHeaders: false,
    message: { success: false, message: 'محاولات استعلام كثيرة، يرجى المحاولة لاحقاً' } });

  /** Sends the session to the client: refresh token in an HttpOnly cookie for the web, in the body otherwise. */
  async function sendSession(req: Request, res: Response, userRow: any, sessionId: string, status = 200) {
    const token = signAccessToken(config, userRow.id, userRow.token_version, sessionId);
    const refreshToken = await issueRefreshToken(pool, config, userRow.id, sessionId, req.headers['user-agent']);
    const principal = await loadPrincipal(pool, userRow.id);
    const body: Record<string, unknown> = {
      success: true,
      token,
      user: userFromRow(userRow, { includeIdentity: true }),
      mustChangePassword: Boolean(userRow.must_change_password),
      permissions: principal ? evaluatedPermissions(principal) : undefined,
    };
    if (isWebClient(req)) setRefreshCookie(res, config, refreshToken);
    else body.refreshToken = refreshToken;
    res.status(status).json(body);
  }

  r.post('/login', loginLimiter, route(async (req, res) => {
    const { identifier: raw, password } = loginInput.parse(req.body);
    // Phone numbers are stored with ASCII digits and without spaces or dashes.
    const identifier = toAsciiDigits(raw);
    const ident = /^\+?[\d\s-]+$/.test(identifier) ? identifier.replace(/[\s-]/g, '') : identifier;
    const { rows } = await pool.query(
      `SELECT *, (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked,
              (locked_until IS NOT NULL AND locked_until <= NOW()) AS lock_expired
       FROM app_users
       WHERE phone = $1 OR lower(email) = lower($1)
       ORDER BY (phone = $1) DESC LIMIT 1;`,
      [ident]
    );
    const user = rows[0];

    // The hash is always compared, so a locked or unknown account takes the same time.
    const ok = await bcrypt.compare(password, user?.password || DUMMY_HASH);
    if (!user || !user.password || !ok || user.is_locked) {
      if (user && !user.is_locked) {
        // A lock that has run out starts a fresh count instead of re-locking on the next mistake.
        const { rows: after } = await pool.query(
          `UPDATE app_users SET
             failed_login_count = CASE WHEN $4 THEN 1 ELSE failed_login_count + 1 END,
             locked_until = CASE WHEN (CASE WHEN $4 THEN 1 ELSE failed_login_count + 1 END) >= $2
                                 THEN NOW() + make_interval(mins => $3) ELSE NULL END
           WHERE id = $1 RETURNING locked_until;`,
          [user.id, config.maxLoginAttempts, config.lockoutMinutes, Boolean(user.lock_expired)]
        );
        await securityEvent(pool, req, after[0]?.locked_until ? 'auth.locked' : 'auth.login_failed', user.id, 'wrong password');
      } else if (user?.is_locked) {
        await securityEvent(pool, req, 'auth.login_failed', user.id, 'account locked');
      } else {
        await securityEvent(pool, req, 'auth.login_failed', null, `unknown identifier ${ident.slice(0, 3)}…`);
      }
      throw new HttpError(401, INVALID_LOGIN, 'invalid_credentials');
    }

    await pool.query('UPDATE app_users SET failed_login_count = 0, locked_until = NULL WHERE id = $1;', [user.id]);
    // Status is revealed only after the password is proven.
    if (user.status !== 'approved') {
      const message =
        user.status === 'rejected'
          ? 'تم الاعتذار عن قبول طلب الانضمام لهذا الحساب'
          : 'الحساب قيد المراجعة من المشرف العام ولم يتم تفعيله بعد';
      throw new HttpError(403, message, `account_${user.status}`);
    }
    const sessionId = await createSession(pool, user.id, req.headers['user-agent']);
    await securityEvent(pool, req, 'auth.login', user.id, '');
    await sendSession(req, res, user, sessionId);
  }));

  r.post('/refresh', loginLimiter, route(async (req, res) => {
    const body = z.object({ refreshToken: z.string().min(10).max(500).optional() }).parse(req.body ?? {});
    const fromCookie = !body.refreshToken && isWebClient(req) ? readCookie(req, REFRESH_COOKIE) : undefined;
    const token = body.refreshToken ?? fromCookie;
    if (!token) throw new HttpError(401, 'انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى', 'invalid_refresh');
    try {
      // Not in a transaction: when reuse is detected the session revocation must stick even though
      // the request fails.
      const { userId, sessionId } = await rotateRefreshToken(pool, token, { allowGrace: Boolean(fromCookie) });
      const { rows } = await pool.query('SELECT * FROM app_users WHERE id = $1;', [userId]);
      if (!rows[0] || rows[0].status !== 'approved') throw new HttpError(401, 'انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى', 'invalid_refresh');
      await sendSession(req, res, rows[0], sessionId);
    } catch (err) {
      if (err instanceof HttpError && err.code === 'invalid_refresh') {
        if (fromCookie) clearRefreshCookie(res, config);
        await securityEvent(pool, req, 'auth.refresh_failed', null, '');
      }
      throw err;
    }
  }));

  // Ends the session immediately: its access tokens stop working and its refresh tokens are revoked.
  r.post('/logout', route(async (req, res) => {
    const body = z.object({ refreshToken: z.string().max(500).optional() }).parse(req.body ?? {});
    const token = body.refreshToken ?? (isWebClient(req) ? readCookie(req, REFRESH_COOKIE) : undefined);
    const sessions = new Set<string>();
    if (token) {
      const [id] = String(token).split('.');
      const { rows } = await pool.query('SELECT session_id FROM refresh_tokens WHERE id = $1;', [id]);
      if (rows[0]) sessions.add(rows[0].session_id);
    }
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      try {
        const claims = jwt.verify(header.slice(7), config.jwtSecret, { algorithms: ['HS256'], ignoreExpiration: true }) as any;
        if (claims?.sid) sessions.add(claims.sid);
      } catch {
        // A bad token simply has no session to end.
      }
    }
    for (const sid of sessions) await revokeSession(pool, sid, 'logout');
    clearRefreshCookie(res, config);
    res.json({ success: true });
  }));

  r.post('/register', registerLimiter, route(async (req, res) => {
    const input = registerInput.parse(req.body);
    const id = `usr_${crypto.randomUUID()}`;
    const requestCode = newRequestCode();
    const { name, phone, email, roleKey, password, notes, ...profile } = input;
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      await pool.query(
        `INSERT INTO app_users (id, name, phone, email, password, role, status, assigned_committees, permissions,
           notes, created_at, request_code, data, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'pending','[]'::jsonb,'[]'::jsonb,$7,$8,$9,$10,NOW());`,
        [id, name, phone, email, passwordHash, roleKey, notes, new Date().toISOString(), requestCode, JSON.stringify(profile)]
      );
    } catch (err: any) {
      if (err.code === '23505') throw conflict('يوجد حساب مسجل بنفس رقم الهاتف أو البريد الإلكتروني');
      throw err;
    }
    await audit(pool, req, 'user.register', 'user', id, null, { name, role: roleKey, requestCode });
    res.status(201).json({ success: true, requestCode, message: 'تم تسجيل طلب الانضمام وهو الآن قيد المراجعة' });
  }));

  // Public tracking by request code. Returns only the status, nothing personal.
  r.get('/join-status/:code', trackLimiter, route(async (req, res) => {
    const code = z.string().max(40).parse(req.params.code);
    const { rows } = await pool.query('SELECT status, data FROM app_users WHERE request_code = $1;', [code]);
    if (!rows[0]) throw new HttpError(404, 'لم يتم العثور على طلب بهذا الرقم', 'not_found');
    res.json({ success: true, status: rows[0].status, interviewDate: rows[0].data?.interviewDate ?? undefined });
  }));

  const authed = authenticate(config, pool);

  r.get('/me', authed, route(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM app_users WHERE id = $1;', [req.user!.id]);
    res.json({
      success: true,
      user: userFromRow(rows[0], { includeIdentity: true }),
      permissions: evaluatedPermissions(req.user!),
      mustChangePassword: req.user!.mustChangePassword,
    });
  }));

  r.post('/change-password', authed, route(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
      .parse(req.body);
    const { user, sessionId } = await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM app_users WHERE id = $1 FOR UPDATE;', [req.user!.id]);
      const current = rows[0];
      if (!(await bcrypt.compare(currentPassword, current.password || DUMMY_HASH))) {
        throw new HttpError(400, 'كلمة المرور الحالية غير صحيحة', 'wrong_password');
      }
      if (await bcrypt.compare(newPassword, current.password || DUMMY_HASH)) {
        throw new HttpError(400, 'كلمة المرور الجديدة يجب أن تختلف عن الحالية', 'same_password');
      }
      const { rows: updated } = await db.query(
        `UPDATE app_users SET password = $2, password_changed_at = NOW(), token_version = token_version + 1,
           must_change_password = false
         WHERE id = $1 RETURNING *;`,
        [current.id, await bcrypt.hash(newPassword, 12)]
      );
      await revokeAllSessions(db, current.id, 'password_change');
      await audit(db, req, 'user.change_password', 'user', current.id, null, null);
      return { user: updated[0], sessionId: await createSession(db, current.id, req.headers['user-agent']) };
    });
    await sendSession(req, res, user, sessionId);
  }));

  return r;
}
