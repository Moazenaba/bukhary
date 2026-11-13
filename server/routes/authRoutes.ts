import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
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
import { normalizePhone, optionalText, toAsciiDigits } from '../schemas.ts';
import { emailSchema, passwordSchema, phoneSchema, userFromRow } from './users.ts';
import { notify } from './notifications.ts';
import { JOIN_LIMIT, LOGIN_LIMIT, assertNotBlocked, clearAttempts, countAttempt } from '../rateLimit.ts';

// Hash of a random string, compared when the account does not exist so that
// "unknown user" and "wrong password" take the same time.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);
// One message for unknown account and wrong password, so the response never tells whether an
// account exists (API-22).
const INVALID_LOGIN = 'بيانات الدخول غير صحيحة';

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
  // Everyone joins as a sheikh; an admin promotes them. Older clients still send their old role names.
  roleKey: z.string().max(50).optional().transform((): 'sheikh' => 'sheikh'),
  password: passwordSchema,
  notes: optionalText(2000),
  whatsapp: optionalText(50),
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

  /** Sends the session to the client: refresh token in an HttpOnly cookie for the web, in the body otherwise. */
  async function sendSession(req: Request, res: Response, userRow: any, sessionId: string, status = 200) {
    const token = signAccessToken(config, userRow.id, userRow.token_version, sessionId);
    const refreshToken = await issueRefreshToken(pool, config, userRow.id, sessionId, req.headers['user-agent']);
    const principal = await loadPrincipal(pool, userRow.id);
    const body: Record<string, unknown> = {
      success: true,
      token,
      user: userFromRow(userRow),
      mustChangePassword: Boolean(userRow.must_change_password),
      permissions: principal ? evaluatedPermissions(principal) : undefined,
    };
    if (isWebClient(req)) setRefreshCookie(res, config, refreshToken);
    else body.refreshToken = refreshToken;
    res.status(status).json(body);
  }

  r.post('/login', route(async (req, res) => {
    const { identifier: raw, password } = loginInput.parse(req.body);
    // Too many wrong passwords from this address: a two-minute wait (no account is locked).
    const limitKey = `login:${req.ip}`;
    await assertNotBlocked(pool, limitKey, LOGIN_LIMIT, res);
    // Phones are stored in one form (normalizePhone); an older row may still hold the form typed.
    const identifier = toAsciiDigits(raw).trim();
    const isPhone = /^\+?[\d\s\-()]+$/.test(identifier);
    const ident = isPhone ? normalizePhone(identifier) : identifier;
    const typed = isPhone ? identifier.replace(/[\s\-()]/g, '') : identifier;
    // Rows saved before migration 014 that could not be rewritten keep an international form.
    const forms = [typed, ident];
    if (isPhone && /^01\d{9}$/.test(ident)) forms.push(`+2${ident}`, `002${ident}`, `2${ident}`);
    const { rows } = await pool.query(
      `SELECT u.* FROM app_users u
       WHERE u.phone = ANY($2::text[]) OR lower(u.email) = lower($1)
       ORDER BY (u.phone = $2[1]) DESC, (u.phone = $1) DESC LIMIT 1;`,
      [ident, forms]
    );
    const user = rows[0];

    // No limit on attempts: a wrong password is only recorded. The hash is always compared, so an
    // unknown account takes the same time.
    const ok = await bcrypt.compare(password, user?.password || DUMMY_HASH);
    if (!user || !user.password || !ok) {
      await countAttempt(pool, limitKey, LOGIN_LIMIT);
      if (user) await securityEvent(pool, req, 'auth.login_failed', user.id, 'wrong password');
      else await securityEvent(pool, req, 'auth.login_failed', null, `unknown identifier ${ident.slice(0, 3)}…`);
      throw new HttpError(401, INVALID_LOGIN, 'invalid_credentials');
    }
    await clearAttempts(pool, limitKey);
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

  r.post('/refresh', route(async (req, res) => {
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
    const body = z.object({ refreshToken: z.string().max(500).optional(), deviceToken: z.string().max(4096).optional() }).parse(req.body ?? {});
    const token = body.refreshToken ?? (isWebClient(req) ? readCookie(req, REFRESH_COOKIE) : undefined);
    // The phone stops receiving this account's push notifications.
    if (body.deviceToken) await pool.query('DELETE FROM device_tokens WHERE token = $1;', [body.deviceToken]);
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

  r.post('/register', route(async (req, res) => {
    const joinKey = `register:${req.ip}`;
    await assertNotBlocked(pool, joinKey, JOIN_LIMIT, res);
    const input = registerInput.parse(req.body);
    await countAttempt(pool, joinKey, JOIN_LIMIT);
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
      if (err.code !== '23505') throw err;
      // One answer whatever the state of the existing account, so this public form never tells a
      // stranger whether a phone number has an account (it used to say pending/active/rejected).
      throw new HttpError(
        409,
        'لا يمكن إرسال طلب جديد بهذا الرقم أو البريد. لو عندك حساب سجّل الدخول، أو تابع طلبك برقم الطلب، أو تواصل مع المشرف.',
        'join_request_exists'
      );
    }
    await audit(pool, req, 'user.register', 'user', id, null, { name, role: roleKey, requestCode });
    // Admins are told at once, in the app and on their phones.
    const { rows: admins } = await pool.query("SELECT id FROM app_users WHERE role IN ('super_admin', 'admin') AND status = 'approved';");
    for (const admin of admins) {
      // One unread «طلبات انضمام جديدة» notification per admin that keeps counting, instead of one
      // notification (and one phone alert) per request.
      const { rows: open } = await pool.query(
        `SELECT n.id, n.data FROM notifications n
         WHERE n.target_user_id = $1 AND n.data->>'kind' = 'join_requests'
           AND NOT EXISTS (SELECT 1 FROM notification_reads r WHERE r.notification_id = n.id AND r.user_id = $1)
         ORDER BY n.created_at DESC LIMIT 1;`,
        [admin.id]
      );
      if (open[0]) {
        const count = Number(open[0].data?.count ?? 1) + 1;
        await pool.query(
          `UPDATE notifications SET title = $2, description = $3, data = jsonb_set(data, '{count}', to_jsonb($4::int)) WHERE id = $1;`,
          [open[0].id, `طلبات انضمام جديدة (${count})`, `آخرها: ${name}`, count]
        );
      } else {
        await notify(pool, { title: 'طلب انضمام جديد', description: name, type: 'info', targetUserId: admin.id, data: { kind: 'join_requests', count: 1 } });
      }
    }
    res.status(201).json({ success: true, requestCode, message: 'تم تسجيل طلب الانضمام وهو الآن قيد المراجعة' });
  }));

  // Public tracking by request code. Returns only the status, nothing personal.
  r.get('/join-status/:code', route(async (req, res) => {
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
      user: userFromRow(rows[0]),
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
