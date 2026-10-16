-- Migration 007: disable the demo accounts seeded by the old all-in-one schema.
--
-- The old schema created approved accounts 'user-admin' (super admin), 'user-head-dosari' and
-- 'user-ast-moaz' whose passwords were published in the project documents. Anyone who read them
-- could sign in, including as super admin.
--
-- An account is disabled only while its password has never been changed through the app
-- (password_changed_at IS NULL), i.e. it may still carry the published password. Accounts whose
-- password was changed through the app keep working. Disabling means: status 'rejected', no
-- password (login always fails), all access and refresh tokens invalidated. Nothing is deleted,
-- so the rows stay available for review and for the audit trail.
--
-- If this leaves no approved super admin, bootstrap one with `npm run create-admin`
-- (it ignores these legacy ids when checking for an existing super admin).

CREATE TEMP TABLE legacy_disabled ON COMMIT DROP AS
SELECT id, role, status
FROM app_users
WHERE id IN ('user-admin', 'user-head-dosari', 'user-ast-moaz')
  AND password_changed_at IS NULL
  AND (password IS NOT NULL OR status <> 'rejected');

UPDATE app_users u SET
  status = 'rejected',
  password = NULL,
  token_version = u.token_version + 1,
  failed_login_count = 0,
  locked_until = NULL,
  data = COALESCE(u.data, '{}'::jsonb) || jsonb_build_object(
    'rejectedAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'rejectedBy', 'migration 007',
    'rejectionReason', 'Legacy demo account with a published password, disabled automatically.'
  ),
  updated_at = NOW()
FROM legacy_disabled l
WHERE u.id = l.id;

UPDATE refresh_tokens SET revoked_at = NOW()
WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM legacy_disabled);

INSERT INTO audit_logs (id, user_name, user_role, action, details, status, actor_id, entity, entity_id, before_data, after_data, created_at)
SELECT
  'migration-007-' || l.id,
  'system',
  'system',
  'user.legacy_disabled',
  'Migration 007 disabled a legacy demo account with a published password',
  'success',
  NULL,
  'user',
  l.id,
  jsonb_build_object('role', l.role, 'status', l.status),
  jsonb_build_object('role', l.role, 'status', 'rejected'),
  NOW()
FROM legacy_disabled l
ON CONFLICT (id) DO NOTHING;
