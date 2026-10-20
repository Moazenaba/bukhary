-- Migration 013: push notifications (FCM).
--
-- Each signed-in phone registers its Firebase Cloud Messaging token. A notification created on
-- the server (server/routes/notifications.ts notify) is also pushed to the phones of the people it
-- is for. A token belongs to the account that registered it last; it is removed when the user
-- signs out, when the account is deleted, and when Firebase says it is no longer valid.

CREATE TABLE device_tokens (
  token VARCHAR(4096) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL DEFAULT 'android',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_device_tokens_user ON device_tokens(user_id);

SELECT lock_public_schema();
