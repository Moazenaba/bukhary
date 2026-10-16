// Single HTTP client for the API. Every call either returns the parsed body or throws
// ApiError with a message that is safe to show; nothing is swallowed. Access tokens are
// refreshed once automatically; when that fails the session-expired listeners run.

const ACCESS_KEY = 'bukhari_access_token';
const REFRESH_KEY = 'bukhari_refresh_token';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
  }
}

type Listener = () => void;
const expiredListeners = new Set<Listener>();
export function onSessionExpired(listener: Listener): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const tokens = {
  get access() {
    return read(ACCESS_KEY);
  },
  get refresh() {
    return read(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      tokens.set(data.token, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

async function toError(res: Response): Promise<ApiError> {
  let message = 'تعذر إتمام العملية، حاول مرة أخرى';
  let code: string | undefined;
  try {
    const body = await res.json();
    if (body?.message) message = body.message;
    if (body?.errors?.length) message = `${message}: ${body.errors.map((e: any) => e.message).join('، ')}`;
    code = body?.code;
  } catch {
    // not JSON
  }
  if (res.status === 403 && !code) message = 'ليس لديك صلاحية لتنفيذ هذا الإجراء';
  return new ApiError(message, res.status, code);
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Raw body (e.g. a PDF Blob); sent as-is with `contentType`. */
  raw?: BodyInit;
  contentType?: string;
  headers?: Record<string, string>;
  auth?: boolean;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.raw !== undefined) headers['Content-Type'] = opts.contentType ?? 'application/octet-stream';
  else if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth !== false && tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
  try {
    return await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.raw !== undefined ? opts.raw : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError('تعذر الاتصال بالخادم، تحقق من اتصال الإنترنت', 0, 'network');
  }
}

export async function apiResponse(path: string, opts: RequestOptions = {}): Promise<Response> {
  let res = await send(path, opts);
  if (res.status === 401 && opts.auth !== false && tokens.refresh) {
    if (await refreshTokens()) res = await send(path, opts);
  }
  if (res.status === 401 && opts.auth !== false) {
    tokens.clear();
    expiredListeners.forEach((l) => l());
  }
  if (!res.ok) throw await toError(res);
  return res;
}

export async function api<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await apiResponse(path, opts);
  return (await res.json()) as T;
}

export const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : 'حدث خطأ غير متوقع، حاول مرة أخرى';
