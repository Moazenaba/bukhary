// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, onSessionExpired, refreshTokens, tokens } from '../../src/services/api';

// Replaces the network with a list of canned responses, in order.
function mockFetch(responses: Array<{ status: number; body?: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), {
      status: next.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const headers = (init?: RequestInit) => (init?.headers ?? {}) as Record<string, string>;

beforeEach(() => {
  localStorage.clear();
  tokens.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('API client', () => {
  it('sends the access token and the web client header, and returns parsed JSON', async () => {
    tokens.setAccess('access-1');
    const calls = mockFetch([{ status: 200, body: { success: true, committees: [] } }]);
    const data = await api<{ committees: unknown[] }>('/committees');
    expect(data.committees).toEqual([]);
    expect(calls[0].url).toBe('/api/committees');
    expect(headers(calls[0].init).Authorization).toBe('Bearer access-1');
    expect(headers(calls[0].init)['X-Client']).toBe('web');
    expect(calls[0].init?.credentials).toBe('same-origin');
  });

  it('refreshes once from the cookie after a 401 and retries with the new token', async () => {
    tokens.setAccess('old-access');
    const calls = mockFetch([
      { status: 401, body: { message: 'expired' } },
      { status: 200, body: { token: 'new-access' } },
      { status: 200, body: { success: true, tasks: [] } },
    ]);
    const data = await api<{ tasks: unknown[] }>('/tasks');
    expect(data.tasks).toEqual([]);
    expect(calls.map((c) => c.url)).toEqual(['/api/tasks', '/api/auth/refresh', '/api/tasks']);
    // The refresh token is never sent from script: the HttpOnly cookie carries it (WEB-11).
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({});
    expect(tokens.access).toBe('new-access');
  });

  it('never keeps tokens in localStorage', async () => {
    mockFetch([{ status: 200, body: { token: 'fresh' } }]);
    await refreshTokens();
    expect(tokens.access).toBe('fresh');
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it('moves a session from an older version (refresh token in localStorage) to the cookie once', async () => {
    localStorage.setItem('bukhari_refresh_token', 'legacy-refresh');
    localStorage.setItem('bukhari_access_token', 'legacy-access');
    const calls = mockFetch([{ status: 200, body: { token: 'migrated' } }]);
    expect(await refreshTokens()).toBe(true);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ refreshToken: 'legacy-refresh' });
    expect(localStorage.getItem('bukhari_refresh_token')).toBeNull();
    expect(localStorage.getItem('bukhari_access_token')).toBeNull();
  });

  it('concurrent refreshes share one request', async () => {
    const calls = mockFetch([{ status: 200, body: { token: 'shared' } }]);
    const [a, b] = await Promise.all([refreshTokens(), refreshTokens()]);
    expect([a, b]).toEqual([true, true]);
    expect(calls).toHaveLength(1);
  });

  it('ends the session when the refresh fails', async () => {
    tokens.setAccess('old-access');
    mockFetch([{ status: 401, body: {} }, { status: 401, body: {} }]);
    const expired = vi.fn();
    const unsubscribe = onSessionExpired(expired);
    await expect(api('/tasks')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalled();
    expect(tokens.access).toBeNull();
    unsubscribe();
  });

  it('turns server validation messages into a readable error', async () => {
    mockFetch([{ status: 400, body: { message: 'البيانات المرسلة غير صحيحة', errors: [{ path: 'x', message: 'مطلوب' }] } }]);
    const error = await api('/committees', { method: 'POST', body: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.message).toContain('مطلوب');
  });
});
