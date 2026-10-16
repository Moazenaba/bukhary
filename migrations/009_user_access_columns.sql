-- Migration 009: access settings become real columns, writable only by a super admin.
--
-- API-01/API-06/API-07: `allCommitteesAllowed`, `allExamsAllowed`, `allowedExamIds` and `profileId`
-- lived in the self-editable `data` JSON, and "all committees" was stored as an empty list, which
-- the server read as "none". Committee scope was checked by committee number, but numbers are only
-- unique within a course (NEW-01); scope is now a list of committee ids.
--
-- Nobody loses access on deploy: existing number assignments map to every committee with that
-- number (exactly what the old check allowed), existing teachers (unscoped until now) get all
-- committees, and exam access stays open unless an allow-list was configured.

ALTER TABLE app_users ADD COLUMN assigned_committee_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE app_users ADD COLUMN all_committees BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE app_users ADD COLUMN all_exams BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE app_users ADD COLUMN allowed_exam_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE app_users ADD COLUMN profile_id VARCHAR(255);
ALTER TABLE app_users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;

UPDATE app_users u SET assigned_committee_ids = COALESCE((
  SELECT jsonb_agg(c.id ORDER BY c.committee_number, c.id)
  FROM committees c
  WHERE jsonb_typeof(u.assigned_committees) = 'array'
    AND c.committee_number::text IN (SELECT jsonb_array_elements_text(u.assigned_committees))
), '[]'::jsonb);

UPDATE app_users SET
  all_committees = (role = 'teacher') OR COALESCE(data->>'allCommitteesAllowed', '') = 'true',
  allowed_exam_ids = CASE WHEN jsonb_typeof(data->'allowedExamIds') = 'array' THEN data->'allowedExamIds' ELSE '[]'::jsonb END,
  all_exams = NOT (
    COALESCE(jsonb_typeof(data->'allowedExamIds') = 'array' AND jsonb_array_length(data->'allowedExamIds') > 0, false)
    AND COALESCE(data->>'allExamsAllowed', '') <> 'true'
  ),
  profile_id = NULLIF(data->>'profileId', ''),
  data = COALESCE(data, '{}'::jsonb) - 'allowedExamIds' - 'allExamsAllowed' - 'allCommitteesAllowed' - 'profileId';

-- Profiles are presets the super admin applies; they also name committees by id now.
ALTER TABLE permission_profiles ADD COLUMN allowed_committee_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE permission_profiles p SET allowed_committee_ids = COALESCE((
  SELECT jsonb_agg(c.id ORDER BY c.committee_number, c.id)
  FROM committees c
  WHERE jsonb_typeof(p.allowed_committees) = 'array'
    AND c.committee_number::text IN (SELECT jsonb_array_elements_text(p.allowed_committees))
), '[]'::jsonb);
