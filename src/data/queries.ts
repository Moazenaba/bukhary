import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { ApiError } from '../services/api';
import { AuthService } from '../services/AuthService';
import { DataService } from '../services/DataService';
import { DEFAULT_SETTINGS, type SystemSettings } from '../types';

/** Every server-data query starts with this key, so logout can clear all of it at once. */
export const DATA_ROOT_KEY = ['bukhari-data'] as const;

// A failed request is retried once for server errors. Client errors (401, 403, 404, 400)
// are not retried: they will not change on their own.
const retryPolicy = (failureCount: number, error: unknown) =>
  !(error instanceof ApiError && error.status < 500) && failureCount < 2;

/**
 * Loads everything the logged-in user may read. Keys include the user id, so switching
 * accounts never shows the previous user's data. Nothing is fetched until someone is logged in.
 */
export function useServerData(userId: string | undefined) {
  const enabled = Boolean(userId);
  const keys = useMemo(
    () => ({
      committees: [...DATA_ROOT_KEY, 'committees', userId] as const,
      courses: [...DATA_ROOT_KEY, 'courses', userId] as const,
      exams: [...DATA_ROOT_KEY, 'exams', userId] as const,
      tasks: [...DATA_ROOT_KEY, 'tasks', userId] as const,
      notifications: [...DATA_ROOT_KEY, 'notifications', userId] as const,
      books: [...DATA_ROOT_KEY, 'books', userId] as const,
    }),
    [userId]
  );

  const committees = useQuery({ queryKey: keys.committees, queryFn: () => DataService.getCommittees(), enabled, retry: retryPolicy });
  const courses = useQuery({ queryKey: keys.courses, queryFn: () => DataService.getCourses(), enabled, retry: retryPolicy });
  // Sheikhs have no exam screen; asking would only return 403.
  const exams = useQuery({ queryKey: keys.exams, queryFn: () => (AuthService.can('exams.read') ? DataService.getExams() : Promise.resolve([])), enabled, retry: retryPolicy });
  const tasks = useQuery({ queryKey: keys.tasks, queryFn: () => DataService.getTasks(), enabled, retry: retryPolicy });
  const notifications = useQuery({ queryKey: keys.notifications, queryFn: () => DataService.getNotifications(), enabled, retry: retryPolicy });
  const books = useQuery({ queryKey: keys.books, queryFn: () => DataService.getBooks(), enabled, retry: retryPolicy });
  const queries = { committees, courses, exams, tasks, notifications, books };
  const refetchAll = () => Promise.all(Object.values(queries).map((q) => q.refetch()));

  return { keys, queries, refetchAll };
}

/**
 * Returns a setter with the same shape as a React state setter (value or updater function),
 * but it writes to the query cache, so every screen reads the same data.
 */
export function useCacheSetter<T>(queryKey: QueryKey, empty: T) {
  const queryClient = useQueryClient();
  const keyString = JSON.stringify(queryKey);
  return useCallback(
    (update: T | ((prev: T) => T)) => {
      queryClient.setQueryData<T>(queryKey, (prev) => {
        const base = prev ?? empty;
        return typeof update === 'function' ? (update as (p: T) => T)(base) : update;
      });
    },
    // The key is compared by value (its JSON), so a new array with the same contents is not a new setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, keyString, empty]
  );
}

/** Which cached lists (the second segment of their query key) each part of the server's fingerprint covers. */
export const SYNC_PART_KEYS: Record<string, string[]> = {
  committees: ['committees'],
  tasks: ['tasks'],
  courses: ['courses'],
  exams: ['exams'],
  sheet: ['summerRows'],
  users: ['assignable'],
  notifications: ['notifications'],
  books: ['books'],
  settings: ['settings'],
  permissions: [],
};

/**
 * The query-key names to reload, given the previous and current per-list fingerprints, or 'all' (first
 * look, an older server without parts, or a change to the person's own account). Lists no part names
 * (e.g. the audit log) reload on any change.
 */
export function changedKeys(prev: Record<string, string> | null, next: Record<string, string> | null): 'all' | { names: Set<string>; other: boolean } {
  if (!prev || !next || prev.me !== next.me) return 'all';
  const names = new Set<string>();
  let any = false;
  for (const [part, value] of Object.entries(next)) {
    if (part === 'me' || prev[part] === value) continue;
    any = true;
    (SYNC_PART_KEYS[part] ?? []).forEach((k) => names.add(k));
  }
  return { names, other: any };
}

/**
 * Keeps an open page current: every `intervalMs` while the tab is visible (and when it becomes
 * visible again) it asks the server for its short data fingerprint, and reloads only the lists whose
 * part changed — so changes made on another device show up without reloading the page, and a change
 * to one task does not download every committee again.
 */
export function useLiveRefresh(enabled: boolean, intervalMs = 30_000) {
  const queryClient = useQueryClient();
  const last = useRef<{ version: string; parts: Record<string, string> | null } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let running = false;
    const tick = async () => {
      if (running || document.visibilityState !== 'visible') return;
      running = true;
      try {
        const state = await DataService.getSyncState();
        const prev = last.current;
        last.current = state;
        if (prev === null || state.version === prev.version) return;
        const changed = changedKeys(prev.parts, state.parts);
        if (changed === 'all') {
          await queryClient.invalidateQueries({ queryKey: DATA_ROOT_KEY });
          return;
        }
        const known = new Set(Object.values(SYNC_PART_KEYS).flat());
        await queryClient.invalidateQueries({
          predicate: (q) => {
            const key = q.queryKey as unknown[];
            if (key[0] !== DATA_ROOT_KEY[0]) return false;
            const name = String(key[1]);
            return changed.names.has(name) || (changed.other && !known.has(name));
          },
        });
      } catch {
        // Offline or signed out: try again on the next tick.
      } finally {
        running = false;
      }
    };
    void tick();
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => void tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, intervalMs, queryClient]);
}

/** Shared settings (font, name lists, exam window, late days), with defaults until they load. */
export function useSettings(enabled = true) {
  const q = useQuery({
    queryKey: [...DATA_ROOT_KEY, 'settings'],
    queryFn: () => DataService.getSettings(),
    enabled,
    retry: retryPolicy,
    staleTime: 60_000,
  });
  return { settings: { ...DEFAULT_SETTINGS, ...(q.data ?? {}) } as SystemSettings, query: q };
}
