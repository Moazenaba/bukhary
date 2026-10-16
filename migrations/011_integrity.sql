-- Migration 011: integrity clean-up (API-19, API-20).
--
-- Nothing is deleted outright: rows that break a rule are copied to scoring_records_quarantine
-- first, so they can be reviewed and restored by hand.

-- One score per (committee, student, question). Older duplicates are quarantined; the newest stays.
CREATE TABLE scoring_records_quarantine (LIKE scoring_records INCLUDING DEFAULTS);
ALTER TABLE scoring_records_quarantine ADD COLUMN quarantined_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE scoring_records_quarantine ADD COLUMN quarantine_reason TEXT NOT NULL DEFAULT '';

INSERT INTO scoring_records_quarantine
SELECT s.*, NOW(), 'duplicate score'
FROM scoring_records s
JOIN (
  SELECT id, row_number() OVER (
    PARTITION BY committee_id, lower(btrim(student_name)), question_number
    ORDER BY updated_at DESC NULLS LAST, id DESC) AS rn
  FROM scoring_records
) r ON r.id = s.id
WHERE r.rn > 1;
DELETE FROM scoring_records WHERE id IN (SELECT id FROM scoring_records_quarantine);

-- Scores whose committee no longer exists.
INSERT INTO scoring_records_quarantine
SELECT s.*, NOW(), 'committee missing' FROM scoring_records s
WHERE s.committee_id IS NULL OR NOT EXISTS (SELECT 1 FROM committees c WHERE c.id = s.committee_id);
DELETE FROM scoring_records s
WHERE s.committee_id IS NULL OR NOT EXISTS (SELECT 1 FROM committees c WHERE c.id = s.committee_id);

CREATE UNIQUE INDEX uq_scoring_committee_student_question
  ON scoring_records (committee_id, lower(btrim(student_name)), question_number);

-- Dangling references on nullable columns are cleared (the foreign keys would do the same on delete).
UPDATE schedule_tasks t SET committee_id = NULL
  WHERE committee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM committees c WHERE c.id = t.committee_id);
UPDATE schedule_tasks t SET assigned_assistant_id = NULL
  WHERE assigned_assistant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM app_users u WHERE u.id = t.assigned_assistant_id);
UPDATE summer_course_rows r SET committee_id = NULL
  WHERE committee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM committees c WHERE c.id = r.committee_id);
UPDATE summer_course_rows r SET course_id = NULL
  WHERE course_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.id = r.course_id);
UPDATE notifications n SET committee_id = NULL
  WHERE committee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM committees c WHERE c.id = n.committee_id);
UPDATE committees m SET course_id = NULL
  WHERE course_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.id = m.course_id);

ALTER TABLE committees VALIDATE CONSTRAINT fk_committees_course;
ALTER TABLE schedule_tasks VALIDATE CONSTRAINT fk_tasks_committee;
ALTER TABLE schedule_tasks VALIDATE CONSTRAINT fk_tasks_assistant;
ALTER TABLE scoring_records VALIDATE CONSTRAINT fk_scoring_committee;
ALTER TABLE summer_course_rows VALIDATE CONSTRAINT fk_summer_rows_committee;
ALTER TABLE summer_course_rows VALIDATE CONSTRAINT fk_summer_rows_course;
ALTER TABLE notifications VALIDATE CONSTRAINT fk_notifications_committee;

-- Denormalised committee numbers follow the committee row (the API keeps them in step from now on).
UPDATE schedule_tasks t SET committee_number = c.committee_number
  FROM committees c WHERE c.id = t.committee_id AND t.committee_number IS DISTINCT FROM c.committee_number;
UPDATE scoring_records s SET committee_number = c.committee_number
  FROM committees c WHERE c.id = s.committee_id AND s.committee_number IS DISTINCT FROM c.committee_number;

SELECT lock_public_schema();
