-- Migration 026: «الدخول بعين المستخدم» (impersonation) and manual notifications sent to many people.

-- Who really did it: set on every audit row written while an admin acts as another user.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS impersonator_id VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS impersonator_name TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_impersonator ON audit_logs (impersonator_id) WHERE impersonator_id IS NOT NULL;

-- A session opened by an admin as another user: it belongs to the target user and names the admin.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS impersonator_id VARCHAR(255);

-- One manual message to many people is stored as one row per recipient sharing a batch id.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS batch_id VARCHAR(255);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sent_by VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_notifications_batch ON notifications (batch_id) WHERE batch_id IS NOT NULL;
