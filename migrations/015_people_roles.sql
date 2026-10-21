-- Migration 015: the system manages people, with four roles.
--
-- super_admin (everything, the only role that sees admins), admin (everything else, never sees
-- other admins), committee_head (heads the committees assigned to them and staffs them with
-- sheikhs) and sheikh (sees only the committees and ceremonies assigned to them).
--
-- Teachers, assistants and auditors become sheikhs. A sheikh sees only assigned committees, so
-- the "all committees" grant that migration 009 gave every teacher is removed, and extra
-- permissions (meaningful only for committee heads) are cleared. Their sessions end so every
-- client reloads the new role.

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS chk_app_users_role;

UPDATE app_users SET
  role = 'sheikh',
  all_committees = false,
  permissions = '[]'::jsonb,
  token_version = token_version + 1,
  updated_at = NOW()
WHERE role IN ('teacher', 'assistant', 'auditor');

UPDATE sessions SET revoked_at = NOW(), revoke_reason = 'role_model_changed'
WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM app_users WHERE role = 'sheikh');
UPDATE refresh_tokens SET revoked_at = NOW(), revoke_reason = 'role_model_changed'
WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM app_users WHERE role = 'sheikh');

ALTER TABLE app_users ALTER COLUMN role SET DEFAULT 'sheikh';
ALTER TABLE app_users ADD CONSTRAINT chk_app_users_role
  CHECK (role IN ('super_admin', 'admin', 'committee_head', 'sheikh'));

-- Committees a sheikh was invited to as a ceremony attendee are looked up by user id.
CREATE INDEX IF NOT EXISTS idx_committees_ceremony_attendees
  ON committees USING GIN ((ceremony_details -> 'attendees') jsonb_path_ops);
