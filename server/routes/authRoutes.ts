import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate, consumeRefreshToken, issueRefreshToken, signAccessToken, toPrincipal } from '../auth.ts';
import { audit } from '../audit.ts';
import type { AppConfig } from '../config.ts';
import { type Pool, withTransaction } from '../db.ts';
import { HttpError, conflict, route } from '../http.ts';
import { evaluatedPermissions } from '../policy.ts';
import { optionalText, toAsciiDigits } from '../schemas.ts';
import { emailSchema, passwordSchema, phoneSchema, userFromRow } from './users.ts';

// Hash of a random string, compared when the account does not exist so that
// "unknown user" and "wrong password" take the same time.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);
const INVALID_LOGIN = 'بيانات الدخول غير صحيحة';

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

  async function issueSession(userRow: any, userAgent?: string) {
    const token = signAccessToken(config, userRow.id, userRow.token_version);
    const refreshToken = await issueRefreshToken(pool, config, userRow.id, userAgent);
    return { token, refreshToken, user: userFromRow(userRow, { includeIdentity: true }) };
  }

  r.post('/login', loginLimiter, route(async (req, res) => {
    const { identifier: raw, password } = loginInput.parse(req.body);
    // Phone numbers are stored with ASCII digits and without spaces or dashes.
    const identifier = toAsciiDigits(raw);
    const ident = /^\+?[\d\s-]+$/.test(identifier) ? identifier.replace(/[\s-]/g, '') : identifier;
    const { rows } = await pool.query(
      `SELECT * FROM app_users
       WHERE phone = $1 OR lower(email) = lower($1)
       ORDER BY (phone = $1) DESC LIMIT 1;`,
      [ident]
    );
    const user = rows[0];

    if (user?.locked_until && new Date(user.locked_until) > new Date()) {
      throw new HttpError(429, 'تم إيقاف تسجيل الدخول لهذا الحساب مؤقتاً بسبب محاولات فاشلة متكررة. حاول لاحقاً.', 'locked');
    }

    const ok = await bcrypt.compare(password, user?.password || DUMMY_HASH);
    if (!user || !user.password || !ok) {
      if (user) {
        await pool.query(
          `UPDATE app_users SET
             failed_login_count = failed_login_count + 1,
             locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN NOW() + make_interval(mins => $3) ELSE locked_until END
           WHERE id = $1;`,
          [user.id, config.maxLoginAttempts, config.lockoutMinutes]
        );
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
    res.json({ success: true, ...(await issueSession(user, req.headers['user-agent'])) });
  }));

  r.post('/refresh', loginLimiter, route(async (req, res) => {
    const { refreshToken } = z.object({ refreshToken: z.string().min(10).max(500) }).parse(req.body);
    const userId = await consumeRefreshToken(pool, refreshToken);
    const { rows } = await pool.query('SELECT * FROM app_users WHERE id = $1;', [userId]);
    if (!rows[0] || rows[0].status !== 'approved') throw new HttpError(401, 'انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى', 'invalid_refresh');
    res.json({ success: true, ...(await issueSession(rows[0], req.headers['user-agent'])) });
  }));

  r.post('/logout', route(async (req, res) => {
    const token = z.object({ refreshToken: z.string().max(500).optional() }).parse(req.body ?? {}).refreshToken;
    if (token) await consumeRefreshToken(pool, token).catch(() => undefined);
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
    res.json({ success: true, user: userFromRow(rows[0], { includeIdentity: true }), permissions: evaluatedPermissions(toPrincipal(rows[0])) });
  }));

  r.post('/change-password', authed, route(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
      .parse(req.body);
    const session = await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM app_users WHERE id = $1 FOR UPDATE;', [req.user!.id]);
      const user = rows[0];
      if (!(await bcrypt.compare(currentPassword, user.password || DUMMY_HASH))) {
        throw new HttpError(400, 'كلمة المرور الحالية غير صحيحة', 'wrong_password');
      }
      const { rows: updated } = await db.query(
        `UPDATE app_users SET password = $2, password_changed_at = NOW(), token_version = token_version + 1
         WHERE id = $1 RETURNING *;`,
        [user.id, await bcrypt.hash(newPassword, 12)]
      );
      await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL;', [user.id]);
      await audit(db, req, 'user.change_password', 'user', user.id, null, null);
      return updated[0];
    });
    res.json({ success: true, ...(await issueSession(session, req.headers['user-agent'])) });
  }));

  return r;
}
