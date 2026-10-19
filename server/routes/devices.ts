import { Router } from 'express';
import { z } from 'zod';
import type { Pool } from '../db.ts';
import { route } from '../http.ts';

const tokenInput = z.object({
  token: z.string().trim().min(10).max(4096),
  platform: z.enum(['android', 'ios', 'web']).default('android'),
});

/**
 * Push tokens of signed-in phones. A token belongs to whoever registered it last, so a phone
 * that changes account stops receiving the previous account's notifications.
 */
export function devicesRouter(pool: Pool) {
  const r = Router();

  r.post('/', route(async (req, res) => {
    const { token, platform } = tokenInput.parse(req.body);
    await pool.query(
      `INSERT INTO device_tokens (token, user_id, platform) VALUES ($1,$2,$3)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen_at = NOW();`,
      [token, req.user!.id, platform]
    );
    res.json({ success: true });
  }));

  r.post('/unregister', route(async (req, res) => {
    const { token } = tokenInput.pick({ token: true }).parse(req.body);
    await pool.query('DELETE FROM device_tokens WHERE token = $1 AND user_id = $2;', [token, req.user!.id]);
    res.json({ success: true });
  }));

  return r;
}
