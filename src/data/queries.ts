import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { ApiError } from '../services/api';
import { AuthService } from '../services/AuthService';
import { DataService } from '../services/DataService';

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
