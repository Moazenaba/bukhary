import { Router } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { can } from '../auth.ts';
import type { AppConfig } from '../config.ts';
import type { Pool } from '../db.ts';
import { HttpError, badRequest, route } from '../http.ts';
import { listMigrations, pendingMigrations } from '../migrate.ts';
import { isAllowed, type Principal } from '../policy.ts';

/**
 * What an admin's backup leaves out (a super admin's backup has everything): sign-in secrets,
 * sessions and device tokens, and the audit log, which only super admins may read.
 */
const SUPER_ONLY_TABLES = new Set(['sessions', 'refresh_tokens', 'idempotency_keys', 'login_failures', 'device_tokens', 'audit_logs', 'rate_limits']);
const fullBackup = (user: Principal) => isAllowed(user, 'users.admins');

export function auditLogsRouter(pool: Pool) {
  const r = Router();
  r.get('/', can('audit.read'), route(async (req, res) => {
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(500).default(100),
        before: z.string().datetime({ offset: true }).optional(),
        entity: z.string().max(50).optional(),
        entityId: z.string().max(255).optional(),
        /** Only what was done while an admin acted as another user. */
        impersonatedOnly: z.enum(['true', 'false']).optional(),
      })
      .parse(req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    // Admins read the log without what super admins did (themselves, or acting as someone).
    if (req.user!.role !== 'super_admin') {
      where.push(`user_role <> 'super_admin'`);
      where.push(`(impersonator_id IS NULL OR NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = impersonator_id AND a.role = 'super_admin'))`);
    }
    if (q.impersonatedOnly === 'true') where.push('impersonator_id IS NOT NULL');
    if (q.before) { params.push(q.before); where.push(`created_at < $${params.length}`); }
    if (q.entity) { params.push(q.entity); where.push(`entity = $${params.length}`); }
    if (q.entityId) { params.push(q.entityId); where.push(`entity_id = $${params.length}`); }
    params.push(q.limit);
    const { rows } = await pool.query(
      `SELECT id, user_name, user_role, actor_id, action, details, status, entity, entity_id, created_at, impersonator_id, impersonator_name
       FROM audit_logs ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY created_at DESC LIMIT $${params.length};`,
      params
    );
    res.json({
      success: true,
      logs: rows.map((l) => ({
        id: l.id,
        timestamp: l.created_at instanceof Date ? l.created_at.toISOString() : l.created_at,
        user: l.user_name,
        role: l.user_role,
        actorId: l.actor_id ?? undefined,
        action: l.action,
        details: l.details ?? '',
        status: l.status,
        entity: l.entity ?? undefined,
        entityId: l.entity_id ?? undefined,
        impersonatedBy: l.impersonator_name ?? undefined,
      })),
    });
  }));
  return r;
}

