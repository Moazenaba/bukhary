// Developer scripts (`npm run migrate`, `npm run create-admin`) load .env, which on an operator's
// machine may point at production. They refuse a non-local database unless the operator says so
// explicitly. The production bundles (`*:prod`, run in the release step) are meant for the real
// database and are not guarded.

declare const __PRODUCTION_BUILD__: boolean | undefined;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function databaseHost(databaseUrl: string | undefined): string {
  if (!databaseUrl) return '';
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return '';
  }
}

export function assertLocalDatabaseOrConfirmed(databaseUrl: string | undefined, argv: string[] = process.argv): void {
  if (typeof __PRODUCTION_BUILD__ !== 'undefined' && __PRODUCTION_BUILD__) return;
  const host = databaseHost(databaseUrl);
  if (LOCAL_HOSTS.has(host)) return;
  if (argv.includes('--remote')) {
    console.warn(`Using the remote database at ${host || '(unknown host)'} (--remote).`);
    return;
  }
  throw new Error(
    `DATABASE_URL points at ${host || 'a non-local host'}. This script only targets a local database by default; ` +
      'add "-- --remote" if you really mean that database.'
  );
}
