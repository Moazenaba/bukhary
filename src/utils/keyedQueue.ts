/**
 * Runs async jobs one after another per key (WEB-10): two quick edits of the same committee are
 * sent in order, the second using the version the first returned, instead of both sending the
 * same version and the second being refused as a conflict. Different keys run in parallel.
 */
export function createKeyedQueue() {
  const tails = new Map<string, Promise<unknown>>();
  return {
    run<T>(key: string, job: () => Promise<T>): Promise<T> {
      const previous = tails.get(key) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(job);
      tails.set(key, next);
      next
        .finally(() => {
          if (tails.get(key) === next) tails.delete(key);
        })
        .catch(() => undefined);
      return next;
    },
    pending: (key: string) => tails.has(key),
  };
}
