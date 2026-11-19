-- Migration 024: temporary committee-head grants. An admin makes a sheikh the head of one or more committees for a
-- date window. While the grant is active the sheikh keeps the sheikh role and gets the head's powers on those
-- committees only; the grant is kept (never deleted) for the audit trail.
--
-- ceremony_decision: 'yes' (a ceremony will happen: the grant lasts until the ceremony is done), 'no' (none: it ends
-- with its window), 'undecided' (nobody has said: it ends with its window and the granting admin is told).
-- A decision by a higher-ranked person (admin > committee head > temporary head) is never overwritten by a lower one.
CREATE TABLE IF NOT EXISTS committee_head_grants (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  committee_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  ceremony_decision TEXT NOT NULL DEFAULT 'undecided',
  ceremony_decided_by VARCHAR(255),
  ceremony_decided_by_role TEXT,
  ceremony_decided_at TIMESTAMPTZ,
  granted_by VARCHAR(255),
  granted_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  ended_by VARCHAR(255),
  CONSTRAINT chk_head_grant_status CHECK (status IN ('active', 'ended', 'cancelled')),
  CONSTRAINT chk_head_grant_decision CHECK (ceremony_decision IN ('yes', 'no', 'undecided')),
  CONSTRAINT chk_head_grant_window CHECK (ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS idx_head_grants_user ON committee_head_grants (user_id, status);

-- Closed to Supabase's public roles like every table: only the server reads and writes (see 008).
ALTER TABLE committee_head_grants ENABLE ROW LEVEL SECURITY;
