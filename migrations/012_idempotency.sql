-- Migration 012: idempotent writes for the Android offline queue (MOB-04).
--
-- A queued request carries an Idempotency-Key. The first response is stored; a retry with the
-- same key (after a timeout, or from a second flusher) gets the stored response instead of
-- applying the change twice. Keys are purged after 7 days by the server.

CREATE TABLE idempotency_keys (
  user_id VARCHAR(255) NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  key VARCHAR(100) NOT NULL,
  method VARCHAR(10) NOT NULL,
  path TEXT NOT NULL,
  status INT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);
CREATE INDEX idx_idempotency_created ON idempotency_keys(created_at);

SELECT lock_public_schema();
