-- Migration 010: server-side sessions (API-09, WEB-11).
--
-- Each login creates a session; the access token carries its id (sid) and is rejected once the
-- session is revoked, so logout takes effect immediately instead of when the token expires.
-- Refresh tokens rotate within their session. A rotated token presented again after a short
-- grace period (two tabs refreshing at once) means it was copied, so the whole session is revoked.

CREATE TABLE sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

ALTER TABLE refresh_tokens ADD COLUMN session_id VARCHAR(64) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE refresh_tokens ADD COLUMN revoke_reason TEXT;

-- Every existing refresh token becomes its own session, so nobody is signed out by the deploy.
INSERT INTO sessions (id, user_id, created_at, last_used_at, revoked_at, revoke_reason, user_agent)
SELECT id, user_id, created_at, created_at, revoked_at,
       CASE WHEN revoked_at IS NULL THEN NULL ELSE 'legacy' END, user_agent
FROM refresh_tokens;
UPDATE refresh_tokens SET session_id = id, revoke_reason = CASE WHEN revoked_at IS NULL THEN NULL ELSE 'legacy' END;
ALTER TABLE refresh_tokens ALTER COLUMN session_id SET NOT NULL;
CREATE INDEX idx_refresh_tokens_session ON refresh_tokens(session_id);

-- API-21: expired tokens are purged by the server; this keeps the purge cheap.
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

SELECT lock_public_schema();
