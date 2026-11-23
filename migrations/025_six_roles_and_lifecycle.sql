-- Migration 025: six roles, the committee lifecycle and per-committee staff (docs/PLAN_ROLES_AND_FLOW.md).
--
-- Account roles: super_admin, admin, exams_manager (new: «مدير إدارة الحفلات والامتحانات»), committee_head, sheikh.
-- Committee roles live in committee_staff, one row per person and job on a committee:
--   owner («شيخ اللجنة»), observer («مراقب») and ceremony_sheikh («شيخ الحفلة»).
-- The legacy columns (app_users.assigned_committee_ids, committees.ceremony_details.attendees) are kept and
-- derived from committee_staff by the server, so older app versions keep working.

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS chk_app_users_role;
ALTER TABLE app_users ADD CONSTRAINT chk_app_users_role
  CHECK (role IN ('super_admin', 'admin', 'exams_manager', 'committee_head', 'sheikh'));

-- The committee lifecycle. New committees start as 'draft' (the server sets it); existing ones are placed where
-- their stages are, and never before 'active', so nobody loses access.
ALTER TABLE committees ADD COLUMN IF NOT EXISTS lifecycle TEXT NOT NULL DEFAULT 'active';
ALTER TABLE committees ADD CONSTRAINT chk_committee_lifecycle CHECK (lifecycle IN
  ('draft', 'sent_to_manager', 'observers_open', 'active', 'observed', 'accredited', 'ceremony_done'));
ALTER TABLE committees ADD COLUMN IF NOT EXISTS lifecycle_history JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS has_driver BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS driver_name TEXT;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS driver_phone TEXT;
UPDATE committees SET lifecycle = CASE
  WHEN COALESCE((stages -> 'ceremony' ->> 'completed')::boolean, false) THEN 'ceremony_done'
  WHEN COALESCE((stages -> 'accreditation' ->> 'completed')::boolean, false) THEN 'accredited'
  WHEN COALESCE((stages -> 'exam' ->> 'completed')::boolean, false) THEN 'observed'
  ELSE 'active' END;
CREATE INDEX IF NOT EXISTS idx_committees_lifecycle ON committees (lifecycle);

CREATE TABLE IF NOT EXISTS committee_staff (
  id VARCHAR(255) PRIMARY KEY,
  committee_id VARCHAR(255) NOT NULL REFERENCES committees(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  can_assign BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  excuse_reason TEXT,
  notified_at TIMESTAMPTZ,
  assigned_by VARCHAR(255),
  assigned_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  ended_by VARCHAR(255),
  CONSTRAINT chk_staff_role CHECK (role IN ('owner', 'observer', 'ceremony_sheikh')),
  CONSTRAINT chk_staff_status CHECK (status IN ('active', 'excused', 'removed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_committee_staff_active ON committee_staff (committee_id, user_id, role) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_committee_one_owner ON committee_staff (committee_id) WHERE role = 'owner' AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_committee_staff_user ON committee_staff (user_id, status);
CREATE INDEX IF NOT EXISTS idx_committee_staff_committee ON committee_staff (committee_id, status);
ALTER TABLE committee_staff ENABLE ROW LEVEL SECURITY;

-- Existing people move in, already notified (they were told when they were added).
-- 1) Owners: the longest-standing committee head on each committee.
INSERT INTO committee_staff (id, committee_id, user_id, role, notified_at, assigned_by_name, created_at)
SELECT 'stf_' || md5(x.cid || ':' || x.uid || ':owner'), x.cid, x.uid, 'owner', NOW(), 'نقل البيانات', NOW()
FROM (
  SELECT DISTINCT ON (c.id) c.id AS cid, u.id AS uid
  FROM app_users u
  CROSS JOIN LATERAL jsonb_array_elements_text(u.assigned_committee_ids) AS a(cid)
  JOIN committees c ON c.id = a.cid
  WHERE u.role = 'committee_head'
  ORDER BY c.id, u.created_at ASC NULLS LAST, u.id
) x;
-- 2) Everyone else on a committee: observers.
INSERT INTO committee_staff (id, committee_id, user_id, role, notified_at, assigned_by_name, created_at)
SELECT 'stf_' || md5(c.id || ':' || u.id || ':observer'), c.id, u.id, 'observer', NOW(), 'نقل البيانات', NOW()
FROM app_users u
CROSS JOIN LATERAL jsonb_array_elements_text(u.assigned_committee_ids) AS a(cid)
JOIN committees c ON c.id = a.cid
WHERE u.role IN ('committee_head', 'sheikh')
  AND NOT EXISTS (SELECT 1 FROM committee_staff s WHERE s.committee_id = c.id AND s.user_id = u.id);
-- 3) Active extra assignments: exam → observer, ceremony → ceremony sheikh (same id, so observer notes stay linked).
INSERT INTO committee_staff (id, committee_id, user_id, role, notified_at, assigned_by, assigned_by_name, created_at)
SELECT a.id, a.committee_id, a.user_id, CASE a.task WHEN 'exam' THEN 'observer' ELSE 'ceremony_sheikh' END,
       NOW(), a.assigned_by, a.assigned_by_name, a.created_at
FROM committee_assignments a
WHERE a.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM committee_staff s WHERE s.committee_id = a.committee_id AND s.user_id = a.user_id
                  AND s.role = CASE a.task WHEN 'exam' THEN 'observer' ELSE 'ceremony_sheikh' END AND s.status = 'active');
-- 4) Ceremony attendees: ceremony sheikhs.
INSERT INTO committee_staff (id, committee_id, user_id, role, notified_at, assigned_by_name, created_at)
SELECT 'stf_' || md5(c.id || ':' || (att ->> 'id') || ':ceremony'), c.id, att ->> 'id', 'ceremony_sheikh', NOW(), 'نقل البيانات', NOW()
FROM committees c
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.ceremony_details -> 'attendees', '[]'::jsonb)) AS att
JOIN app_users u ON u.id = att ->> 'id'
WHERE NOT EXISTS (SELECT 1 FROM committee_staff s WHERE s.committee_id = c.id AND s.user_id = att ->> 'id'
                  AND s.role = 'ceremony_sheikh' AND s.status = 'active');

-- Observer notes now point at a committee_staff row (old rows keep the assignment id, which the move above reused).
ALTER TABLE committee_observations DROP CONSTRAINT IF EXISTS committee_observations_assignment_id_fkey;
