import type { NextFunction, Request, Response } from 'express';
import { logger } from './logger.ts';

// One detailed line per API request (shown in Vercel's logs): who called, from where, with which
// app, what was sent and why it failed. Passwords, tokens and file contents are never printed.

const SECRET_KEYS = /pass(word)?|token|secret|authorization|cookie|private_?key/i;
// People's details stay out of the hosting provider's logs: the field is named, its value is not.
const PERSONAL_KEYS = /^(phone|identifier|email|whatsapp|name|sheikhName|sheikhPhone|sheikh_name|studentName|assistantName|notes|members|attendingSheikhs|qualification|experience|availability|quranLevel|interviewNotes|rejectionReason)$/i;
const BULKY_KEYS = /base64|image|file(data|content)?$|pdf|data_?url/i;
const MAX_STRING = 200;
const MAX_ITEMS = 20;
const MAX_DEPTH = 4;

/** A copy of a request body that is safe and short enough to log. */
export function redact(value: unknown, depth = 0, key = ''): unknown {
  if (key && SECRET_KEYS.test(key)) return value == null || value === '' ? value : '[hidden]';
  if (key && PERSONAL_KEYS.test(key)) return value == null || value === '' ? value : '[personal]';
  if (typeof value === 'string') {
    if (key && BULKY_KEYS.test(key)) return `[${value.length} chars]`;
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… [${value.length} chars]` : value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return Array.isArray(value) ? `[array of ${value.length}]` : '[object]';
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((v) => redact(v, depth + 1));
    return value.length > MAX_ITEMS ? [...items, `… ${value.length - MAX_ITEMS} more`] : items;
  }
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, depth + 1, k)]));
}

export function requestLog(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    // Routers strip their mount path from req.path while they run; originalUrl keeps all of it.
    const path = req.originalUrl.split('?')[0];
    if (!path.startsWith('/api/')) return;
    const status = res.statusCode;
    const fields: Record<string, unknown> = {
      requestId: (req as any).id,
      method: req.method,
      path,
      status,
      ms: Date.now() - start,
      ip: req.ip,
      client: req.get('X-Client') || (req.get('X-App-Version-Code') ? 'android' : undefined),
      appVersion: req.get('X-App-Version-Code') || undefined,
      userAgent: req.get('User-Agent')?.slice(0, 160),
      userId: req.user?.id,
      userName: req.user?.name,
      role: req.user?.role,
    };
    if (Object.keys(req.query).length) fields.query = redact(req.query);
    if (req.method !== 'GET' && req.body && Object.keys(req.body).length) fields.body = redact(req.body);
    if (res.locals.error) fields.error = res.locals.error;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${path} ${status}`, fields);
  });
  next();
}
