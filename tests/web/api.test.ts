// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, onSessionExpired, tokens } from '../../src/services/api';

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

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('API client', () => {
  it('sends the access token and returns parsed JSON', async () => {
    tokens.set('access-1', 'refresh-1');
    const calls = mockFetch([{ status: 200, body: { success: true, committees: [] } }]);
    const data = await api<{ committees: unknown[] }>('/committees');
    expect(data.committees).toEqual([]);
    expect(calls[0].url).toBe('/api/committees');
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
  });

  it('refreshes once after a 401 and retries the request with the new token', async () => {
    tokens.set('old-access', 'refresh-1');
    const calls = mockFetch([
      { status: 401, body: { message: 'expired' } },
      { status: 200, body: { token: 'new-access', refreshToken: 'refresh-2' } },
      { status: 200, body: { success: true, tasks: [] } },
    ]);
    const data = await api<{ tasks: unknown[] }>('/tasks');
    expect(data.tasks).toEqual([]);
    expect(calls.map((c) => c.url)).toEqual(['/api/tasks', '/api/auth/refresh', '/api/tasks']);
    expect(tokens.access).toBe('new-access');
    expect(tokens.refresh).toBe('refresh-2');
  });

  it('ends the session when the refresh fails', async () => {
    tokens.set('old-access', 'revoked');
    mockFetch([{ status: 401, body: {} }, { status: 401, body: {} }]);
    const expired = vi.fn();
    const unsubscribe = onSessionExpired(expired);
    await expect(api('/tasks')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalled();
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
