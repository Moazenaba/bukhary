import fs from 'fs';
import jwt from 'jsonwebtoken';
import type { Pool } from './db.ts';
import { logger } from './logger.ts';

// Push notifications through Firebase Cloud Messaging (HTTP v1). Every notification the server
// creates (routes/notifications.ts notify) is also sent to the phones of the people it is for.
// Without FCM credentials the server runs exactly as before: notifications stay in-app only.

export interface FcmServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface PushMessage {
  title: string;
  description: string;
  type?: string;
  committeeId?: string | null;
  /** null = everyone with an approved account. */
  targetUserId?: string | null;
}

/** Sends one HTTP request; replaced in tests. */
export type PushTransport = (url: string, init: { method: string; headers: Record<string, string>; body: string }) =>
  Promise<{ status: number; json: () => Promise<any> }>;

const defaultTransport: PushTransport = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status, json: () => res.json().catch(() => ({})) };
};

let pool: Pool | null = null;
let account: FcmServiceAccount | null = null;
let transport: PushTransport = defaultTransport;
let cachedToken: { value: string; expiresAt: number } | null = null;
const inFlight = new Set<Promise<void>>();

/**
 * Reads the Firebase service account from FCM_SERVICE_ACCOUNT_JSON (the JSON itself, or base64 of
 * it) or FCM_SERVICE_ACCOUNT_PATH (a file). Returns undefined when neither is set; a value that is
 * set but unreadable stops the server, so a broken configuration is noticed at once.
 */
export function loadServiceAccount(env: NodeJS.ProcessEnv): FcmServiceAccount | undefined {
  let raw = env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw && env.FCM_SERVICE_ACCOUNT_PATH) raw = fs.readFileSync(env.FCM_SERVICE_ACCOUNT_PATH, 'utf8');
  if (!raw) return undefined;
  if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('FCM service account must contain project_id, client_email and private_key.');
  }
  return { project_id: parsed.project_id, client_email: parsed.client_email, private_key: parsed.private_key };
}

export function configurePush(p: Pool, serviceAccount: FcmServiceAccount | undefined, t?: PushTransport) {
  pool = p;
  account = serviceAccount ?? null;
  transport = t ?? defaultTransport;
  cachedToken = null;
  if (account) logger.info('push.enabled', { project: account.project_id });
}

export const pushEnabled = () => Boolean(pool && account);

/** Resolves once every push started so far has finished (tests and graceful shutdown). */
export async function flushPushes() {
  while (inFlight.size) await Promise.allSettled([...inFlight]);
}

/** Queues the push after the current request's work; failures are logged, never thrown. */
export function queuePush(message: PushMessage) {
  if (!pool || !account) return;
  const job = new Promise<void>((resolve) => setImmediate(resolve))
    .then(() => deliver(message))
    .catch((err) => logger.warn('push.failed', { message: err instanceof Error ? err.message : String(err) }))
    .finally(() => inFlight.delete(job));
  inFlight.add(job);
}

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const acct = account!;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: acct.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 },
    acct.private_key,
    { algorithm: 'RS256' }
  );
  const res = await transport('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  const body = await res.json();
  if (res.status !== 200 || !body.access_token) throw new Error(`FCM auth failed (HTTP ${res.status})`);
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000 };
  return cachedToken.value;
}

async function deliver(message: PushMessage) {
  const db = pool!;
  const { rows } = message.targetUserId
    ? await db.query(
        `SELECT d.token FROM device_tokens d JOIN app_users u ON u.id = d.user_id
         WHERE d.user_id = $1 AND u.status = 'approved';`,
        [message.targetUserId]
      )
    : await db.query(
        // A broadcast about a committee reaches only the people who see it (same rule as GET /api/notifications).
        `SELECT d.token FROM device_tokens d JOIN app_users u ON u.id = d.user_id
         WHERE u.status = 'approved' AND (
           $1::text IS NULL OR u.role IN ('super_admin', 'admin') OR u.all_committees OR u.assigned_committee_ids ? $1
           OR EXISTS (SELECT 1 FROM committees c WHERE c.id = $1
                      AND c.ceremony_details -> 'attendees' @> jsonb_build_array(jsonb_build_object('id', u.id))));`,
        [message.committeeId ?? null]
      );
  if (rows.length === 0) return;
  const bearer = await accessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${account!.project_id}/messages:send`;
  const stale: string[] = [];
  let sent = 0;
  // A few at a time, so a broadcast to many phones does not open hundreds of connections.
  for (let i = 0; i < rows.length; i += 10) {
    await Promise.all(
      rows.slice(i, i + 10).map(async ({ token }: { token: string }) => {
        const res = await transport(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: message.title, body: message.description || undefined },
              data: { type: message.type ?? 'info', committeeId: message.committeeId ?? '' },
              android: {
                priority: message.type === 'urgent' ? 'HIGH' : 'NORMAL',
                notification: { channel_id: 'bukhari_alerts', sound: 'default' },
              },
            },
          }),
        });
        if (res.status === 200) {
          sent++;
          return;
        }
        const body = await res.json();
        const code = body?.error?.details?.find((d: any) => d.errorCode)?.errorCode ?? body?.error?.status;
        // The phone uninstalled the app or the token was replaced: forget it.
        if (res.status === 404 || code === 'UNREGISTERED' || (res.status === 400 && code === 'INVALID_ARGUMENT')) stale.push(token);
        else logger.warn('push.send_failed', { status: res.status, code });
      })
    );
  }
  if (stale.length) await db.query('DELETE FROM device_tokens WHERE token = ANY($1::text[]);', [stale]);
  logger.info('push.sent', { recipients: rows.length, sent, removed: stale.length });
}
