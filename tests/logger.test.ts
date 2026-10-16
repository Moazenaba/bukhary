import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportError } from '../server/logger.ts';

afterEach(() => {
  delete process.env.ERROR_REPORT_URL;
  vi.unstubAllGlobals();
});

describe('error reporting', () => {
  it('posts the error context to ERROR_REPORT_URL without request bodies or secrets', async () => {
    process.env.ERROR_REPORT_URL = 'https://errors.example.test/ingest';
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    reportError('request.unhandled', { requestId: 'r1', path: '/api/x', message: 'boom', stack: 'at x' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://errors.example.test/ingest');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ event: 'request.unhandled', requestId: 'r1', message: 'boom' });
    expect(body.password).toBeUndefined();
    expect(body.authorization).toBeUndefined();
  });

  it('does nothing extra when no reporter is configured', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    reportError('request.unhandled', { message: 'boom' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
