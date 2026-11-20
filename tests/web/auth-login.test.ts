// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../src/services/AuthService';
import { tokens } from '../../src/services/api';

const store = new Map<string, string>();
const storageTarget = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, String(v)),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: (i: number) => Array.from(store.keys())[i] ?? null,
};
const storageMock = new Proxy(storageTarget, {
  get(target, prop, receiver) {
    if (prop in target) return (target as any)[prop];
    return store.get(String(prop)) ?? null;
  },
  set(target, prop, value) {
    store.set(String(prop), String(value));
    return true;
  },
  deleteProperty(target, prop) {
    return store.delete(String(prop));
  },
  ownKeys() {
    return Array.from(store.keys());
  },
  getOwnPropertyDescriptor(target, prop) {
    if (store.has(String(prop))) {
      return { configurable: true, enumerable: true, value: store.get(String(prop)) };
    }
    return undefined;
  },
});
try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storageMock,
    configurable: true,
    writable: true,
  });
} catch {}

function mockFetch(responses: Array<{ status: number; body?: unknown }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const next = responses.shift();
      if (!next) throw new Error('unexpected request');
      return new Response(next.body === undefined ? null : JSON.stringify(next.body), {
        status: next.status,
        headers: { 'Content-Type': 'application/json' },
      });
    })
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('login', () => {
  it('leaves no session behind when the account cannot be loaded after the password check', async () => {
    mockFetch([
      { status: 200, body: { success: true, token: 'access-1', user: { id: 'u1' } } },
      { status: 500, body: { success: false, message: 'حدث خطأ غير متوقع في الخادم' } },
    ]);

    const result = await AuthService.login('0500000000', 'Passw0rd-x');

    expect(result.success).toBe(false);
    expect(tokens.access).toBeNull();
    expect(AuthService.getCurrentUser()).toBeNull();
  });

  it('shows the server message for a refused login and stores nothing', async () => {
    mockFetch([{ status: 401, body: { success: false, message: 'بيانات الدخول غير صحيحة' } }]);

    const result = await AuthService.login('0500000000', 'wrong');

    expect(result).toEqual({ success: false, error: 'بيانات الدخول غير صحيحة' });
    expect(tokens.access).toBeNull();
  });
});
