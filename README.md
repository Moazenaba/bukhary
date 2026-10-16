# Bukhari Competition System — Web app and API

One Node.js process serves the REST API (`/api/*`) used by both the web app and the Android
app, and the React web app itself. Data lives in PostgreSQL (Supabase in production).

```
server.ts               entry point (API + static web app / Vite in development)
server/                 API: config, db, auth, policy (permissions), routes/
migrations/             versioned SQL migrations (001_baseline.sql, ...)
scripts/                migrate.ts, create-admin.ts
src/                    React web app
tests/                  API integration tests (run against a disposable Postgres)
```

## Requirements
- Node.js 22+
- PostgreSQL 15+ (Supabase or local)

## Configuration
Copy `.env.example` to `.env` and fill it in. Required in production: `DATABASE_URL`,
`DATABASE_CA_CERT_PATH` (the database certificate is verified), `JWT_SECRET` (32+ random chars).

## First-time setup
```bash
npm ci
npm run migrate                 # creates/updates the schema; never inserts demo data (local DB only; -- --remote otherwise)
ADMIN_NAME="..." ADMIN_PHONE="..." ADMIN_PASSWORD="..." npm run create-admin
npm run dev                     # http://localhost:3000
```
There is no seeded or demo data. Everything — courses, committees, users — is created in the app
by the super admin.

## Production
```bash
npm ci && npm run build         # dist/ (web app) + dist-server/ (server bundle)
npm run migrate:prod            # release step, before starting the new version
npm start                       # NODE_ENV defaults to production in the bundle
```
Or with Docker: `docker build -t bukhari .`, then run `npm run migrate:prod` once per release
and start the container. Health endpoints: `GET /api/health` (process up) and `GET /api/ready`
(database reachable and no pending migrations — use this for load-balancer checks).

The server refuses to start while migrations are pending, and never changes the schema itself.
Release order, rollout switches and operator checks: [docs/RELEASE.md](docs/RELEASE.md).

### Upgrading an existing (pre-migrations) database
1. Take a backup (Supabase: Database > Backups, or `pg_dump`).
2. Run the duplicate checks listed at the top of `migrations/003_integrity.sql`; fix any rows they return.
3. `npm run migrate` — migration 001 matches the old schema, 002 moves values out of the legacy
   `data` JSON into real columns, 003 adds constraints and moves exam PDFs into `exam_files`,
   004 adds shared settings tables.
4. The old schema seeded demo accounts with **publicly known passwords** (`user-admin`,
   `user-head-dosari`, `user-ast-moaz`) plus a demo course/committee/exam. Migration 007 disables
   those accounts (status `rejected`, no password, sessions revoked) unless their password was
   changed through the app; nothing is deleted. If that leaves no super admin, run
   `npm run create-admin` — it ignores those legacy accounts.

## Tests
Tests need a throwaway PostgreSQL; they drop and recreate databases whose names end in `_test`.
```bash
# example: a private cluster on port 55432
initdb -D ./.pgtest -U postgres -A trust && pg_ctl -D ./.pgtest -o "-p 55432" start
npm test                        # uses TEST_DATABASE_URL, default postgresql://postgres@localhost:55432/bukhari_test
npm run lint                    # TypeScript type check
```

## Permissions
Who may do what is defined once in `server/policy.ts` and enforced on every request.
`GET /api/auth/me` returns the evaluated permissions so the web and mobile apps only show
actions the server will accept. Committee heads and assistants can change only the committees
assigned to them; auditors are read-only; exam PDFs can be downloaded only by super admins and
committee heads.
