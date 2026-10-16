-- Migration 002: real columns become the only source of truth.
--
-- Before this, every write also stored the whole client object in the `data` JSONB column,
-- and some write paths (bulk save, PATCH) updated `data` but not all columns. In those cases
-- `data` holds the newest value, so it is copied into the columns here. After this migration
-- the API reads columns only; `data` keeps just documented extras (user profile fields,
-- exam sample questions).

-- Committees: bulk save and old PATCH updated these only in `data`.
UPDATE committees SET
  association_name = CASE WHEN data ? 'associationName' THEN NULLIF(data->>'associationName', '') ELSE association_name END,
  members = CASE WHEN jsonb_typeof(data->'members') = 'array' THEN data->'members' ELSE members END,
  general_notes = CASE WHEN data ? 'generalNotes' THEN COALESCE(data->>'generalNotes', '') ELSE general_notes END,
  sheikh_phone = CASE WHEN data ? 'sheikhPhone' THEN NULLIF(data->>'sheikhPhone', '') ELSE sheikh_phone END,
  sheikh_country = CASE WHEN data ? 'sheikhCountry' THEN NULLIF(data->>'sheikhCountry', '') ELSE sheikh_country END,
  is_women_committee = CASE WHEN jsonb_typeof(data->'isWomenCommittee') = 'boolean'
    THEN (data->>'isWomenCommittee')::boolean ELSE is_women_committee END,
  scoring_details = CASE WHEN jsonb_typeof(data->'scoringDetails') = 'object' THEN data->'scoringDetails' ELSE scoring_details END,
  aggregation_details = CASE WHEN jsonb_typeof(data->'aggregationDetails') = 'object' THEN data->'aggregationDetails' ELSE aggregation_details END,
  ceremony_details = CASE WHEN jsonb_typeof(data->'ceremonyDetails') = 'object' THEN data->'ceremonyDetails' ELSE ceremony_details END,
  received_by_assistant = CASE WHEN jsonb_typeof(data->'receivedByAssistant') = 'object' THEN data->'receivedByAssistant' ELSE received_by_assistant END,
  exam_approved_by = CASE WHEN jsonb_typeof(data->'examApprovedBy') = 'object' THEN data->'examApprovedBy' ELSE exam_approved_by END,
  created_date = COALESCE(created_date, NULLIF(data->>'createdDate', '')),
  created_at_time = COALESCE(created_at_time, NULLIF(data->>'createdAtTime', ''))
WHERE data IS NOT NULL AND data <> '{}'::jsonb;
UPDATE committees SET data = '{}'::jsonb;

-- Sheet rows: bulk save updated only number/sheikh/place/book in columns; the rest was in `data`.
UPDATE summer_course_rows SET
  students_count = CASE WHEN jsonb_typeof(data->'students_count') = 'number' THEN (data->>'students_count')::numeric::int ELSE students_count END,
  delivered = CASE WHEN jsonb_typeof(data->'delivered') = 'boolean' THEN (data->>'delivered')::boolean ELSE delivered END,
  corrected = CASE WHEN jsonb_typeof(data->'corrected') = 'boolean' THEN (data->>'corrected')::boolean ELSE corrected END,
  reviewed = CASE WHEN jsonb_typeof(data->'reviewed') = 'boolean' THEN (data->>'reviewed')::boolean ELSE reviewed END,
  announced = CASE WHEN jsonb_typeof(data->'announced') = 'boolean' THEN (data->>'announced')::boolean ELSE announced END,
  ceremony = CASE WHEN jsonb_typeof(data->'ceremony') = 'boolean' THEN (data->>'ceremony')::boolean ELSE ceremony END,
  struck_out = CASE WHEN jsonb_typeof(data->'struck_out') = 'boolean' THEN (data->>'struck_out')::boolean ELSE struck_out END,
  uncertain = CASE WHEN jsonb_typeof(data->'uncertain') = 'boolean' THEN (data->>'uncertain')::boolean ELSE uncertain END,
  notes = CASE WHEN data ? 'notes' THEN NULLIF(data->>'notes', '') ELSE notes END,
  committee_id = CASE WHEN data ? 'committeeId' THEN NULLIF(data->>'committeeId', '') ELSE committee_id END,
  course_id = CASE WHEN data ? 'courseId' THEN NULLIF(data->>'courseId', '') ELSE course_id END
WHERE data IS NOT NULL AND data <> '{}'::jsonb;
UPDATE summer_course_rows SET data = '{}'::jsonb;

-- Courses and tasks were always written to columns and `data` together.
UPDATE courses SET data = '{}'::jsonb;
UPDATE schedule_tasks SET data = '{}'::jsonb;
UPDATE scoring_records SET data = '{}'::jsonb;
UPDATE notifications SET data = '{}'::jsonb;

-- Exams keep only their sample questions in `data`.
UPDATE exams SET data = CASE WHEN jsonb_typeof(data->'sampleQuestions') = 'array'
  THEN jsonb_build_object('sampleQuestions', data->'sampleQuestions') ELSE '{}'::jsonb END;

-- Users keep only profile fields in `data`; anything that affects access lives in columns.
UPDATE app_users SET data = (
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  FROM jsonb_each(COALESCE(app_users.data, '{}'::jsonb))
  WHERE key IN ('whatsapp', 'nationalId', 'profileId', 'allowedExamIds', 'allExamsAllowed', 'allCommitteesAllowed',
                'quranLevel', 'qualification', 'experience', 'availability', 'preferredCommittees',
                'interviewDate', 'interviewNotes', 'rejectionReason', 'rejectedAt', 'rejectedBy')
);
