import { Router } from 'express';
import { z } from 'zod';
import { can } from '../auth.ts';
import { audit } from '../audit.ts';
import type { Pool, Queryable } from '../db.ts';
import { badRequest, route } from '../http.ts';

// Shared settings kept in system_settings. Only the keys below exist; each has a default and a
// check, so a setting can never hold something the screens cannot handle.
export const SETTINGS = {
  /** Hours before an exam's opening time that its paper may be downloaded. */
  exam_open_hours_before: { schema: z.coerce.number().int().min(0).max(720), fallback: 24 },
  /** Exam observers offered when staffing a committee (names only, not accounts). */
  observers: { schema: z.array(z.string().trim().min(1).max(200)).max(500), fallback: [] as string[] },
  /** Sheikhs offered when choosing who attends a ceremony (names only). */
  ceremony_sheikhs: { schema: z.array(z.string().trim().min(1).max(200)).max(500), fallback: [] as string[] },
  /** Days a stage may wait before the committee shows as late. */
  overdue_days: { schema: z.coerce.number().int().min(1).max(90), fallback: 3 },
  /** The website's font. */
  font_family: { schema: z.enum(['cairo', 'tajawal', 'ibm-plex-sans-arabic', 'noto-naskh-arabic']), fallback: 'ibm-plex-sans-arabic' },
} as const;
export type SettingKey = keyof typeof SETTINGS;
const isKey = (k: string): k is SettingKey => Object.prototype.hasOwnProperty.call(SETTINGS, k);

export async function getSetting<K extends SettingKey>(db: Queryable, key: K): Promise<z.infer<(typeof SETTINGS)[K]['schema']>> {
  const { rows } = await db.query('SELECT value FROM system_settings WHERE key = $1;', [key]);
  const parsed = SETTINGS[key].schema.safeParse(rows[0]?.value);
  return (parsed.success ? parsed.data : SETTINGS[key].fallback) as any;
}

export async function allSettings(db: Queryable) {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(SETTINGS) as SettingKey[]) out[k] = await getSetting(db, k);
  return out;
}

export function systemSettingsRouter(pool: Pool) {
  const r = Router();

  // Every signed-in user reads them (the font and the observer names are used by every screen).
  r.get('/', route(async (_req, res) => {
    res.json({ success: true, settings: await allSettings(pool) });
  }));

  r.put('/:key', can('settings.write'), route(async (req, res) => {
    const key = req.params.key;
    if (!isKey(key)) throw badRequest('إعداد غير معروف');
    const value = SETTINGS[key].schema.parse(req.body?.value);
    const before = await getSetting(pool, key);
    await pool.query(
      `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
      [key, JSON.stringify(value)]
    );
    await audit(pool, req, 'settings.update', 'setting', key, { value: before }, { value });
    res.json({ success: true, key, value });
  }));

  return r;
}