/** Real, measured database facts only (no hard-coded claims about TLS or backups). */
export function databaseRouter(pool: Pool) {
  const r = Router();
  r.get('/status', can('database.admin'), route(async (_req, res) => {
    const start = Date.now();
    const { rows: info } = await pool.query(
      `SELECT NOW() AS now, current_database() AS db, version() AS version,
              (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl,
              (SELECT version FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl_version;`
    );
    const latencyMs = Date.now() - start;
    // Estimated row counts from statistics: one cheap catalog query instead of COUNT(*) per table.
    const { rows: tables } = await pool.query(
      `SELECT relname AS name, n_live_tup::bigint AS count FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY relname;`
    );
    const pending = await pendingMigrations(pool);
    res.json({
      success: true,
      status: 'connected',
      database: info[0].db,
      postgresVersion: String(info[0].version).split(',')[0],
      serverTime: info[0].now,
      latencyMs,
      tls: info[0].ssl ? info[0].ssl_version : 'none',
      migrations: { total: listMigrations().length, pending: pending.map((m) => m.name) },
      tables: tables.map((t) => ({ name: t.name, count: Number(t.count) })),
      tablesCount: tables.length,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  }));

  // ---- Full backup (admins and super admins). The browser fetches every table in pages and writes them into
  // one SQLite .db file itself: a single response this size would exceed the host's limit.

  /** Every table in the public schema with its columns (name, Postgres type) in order. */
  async function backupTables() {
    const { rows } = await pool.query(
      `SELECT c.table_name, c.column_name, c.data_type
       FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
       WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
       ORDER BY c.table_name, c.ordinal_position;`
    );
    const tables = new Map<string, { name: string; type: string }[]>();
    for (const row of rows) {
      if (!tables.has(row.table_name)) tables.set(row.table_name, []);
      tables.get(row.table_name)!.push({ name: row.column_name, type: row.data_type });
    }
    return tables;
  }
  const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

  r.get('/backup/tables', can('database.backup'), route(async (req, res) => {
    const tables = await backupTables();
    if (!fullBackup(req.user!)) for (const t of SUPER_ONLY_TABLES) tables.delete(t);
    const { rows: counts } = await pool.query(
      `SELECT relname AS name, n_live_tup::bigint AS count FROM pg_stat_user_tables WHERE schemaname = 'public';`
    );
    const estimate = new Map(counts.map((c) => [c.name, Number(c.count)]));
    res.json({
      success: true,
      tables: [...tables].map(([name, columns]) => ({ name, columns, estimatedRows: estimate.get(name) ?? 0 })),
    });
  }));

  r.get('/backup/rows', can('database.backup'), route(async (req, res) => {
    const q = z
      .object({
        table: z.string().max(200),
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(1000).default(500),
      })
      .parse(req.query);
    const columns = (await backupTables()).get(q.table);
    const full = fullBackup(req.user!);
    // Only real table names are ever put into the query.
    if (!columns || (!full && SUPER_ONLY_TABLES.has(q.table))) throw badRequest('جدول غير معروف');
    // Admins never see admin accounts (canSeeRole), nor anyone's password hash.
    const hideAdmins = !full && q.table === 'app_users';
    const { rows } = await pool.query(
      `SELECT * FROM ${quoteIdent(q.table)} ${hideAdmins ? "WHERE role NOT IN ('super_admin', 'admin')" : ''} ORDER BY ctid LIMIT $1 OFFSET $2;`,
      [q.limit, q.offset]
    );
    if (!full && q.table === 'app_users') for (const row of rows) row.password = null;
    // JSON-safe values: binary as base64, dates as ISO text, JSON columns as text.
    const out = rows.map((row) =>
      columns.map(({ name }) => {
        const v = row[name];
        if (v === null || v === undefined) return null;
        if (Buffer.isBuffer(v)) return { b64: v.toString('base64') };
        if (v instanceof Date) return v.toISOString();
        if (typeof v === 'object') return JSON.stringify(v);
        if (typeof v === 'boolean') return v ? 1 : 0;
        return v;
      })
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, rows: out });
  }));
  return r;
}

const OCR_ROW = {
  type: Type.OBJECT,
  properties: {
    number: { type: Type.INTEGER },
    sheikh_name: { type: Type.STRING },
    place: { type: Type.STRING },
    book: { type: Type.STRING },
    students_count: { type: Type.INTEGER },
    delivered: { type: Type.BOOLEAN },
    corrected: { type: Type.BOOLEAN },
    reviewed: { type: Type.BOOLEAN },
    announced: { type: Type.BOOLEAN },
    ceremony: { type: Type.BOOLEAN },
    notes: { type: Type.STRING },
  },
  required: ['number', 'sheikh_name'],
};

export function ocrRouter(config: AppConfig) {
  const r = Router();
  const ai = config.geminiApiKey ? new GoogleGenAI({ apiKey: config.geminiApiKey }) : null;

  r.post('/', can('ocr.use'), route(async (req, res) => {
    if (!ai) throw new HttpError(503, 'خدمة استخراج الجداول غير مفعلة على هذا الخادم', 'ocr_disabled');
    const { imageBase64, mimeType } = z
      .object({
        imageBase64: z.string().min(100).max(14_000_000),
        mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
      })
      .parse(req.body);
    const data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    const response = await ai.models.generateContent({
      model: config.geminiModel,
      contents: [
        { inlineData: { data, mimeType } },
        'استخرج من صورة الكشف (مكتوب بخط اليد أو مطبوع) صفوف اللجان: رقم اللجنة، اسم الشيخ، المكان، الكتاب، عدد الطلاب، وحالة مراحل الإنجاز (delivered, corrected, reviewed, announced, ceremony) وأي ملاحظات. لا تخترع قيماً غير موجودة في الصورة.',
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: { type: Type.OBJECT, properties: { rows: { type: Type.ARRAY, items: OCR_ROW } }, required: ['rows'] },
        abortSignal: AbortSignal.timeout(60_000),
      },
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.text || '');
    } catch {
      throw badRequest('تعذر قراءة الجدول من الصورة، جرّب صورة أوضح');
    }
    const rows = z.object({ rows: z.array(z.record(z.string(), z.unknown())).max(2000) }).safeParse(parsed);
    if (!rows.success) throw badRequest('تعذر قراءة الجدول من الصورة، جرّب صورة أوضح');
    res.json({ success: true, data: rows.data });
  }));
  return r;
}
