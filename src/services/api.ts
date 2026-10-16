// Single HTTP client for the API. Every call either returns the parsed body or throws
// ApiError with a message that is safe to show; nothing is swallowed.
//
// Session storage (WEB-11): the refresh token lives only in an HttpOnly cookie that page scripts
// cannot read, so an XSS bug cannot steal a 30-day session. The short-lived access token is kept
// in memory; a page load gets a fresh one from the cookie. Tabs share the cookie and refresh one
// at a time (Web Locks), so a refresh in one tab never signs the others out.

/** Tokens from older versions, which kept both tokens in localStorage. Migrated once, then removed. */
const LEGACY_ACCESS_KEY = 'bukhari_access_token';
const LEGACY_REFRESH_KEY = 'bukhari_refresh_token';
const REFRESH_LOCK = 'bukhari-refresh';

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

let accessToken: string | null = null;

function readLegacy(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeLegacy() {
  try {
    localStorage.removeItem(LEGACY_ACCESS_KEY);
    localStorage.removeItem(LEGACY_REFRESH_KEY);
  } catch {
    // storage unavailable
  }
}

export const tokens = {
  get access() {
    return accessToken;
  },
  setAccess(token: string) {
    accessToken = token;
  },
  clear() {
    accessToken = null;
    removeLegacy();
  },
};

/** Every request says it is the web client: the server then uses the refresh cookie. */
const CLIENT_HEADERS = { 'X-Client': 'web' } as const;

async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  return locks ? locks.request(REFRESH_LOCK, fn) : fn();
}

let refreshing: Promise<boolean> | null = null;

/**
 * Gets a new access token from the refresh cookie. A token another tab already obtained while this
 * one waited for the lock is not reused (tabs keep their own access tokens); the server accepts a
 * cookie that was rotated a few seconds ago, so waiting tabs still succeed.
 */
export async function refreshTokens(): Promise<boolean> {
  refreshing ??= withRefreshLock(async () => {
    try {
      // One-time move of a session started by an older version (refresh token in localStorage).
      const legacy = readLegacy(LEGACY_REFRESH_KEY);
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...CLIENT_HEADERS },
        body: JSON.stringify(legacy ? { refreshToken: legacy } : {}),
      });
      removeLegacy();
      if (!res.ok) return false;
      const data = await res.json();
      accessToken = data.token;
      return Boolean(accessToken);
    } catch {
      return false;
    }
  }).finally(() => {
    // Callers already waiting keep the result; the next 401 starts a new refresh.
    refreshing = null;
  });
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
  const headers: Record<string, string> = { ...CLIENT_HEADERS, ...(opts.headers ?? {}) };
  if (opts.raw !== undefined) headers['Content-Type'] = opts.contentType ?? 'application/octet-stream';
  else if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    return await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      body: opts.raw !== undefined ? opts.raw : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError('تعذر الاتصال بالخادم، تحقق من اتصال الإنترنت', 0, 'network');
  }
}

export async function apiResponse(path: string, opts: RequestOptions = {}): Promise<Response> {
  let res = await send(path, opts);
  if (res.status === 401 && opts.auth !== false) {
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
