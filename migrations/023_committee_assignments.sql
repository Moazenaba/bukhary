-- Migration 023: additional assignments. A person keeps their role (sheikh, committee head...) and may be
-- given an extra, scoped and time-limited job on ANOTHER committee: observing its exam or following its
-- ceremony. Permissions are composed (role + active assignments); an assignment never changes the account.
-- Ending or cancelling an assignment only changes its status; rows are kept for the audit trail.
CREATE TABLE IF NOT EXISTS committee_assignments (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  committee_id VARCHAR(255) NOT NULL REFERENCES committees(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'observer',
  task TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  starts_on DATE,
  ends_on DATE,
  assigned_by VARCHAR(255),
  assigned_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  ended_by VARCHAR(255),
  CONSTRAINT chk_assignment_kind CHECK (kind IN ('observer')),
  CONSTRAINT chk_assignment_task CHECK (task IN ('exam', 'ceremony')),
  CONSTRAINT chk_assignment_status CHECK (status IN ('active', 'ended', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON committee_assignments (user_id, status);
CREATE INDEX IF NOT EXISTS idx_assignments_committee ON committee_assignments (committee_id);
-- One active assignment of a kind of task per person and committee.
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignments_active
  ON committee_assignments (user_id, committee_id, task) WHERE status = 'active';

-- The observer's notes and report on the committee they were sent to.
CREATE TABLE IF NOT EXISTS committee_observations (
  id VARCHAR(255) PRIMARY KEY,
  assignment_id VARCHAR(255) NOT NULL REFERENCES committee_assignments(id) ON DELETE CASCADE,
  committee_id VARCHAR(255) NOT NULL REFERENCES committees(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_observations_committee ON committee_observations (committee_id, created_at);

-- Like every table: closed to Supabase's public roles; only the server reads and writes (see 008).
ALTER TABLE committee_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE committee_observations ENABLE ROW LEVEL SECURITY;
