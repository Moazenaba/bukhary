// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useCacheSetter, useServerData } from '../../src/data/queries';
import { DataService } from '../../src/services/DataService';

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCacheSetter', () => {
  it('accepts a value or an updater, like a React state setter, and writes to the shared cache', () => {
    const client = new QueryClient();
    const key = ['bukhari-data', 'tasks', 'u1'];
    client.setQueryData(key, [{ id: 'a' }]);

    const { result } = renderHook(() => useCacheSetter<{ id: string }[]>(key, []), { wrapper: wrapperFor(client) });

    act(() => result.current((prev) => [...prev, { id: 'b' }]));
    expect(client.getQueryData(key)).toEqual([{ id: 'a' }, { id: 'b' }]);

    act(() => result.current([{ id: 'only' }]));
    expect(client.getQueryData(key)).toEqual([{ id: 'only' }]);
  });

  it('starts from the empty value when nothing is cached yet', () => {
    const client = new QueryClient();
    const key = ['bukhari-data', 'books', 'u2'];
    const { result } = renderHook(() => useCacheSetter<string[]>(key, []), { wrapper: wrapperFor(client) });
    act(() => result.current((prev) => [...prev, 'كتاب']));
    expect(client.getQueryData(key)).toEqual(['كتاب']);
  });
});

describe('useServerData', () => {
  it('does not fetch anything before someone is logged in', async () => {
    const spy = vi.spyOn(DataService, 'getCommittees').mockResolvedValue([]);
    const client = new QueryClient();
    renderHook(() => useServerData(undefined), { wrapper: wrapperFor(client) });
    await new Promise((r) => setTimeout(r, 20));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('keys the cache by user, so one account never reuses another account data', async () => {
    const spy = vi.spyOn(DataService, 'getCommittees').mockResolvedValue([{ id: 'c1' } as any]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(({ id }: { id?: string }) => useServerData(id), {
      initialProps: { id: 'alice' },
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(result.current.queries.committees.isSuccess).toBe(true));
    expect(client.getQueryData(['bukhari-data', 'committees', 'alice'])).toEqual([{ id: 'c1' }]);

    rerender({ id: 'bob' });
    expect(result.current.queries.committees.data).toBeUndefined();
    spy.mockRestore();
  });

  it('clears all server data when the root key is removed on logout', async () => {
    const spy = vi.spyOn(DataService, 'getCourses').mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useServerData('alice'), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.queries.courses.isSuccess).toBe(true));
    client.removeQueries({ queryKey: ['bukhari-data'] });
    expect(client.getQueryData(['bukhari-data', 'courses', 'alice'])).toBeUndefined();
    spy.mockRestore();
  });
});

describe('changedKeys (per-list live refresh)', () => {
  const base = { me: 'm', committees: 'c', tasks: 't', courses: 'k', exams: 'e', sheet: 's', users: 'u', notifications: 'n', books: 'b', settings: 'x', permissions: 'p' };
  it('reloads everything on the first look, without parts (older server) or when my account changed', async () => {
    const { changedKeys } = await import('../../src/data/queries');
    expect(changedKeys(null, base)).toBe('all');
    expect(changedKeys(base, null)).toBe('all');
    expect(changedKeys(base, { ...base, me: 'm2' })).toBe('all');
  });
  it('a changed task reloads tasks only', async () => {
    const { changedKeys } = await import('../../src/data/queries');
    const r = changedKeys(base, { ...base, tasks: 't2' });
    expect(r).not.toBe('all');
    if (r !== 'all') {
      expect([...r.names]).toEqual(['tasks']);
      expect(r.other).toBe(true);
    }
  });
  it('nothing changed: nothing to reload', async () => {
    const { changedKeys } = await import('../../src/data/queries');
    const r = changedKeys(base, { ...base });
    expect(r !== 'all' && r.names.size === 0 && !r.other).toBe(true);
  });
});
