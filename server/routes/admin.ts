import { Router } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { can } from '../auth.ts';
import type { AppConfig } from '../config.ts';
import type { Pool } from '../db.ts';
import { HttpError, badRequest, route } from '../http.ts';
import { listMigrations, pendingMigrations } from '../migrate.ts';

export function auditLogsRouter(pool: Pool) {
  const r = Router();
  r.get('/', can('audit.read'), route(async (req, res) => {
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(500).default(100),
        before: z.string().datetime({ offset: true }).optional(),
        entity: z.string().max(50).optional(),
        entityId: z.string().max(255).optional(),
      })
      .parse(req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.before) { params.push(q.before); where.push(`created_at < $${params.length}`); }
    if (q.entity) { params.push(q.entity); where.push(`entity = $${params.length}`); }
    if (q.entityId) { params.push(q.entityId); where.push(`entity_id = $${params.length}`); }
    params.push(q.limit);
    const { rows } = await pool.query(
      `SELECT id, user_name, user_role, actor_id, action, details, status, entity, entity_id, created_at
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
      `SELECT relname AS name, n_live_tup::bigint AS count FROM pg_stat_user_tables ORDER BY relname;`
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
  const limiter = rateLimit({ windowMs: 60 * 60_000, limit: config.nodeEnv === 'test' ? 1000 : 30, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => req.user?.id ?? 'anon', message: { success: false, message: 'تم تجاوز الحد المسموح لاستخراج الجداول، حاول لاحقاً' } });
  const ai = config.geminiApiKey ? new GoogleGenAI({ apiKey: config.geminiApiKey }) : null;

  r.post('/', can('ocr.use'), limiter, route(async (req, res) => {
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
    const rows = z.object({ rows: z.array(z.record(z.unknown())).max(2000) }).safeParse(parsed);
    if (!rows.success) throw badRequest('تعذر قراءة الجدول من الصورة، جرّب صورة أوضح');
    res.json({ success: true, data: rows.data });
  }));
  return r;
}
