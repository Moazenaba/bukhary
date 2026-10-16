import type { NextFunction, Request, RequestHandler, Response } from 'express';
import crypto from 'crypto';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { logger, reportError } from './logger.ts';

/** An error whose message is safe to show to the client. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, 'bad_request', details);
export const forbidden = (message = 'ليس لديك صلاحية لتنفيذ هذا الإجراء') => new HttpError(403, message, 'forbidden');
export const notFound = (message = 'العنصر غير موجود') => new HttpError(404, message, 'not_found');
export const conflict = (message: string) => new HttpError(409, message, 'conflict');

/** Wraps an async route so rejected promises reach the error handler. */
export function route(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  return schema.parse(value);
}

// A client may pass its own request id for tracing; anything unusual is replaced (API-25).
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export function requestId(req: Request, res: Response, next: NextFunction) {
  const sent = req.headers['x-request-id'];
  const id = typeof sent === 'string' && REQUEST_ID_PATTERN.test(sent) ? sent : crypto.randomUUID();
  (req as any).id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

// Postgres error codes that are the client's fault, mapped to safe messages.
const PG_CLIENT_ERRORS: Record<string, { status: number; message: string }> = {
  '23505': { status: 409, message: 'يوجد سجل آخر بنفس البيانات (قيمة مكررة)' },
  '23503': { status: 400, message: 'السجل يشير إلى عنصر غير موجود أو مرتبط بسجلات أخرى' },
  '23514': { status: 400, message: 'قيمة غير مسموح بها' },
  '22P02': { status: 400, message: 'صيغة بيانات غير صحيحة' },
  '22007': { status: 400, message: 'صيغة تاريخ غير صحيحة' },
};

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const reqId = (req as any).id;
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: 'البيانات المرسلة غير صحيحة',
      errors: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      requestId: reqId,
    });
  }
  if (err instanceof HttpError) {
    // Refused actions are security events worth seeing in the logs (API-32).
    if (err.status === 403) logger.warn('request.forbidden', { requestId: reqId, path: req.path, method: req.method, userId: req.user?.id, code: err.code });
    return res.status(err.status).json({ success: false, message: err.message, code: err.code, details: err.details, requestId: reqId });
  }
  if (err instanceof URIError) {
    return res.status(400).json({ success: false, message: 'صيغة الرابط غير صحيحة', requestId: reqId });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'حجم البيانات المرسلة كبير جداً', requestId: reqId });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'صيغة JSON غير صحيحة', requestId: reqId });
  }
  const pgError = err?.code && PG_CLIENT_ERRORS[err.code];
  if (pgError) {
    logger.warn('request.db_constraint', { requestId: reqId, code: err.code, constraint: err.constraint, path: req.path });
    return res.status(pgError.status).json({ success: false, message: pgError.message, requestId: reqId });
  }
  reportError('request.unhandled', { requestId: reqId, path: req.path, method: req.method, message: err?.message, stack: err?.stack });
  res.status(500).json({ success: false, message: 'حدث خطأ غير متوقع في الخادم', requestId: reqId });
}
