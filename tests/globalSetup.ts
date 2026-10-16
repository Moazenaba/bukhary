import pg from 'pg';
import { adminUrl, TEST_DB_URL } from './helpers.ts';

// Fails fast with a clear message when the disposable test Postgres is not running.
export default async function setup() {
  const client = new pg.Client({ connectionString: adminUrl(TEST_DB_URL), connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
  } catch (err: any) {
    throw new Error(
      `Cannot reach the test database at ${adminUrl(TEST_DB_URL)} (${err.message}). ` +
        'Start a local Postgres (see README "Running tests") or set TEST_DATABASE_URL.'
    );
  } finally {
    await client.end().catch(() => {});
  }
}
