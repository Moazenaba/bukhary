# Release and operations runbook

How to ship the remediation release safely, and the operator steps that code cannot do.
Plan and evidence: `docs/production-audit/REMEDIATION_PLAN.md` (workspace).

## 1. Before the first production deploy (operator, once)

Run these with production access. Record the answers in the release notes.

1. **Legacy demo accounts (API-02).** Read-only check:
   ```sql
   SELECT id, role, status, password_changed_at FROM app_users
   WHERE id IN ('user-admin', 'user-head-dosari', 'user-ast-moaz');
   ```
   Migration 007 disables any of them whose password was never changed through the app. If one is
   approved now, look for its activity before deploying:
   ```sql
   SELECT created_at, action, entity, entity_id FROM audit_logs
   WHERE actor_id IN ('user-admin', 'user-head-dosari', 'user-ast-moaz') ORDER BY created_at DESC LIMIT 200;
   ```
   If `user-admin` was the only super admin, run `npm run create-admin:prod` after the migration.
2. **Database exposure (API-15).** In Supabase → Project Settings → Data API: turn the Data API off,
   or remove `public` from the exposed schemas. Migration 008 also enables row-level security on every
   table and revokes `anon`/`authenticated` privileges. Check afterwards:
   ```sql
   SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND NOT relrowsecurity;
   ```
   It must return no rows. A request with the anon key to `<project>.supabase.co/rest/v1/app_users`
   must return no data.
3. **Secrets (API-24, API-30).** Keep production secrets out of developer machines: the developer
   `.env` should point at a local database (the scripts refuse a remote one without `--remote`).
   Move any local production dump to encrypted storage and delete the plain file. Rotate
   `JWT_SECRET` and the database password **after** the new Android build is installed (step 3.3),
   because rotation signs everyone out.
4. **Branch protection.** In both GitHub repositories, require the `CI` checks on `main`.

## 2. Configuration added in this release

| Variable | Default | Meaning |
|---|---|---|
| `ACCESS_TOKEN_TTL` | `15m` | Access token lifetime. Keep `8h` until most phones run Android versionCode 2 (older builds do not refresh `/api/auth/me`). |
| `ENFORCE_PASSWORD_CHANGE` | `true` | After an admin reset, only account endpoints work until the user picks a new password. Older Android builds cannot change passwords; such users can do it on the web. |
| `STRICT_PERMISSION_IDS` | `false` | Reject unknown permission ids (400) instead of dropping them. Turn on after older Android builds are gone. |
| `LEGACY_STAGE_PATCH` | `true` | Accept stage changes through `PATCH /api/committees/:id` (older Android builds). Turn off after they are gone. |
| `MIN_ANDROID_VERSION_CODE` | `0` | Oldest Android versionCode accepted; older builds get 426 "update the app" and keep their writes queued. |
| `API_RATE_LIMIT_PER_MINUTE` | `600` | Requests per minute per IP for the whole API. In-memory: with several instances the limit multiplies. |

`JWT_SECRET` is now required in every mode except automated tests.

## 3. Rollout order

The server must accept what the installed Android app sends until the new app is installed. Its
offline queue may hold requests made days earlier.

1. **Back up**, then run `npm run migrate:prod` (migrations 007–012), then deploy the server and
   web app. Keep `ACCESS_TOKEN_TTL=8h`, `STRICT_PERMISSION_IDS=false` and `LEGACY_STAGE_PATCH=true`.
   Web users are moved to the cookie session on their next page load; nobody has to sign in again.
2. **Publish Android versionCode 2.** It keeps unsent work across sign-outs, shows refused writes,
   sends idempotency keys, uses workflow actions and committee ids, and supports password changes.
3. **When most devices run versionCode 2** (Play Console statistics): set
   `MIN_ANDROID_VERSION_CODE=2`, `ACCESS_TOKEN_TTL=15m`, `STRICT_PERMISSION_IDS=true`,
   `LEGACY_STAGE_PATCH=false`, then rotate `JWT_SECRET`.

Android release builds for users must be signed: `./gradlew assembleRelease -PrequireReleaseSigning=true
-PAPI_BASE_URL=https://...` with `KEYSTORE_PATH`, `STORE_PASSWORD` and `KEY_PASSWORD` set. Raise
`versionCode` in `app/build.gradle.kts` for every release.

## 4. Backups (API-37)

Supabase's own backups and the logical dumps in `docs/BACKUP_RESTORE.md` (workspace) both apply.
`npm run backup -- --remote` now passes the password through `PGPASSWORD`, not the command line.
Schedule it daily on the operator's machine (Windows Task Scheduler or cron), copy the file to
encrypted off-site storage, keep 14 daily and one monthly file, and run the restore drill against a
copy of production at least once a quarter.

## 5. Deployment and rollback (API-38)

The repository ships a `Dockerfile` (non-root, health check on `/api/ready`). The hosting target is
not in the repository; whichever is used must:

- run migrations as a separate release step, before the new version starts;
- route traffic only when `/api/ready` returns 200;
- keep the previous image so a rollback is "start the previous image" (migrations are additive, so the
  previous server runs against the new schema);
- set `TRUST_PROXY` to the number of proxies in front of the app, so rate limits see real client IPs.

## 6. What stays open

See the "Remaining work" section of the remediation plan: items that need a decision, a service
(SMS verification, object storage, a shared rate-limit store, an error tracker) or a device to test on.
