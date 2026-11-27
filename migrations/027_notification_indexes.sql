-- Migration 027: the notification list and the sync fingerprint read notifications by recipient and newest
-- first on every poll; without an index each poll scanned the whole table, which only grows.
CREATE INDEX IF NOT EXISTS idx_notifications_target_created ON notifications (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_broadcast_created ON notifications (created_at DESC) WHERE target_user_id IS NULL;
-- Deleting a committee looks its notifications up through this foreign key.
CREATE INDEX IF NOT EXISTS idx_notifications_committee ON notifications (committee_id) WHERE committee_id IS NOT NULL;
